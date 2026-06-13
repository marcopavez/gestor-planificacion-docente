// packages/application/src/aula/cascada/ProcesarTrabajoPptInfantilUseCase.ts
// Fase 3 · Orquesta la cola asíncrona del PPT INFANTIL (espejo de ProcesarTrabajoPruebaUseCase),
// en paralelo a la cascada, la planificación y la prueba (no las toca). Toma un job 'ppt_infantil',
// carga la planificación de unidad de origen (su documento), genera el deck infantil data-driven
// (GenerarPptInfantilUseCase) y persiste UN borrador + su traza_ia en una transacción (uow).
// INV-3: el documento nace 'borrador'. El deck cuelga de la unidad por origen_id (trazabilidad).
//
// SIN gate pedagógico determinista: el deck se valida con su propio SchemaClaseDeck al ensamblarse
// dentro del use case de generación (INV-1); por eso persiste 'validado' y sin resultadoGates.

import type {
  DocumentoRepository,
  JobRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { SchemaPlanificacionUnidad } from '@faro/domain';
import type { GenerarPptInfantilUseCase } from './GenerarPptInfantilUseCase.js';

/** Resultado discriminado de procesar un job de PPT infantil (espejo de ProcesarTrabajoPruebaUseCase). */
export type ResultadoProcesarPptInfantil =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarPptInfantil {
  readonly jobs: JobRepository;
  /** Para cargar el documento de planificación de origen (la unidad de la que deriva el deck). */
  readonly documentos: DocumentoRepository;
  readonly generar: GenerarPptInfantilUseCase;
  readonly uow: UnidadDeTrabajo;
  /** Reintentos máximos antes de 'fallido' (incluye el intento en curso). Default 3. */
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoPptInfantilUseCase {
  private readonly jobs: JobRepository;
  private readonly documentos: DocumentoRepository;
  private readonly generar: GenerarPptInfantilUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarPptInfantil) {
    this.jobs = deps.jobs;
    this.documentos = deps.documentos;
    this.generar = deps.generar;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarPptInfantil> {
    const job = await this.jobs.tomarSiguientePptInfantil(workerId);
    if (job === null) return { tipo: 'sin_trabajo' };

    // Carga y valida la planificación de origen. Estos son errores PERMANENTES (un reintento no
    // cambiaría el input): documento ausente, contenido no-planificación, o sin corpus_version.
    const planDoc = await this.documentos.porId(job.payload.planificacionDocumentoId);
    if (planDoc === null) {
      return this.fallar(job.id, `Planificación '${job.payload.planificacionDocumentoId}' no encontrada.`);
    }
    const parsed = SchemaPlanificacionUnidad.safeParse(planDoc.contenido);
    if (!parsed.success) {
      return this.fallar(job.id, 'El documento de origen no es una planificación de unidad válida.');
    }
    const corpusVersionId = planDoc.corpusVersionId;
    if (corpusVersionId === undefined) {
      return this.fallar(job.id, 'La planificación de origen no tiene corpus_version asociado.');
    }
    const unidad = parsed.data;

    try {
      // Genera el deck infantil (slides anclados a la unidad por la IA; tema/oa fijos de la unidad).
      // El use case revalida el deck contra SchemaClaseDeck al ensamblarlo (su gate es el schema).
      const { valor: deck, meta } = await this.generar.ejecutarConMeta(unidad);

      // Persistencia ATÓMICA: el borrador (origen_id = la planificación) + su traza + marcarHecho.
      const documentoId = await this.uow.enTransaccion(async (repos: ReposTransaccion) => {
        const doc = await repos.documentos.crearBorrador({
          tipo: 'clase_deck',
          establecimientoId: unidad.establecimiento,
          corpusVersionId, // misma versión que vio la planificación (INV-4)
          origenId: planDoc.id, // el deck cuelga de la unidad → trazabilidad / listarPorRaiz
          payload: deck,
          // Sin gate determinista del deck: nace 'validado' (lo valida SchemaClaseDeck), sin resultadoGates.
          estadoGeneracion: 'validado',
        });
        await repos.trazas.registrar({
          documentoId: doc.id,
          corpusVersionId,
          modelo: meta.modelo,
          rutaDecision: 'ppt/infantil',
          promptHash: '',
          recuperado: [],
          citas: [],
          evals: null, // el deck no corre gate determinista (lo valida su schema)
          usage: meta.usage,
          revisor: null,
        });
        await repos.jobs.marcarHecho(job.id, doc.id);
        return doc.id;
      });

      return { tipo: 'hecho', jobId: job.id, documentoId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // Transitorios (IA, infra): reintento acotado; agotados → fallido.
      if (job.intentos < this.maxIntentos) {
        await this.jobs.reintentar(job.id, mensaje);
        return { tipo: 'reintenta', jobId: job.id, error: mensaje };
      }
      await this.jobs.marcarFallido(job.id, mensaje);
      return { tipo: 'fallido', jobId: job.id, error: mensaje };
    }
  }

  /** Marca el job como fallido (error permanente de input) y devuelve el resultado discriminado. */
  private async fallar(jobId: string, error: string): Promise<ResultadoProcesarPptInfantil> {
    await this.jobs.marcarFallido(jobId, error);
    return { tipo: 'fallido', jobId, error };
  }
}
