// packages/application/src/aula/ProcesarTrabajoCascadaUseCase.ts
// Orquestación del worker de generación asíncrona (H-PA.8, ADR-003, RF-PA.3/PA.10).
// INV-5: depende SOLO de puertos de @faro/domain (+ CascadaAulaUseCase de application); no conoce infra.
// INV-2: el LLM propone; correrGatesCascada (dentro de la cascada) corre antes de persistir.
// INV-3: los 4 documentos nacen 'borrador' (forzado por DocumentoRepository.crearBorrador y la DB).
// Atomicidad: las 4 escrituras de documento + 4 trazas + marcarHecho van en UNA transacción (uow);
//             si algo falla a mitad, se revierte TODO y el reintento del job no deja huérfanos.

import type {
  ClockPort,
  DocumentoGenerado,
  ExportPort,
  JobRepository,
  OaRepository,
  PlanificacionAnualRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { derivarContextoCascada } from './cascada/derivarContextoCascada.js';
import type { CascadaAulaUseCase } from './cascada/CascadaAulaUseCase.js';
import type { MetaArtefacto, ResultadoCascada } from './cascada/tipos.js';

/** Resultado de procesar un job (discriminado por `tipo` para que el caller decida el log/backoff). */
export type ResultadoProcesarTrabajo =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoRaizId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarTrabajo {
  // jobs (top-level): tomarSiguiente/reintentar/marcarFallido corren FUERA de la unidad de trabajo.
  readonly jobs: JobRepository;
  readonly planes: PlanificacionAnualRepository;
  readonly oas: OaRepository;
  // uow: envuelve documentos + trazas + marcarHecho en una sola transacción (atomicidad).
  readonly uow: UnidadDeTrabajo;
  readonly export: ExportPort;
  readonly cascada: CascadaAulaUseCase;
  readonly clock: ClockPort;
  /** Reintentos máximos antes de marcar 'fallido' (incluye el intento en curso). Default 3. */
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoCascadaUseCase {
  private readonly jobs: JobRepository;
  private readonly planes: PlanificacionAnualRepository;
  private readonly oas: OaRepository;
  private readonly uow: UnidadDeTrabajo;
  private readonly export: ExportPort;
  private readonly cascada: CascadaAulaUseCase;
  private readonly clock: ClockPort;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarTrabajo) {
    this.jobs = deps.jobs;
    this.planes = deps.planes;
    this.oas = deps.oas;
    this.uow = deps.uow;
    this.export = deps.export;
    this.cascada = deps.cascada;
    this.clock = deps.clock;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  /**
   * Toma un job de la cola (FOR UPDATE SKIP LOCKED) y corre la cascada de Aula completa,
   * persistiendo los 4 artefactos como borradores encadenados por origen_id + sus 4 trazas
   * dentro de UNA transacción. Devuelve un resultado discriminado; nunca lanza por un job
   * fallido (lo registra y reintenta).
   */
  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarTrabajo> {
    // tomarSiguiente abre su propia tx (SKIP LOCKED) — queda FUERA de la unidad de trabajo.
    const job = await this.jobs.tomarSiguiente(workerId);
    if (job === null) return { tipo: 'sin_trabajo' };

    try {
      // --- Trabajo SIN escrituras de DB: cargar contexto, correr la cascada y exportar el .pptx ---
      const u = await this.planes.obtenerUnidad(job.unidadPlanificadaId, job.usuarioId);
      if (u === null) {
        throw new Error(`Unidad planificada '${job.unidadPlanificadaId}' no encontrada`);
      }

      const oaCorpus = await this.oas.porAsignaturaCurso(
        u.cabecera.asignatura,
        u.cabecera.nivel,
        u.cabecera.corpusVersionId,
      );

      // derivarContextoCascada valida que los OA de la unidad existan en el corpus (defensa de gate).
      const ctx = derivarContextoCascada(u.unidad, u.cabecera, oaCorpus, this.clock.hoy());

      // INV-2: la cascada corre los gates deterministas antes de devolver el resultado.
      const res = await this.cascada.ejecutar(ctx);

      const establecimientoId = u.cabecera.establecimiento;
      const corpusVersionId = u.cabecera.corpusVersionId;

      // El .pptx se renderiza ANTES de la transacción (side-effect no-DB — INV-6): si falla,
      // no hubo ninguna escritura → el reintento del job parte limpio, sin documentos huérfanos.
      const archivo = await this.export.exportarPptx(res.deck);

      // --- Persistencia ATÓMICA: 4 borradores encadenados + 4 trazas + marcarHecho en UNA tx ---
      const raizId = await this.uow.enTransaccion(async (repos) => {
        // 1) Unidad = documento raíz de la cascada (sin origen).
        const unidadDoc = await repos.documentos.crearBorrador({
          tipo: 'planificacion_unidad',
          establecimientoId,
          usuarioId: job.usuarioId, // dueño de los 4 documentos = dueño del job (tenancy)
          corpusVersionId,
          unidadPlanificadaId: job.unidadPlanificadaId,
          payload: res.unidad,
          resultadoGates: res.gates,
          estadoGeneracion: 'validado',
        });

        // 2) Clase y 3) prueba derivan de la unidad → origen_id = unidadDoc.id.
        const claseDoc = await repos.documentos.crearBorrador({
          tipo: 'planificacion_clase',
          establecimientoId,
          usuarioId: job.usuarioId,
          corpusVersionId,
          unidadPlanificadaId: job.unidadPlanificadaId,
          origenId: unidadDoc.id,
          payload: res.clase,
          resultadoGates: res.gates,
          estadoGeneracion: 'validado',
        });

        const pruebaDoc = await repos.documentos.crearBorrador({
          tipo: 'prueba',
          establecimientoId,
          usuarioId: job.usuarioId,
          corpusVersionId,
          unidadPlanificadaId: job.unidadPlanificadaId,
          origenId: unidadDoc.id,
          payload: res.prueba,
          resultadoGates: res.gates,
          estadoGeneracion: 'validado',
        });

        // 4) Deck: el .pptx ya se rindió arriba; se guarda con origen_id = claseDoc.id.
        const deckDoc = await repos.documentos.crearBorrador({
          tipo: 'clase_deck',
          establecimientoId,
          usuarioId: job.usuarioId,
          corpusVersionId,
          unidadPlanificadaId: job.unidadPlanificadaId,
          origenId: claseDoc.id,
          payload: { deck: res.deck, pptx: { ruta: archivo.ruta, bytes: archivo.bytes } },
          resultadoGates: res.gates,
          estadoGeneracion: 'validado',
        });

        // 4 filas de traza_ia (una por artefacto) — RF-PA.10: documentoId/corpusVersionId/modelo/usage/gates.
        await this.registrarTraza(repos, unidadDoc, corpusVersionId, res, res.metadatos.unidad, 'cascada/unidad');
        await this.registrarTraza(repos, claseDoc, corpusVersionId, res, res.metadatos.clase, 'cascada/clase');
        await this.registrarTraza(repos, pruebaDoc, corpusVersionId, res, res.metadatos.prueba, 'cascada/prueba');
        await this.registrarTraza(repos, deckDoc, corpusVersionId, res, res.metadatos.deck, 'cascada/deck');

        // El documento raíz (unidad) es el ancla de la cascada para la línea de tiempo (HIL).
        await repos.jobs.marcarHecho(job.id, unidadDoc.id);
        return unidadDoc.id;
      });

      return { tipo: 'hecho', jobId: job.id, documentoRaizId: raizId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // Reintento acotado (RF-2.15): intentos ya cuenta el intento en curso (tomarSiguiente lo incrementó).
      // Va sobre el `jobs` top-level (fuera de la tx revertida).
      if (job.intentos < this.maxIntentos) {
        await this.jobs.reintentar(job.id, mensaje);
        return { tipo: 'reintenta', jobId: job.id, error: mensaje };
      }
      await this.jobs.marcarFallido(job.id, mensaje);
      return { tipo: 'fallido', jobId: job.id, error: mensaje };
    }
  }

  /** Registra una fila de traza_ia para un artefacto (auditoría inmutable — INV-4, Art. 8 bis). */
  private async registrarTraza(
    repos: ReposTransaccion,
    doc: DocumentoGenerado,
    corpusVersionId: string,
    res: ResultadoCascada,
    meta: MetaArtefacto,
    rutaDecision: string,
  ): Promise<void> {
    await repos.trazas.registrar({
      documentoId: doc.id,
      corpusVersionId,
      modelo: meta.modelo,
      rutaDecision,
      // En el flujo full-context no hay recuperación RAG ni hash de prompt persistido aún (Fase 1).
      promptHash: '',
      recuperado: [],
      citas: [],
      evals: res.gates,
      usage: meta.usage,
      revisor: null,
    });
  }
}
