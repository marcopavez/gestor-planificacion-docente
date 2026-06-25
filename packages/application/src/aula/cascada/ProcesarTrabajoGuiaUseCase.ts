// packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.ts
// Tanda 1 · Orquesta la cola asíncrona de la GUÍA (espejo de ProcesarTrabajoPruebaUseCase), pero
// STANDALONE desde un OA: carga el OA del corpus publicado (OaRepository.porAsignaturaNivel) en vez
// de una planificación. Genera la guía híbrida, corre guiaGate (INV-1) y persiste UN borrador +
// traza_ia en una transacción (uow).
// INV-3: el documento nace 'borrador'. origenId omitido (no cuelga de ninguna unidad).

import type {
  JobRepository,
  OaRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { GeneracionError, guiaGate } from '@faro/domain';
import type { ContextoCascada } from './tipos.js';
import type { GenerarGuiaUseCase } from './GenerarGuiaUseCase.js';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
import { resolverIlustracionesItems } from './resolverIlustraciones.js';

/** Resultado discriminado de procesar un job de guía (espejo de ProcesarTrabajoPruebaUseCase). */
export type ResultadoProcesarGuia =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarGuia {
  readonly jobs: JobRepository;
  /** Para cargar el OA del corpus publicado (resuelve la corpus_version vigente). */
  readonly oas: OaRepository;
  readonly generar: GenerarGuiaUseCase;
  /** Resuelve las ilustraciones line-art ancladas de los ejercicios pictóricos (cache compartida). */
  readonly ilustrador: ResolverIlustracionUseCase;
  readonly uow: UnidadDeTrabajo;
  /** Reintentos máximos antes de 'fallido' (incluye el intento en curso). Default 3. */
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoGuiaUseCase {
  private readonly jobs: JobRepository;
  private readonly oas: OaRepository;
  private readonly generar: GenerarGuiaUseCase;
  private readonly ilustrador: ResolverIlustracionUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarGuia) {
    this.jobs = deps.jobs;
    this.oas = deps.oas;
    this.generar = deps.generar;
    this.ilustrador = deps.ilustrador;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarGuia> {
    const job = await this.jobs.tomarSiguienteGuia(workerId);
    if (job === null) return { tipo: 'sin_trabajo' };

    const { asignatura, nivel, oaCodigo, conocimiento, establecimiento } = job.payload;

    // Carga el OA del corpus PUBLICADO (el adapter resuelve la corpus_version vigente). Errores PERMANENTES:
    // OA inexistente en el corpus publicado (un reintento no cambiaría el input).
    const oasNivel = await this.oas.porAsignaturaNivel(asignatura, nivel);
    const oa = oasNivel.find((o) => o.codigo === oaCodigo);
    if (oa === undefined) {
      return this.fallar(
        job.id,
        `OA '${oaCodigo}' no existe en el corpus publicado de ${asignatura} ${nivel}.`,
      );
    }

    const ctx: ContextoCascada = {
      establecimiento,
      asignatura,
      nivel,
      oaSeleccionados: [
        {
          codigo: oa.codigo,
          categoria: 'basal',
          descripcion: oa.descripcion,
          // Solo incluye indicadores si el OA los trae (evita el campo vacío en el contexto).
          ...(oa.indicadores.length > 0 ? { indicadores: oa.indicadores } : {}),
        },
      ],
      corpusVersionId: oa.corpusVersionId,
    };

    try {
      // Genera la guía híbrida (explicacion/ejemplo/ejercicios → IA; resto fijo en GenerarGuiaUseCase).
      const { valor: guiaBase, meta } = await this.generar.ejecutarConMeta(ctx, conocimiento);

      // Resuelve las ilustraciones line-art de los ejercicios pictóricos (FUERA de la tx: hace red/IO).
      // El OA = el del payload. Degrada sin API key. El `desafio` (si hay) también se resuelve, junto a
      // los ejercicios, para no perder su ilustración.
      const ejerciciosResueltos = await resolverIlustracionesItems(guiaBase.ejercicios, oaCodigo, this.ilustrador);
      const desafioResuelto = guiaBase.desafio !== undefined
        ? (await resolverIlustracionesItems([guiaBase.desafio], oaCodigo, this.ilustrador))[0]
        : undefined;
      const guia = {
        ...guiaBase,
        ejercicios: ejerciciosResueltos,
        ...(desafioResuelto !== undefined ? { desafio: desafioResuelto } : {}),
      };

      // Gate determinista sin red: coherencia de ejercicios (ítem→OA, una correcta, etc.).
      const reporte = guiaGate(guia);

      // Persistencia ATÓMICA: borrador (sin origenId — guía standalone) + traza + marcarHecho.
      const documentoId = await this.uow.enTransaccion(async (repos: ReposTransaccion) => {
        const doc = await repos.documentos.crearBorrador({
          tipo: 'guia',
          establecimientoId: establecimiento,
          corpusVersionId: oa.corpusVersionId, // misma versión que cargó el OA (INV-4)
          // origenId omitido: la guía no cuelga de ninguna unidad (standalone desde el OA)
          payload: guia,
          resultadoGates: reporte,
          // 'validado' si el gate no bloquea; 'fallido' si bloquea (sigue revisable como borrador).
          estadoGeneracion: reporte.ok ? 'validado' : 'fallido',
        });
        await repos.trazas.registrar({
          documentoId: doc.id,
          corpusVersionId: oa.corpusVersionId,
          modelo: meta.modelo,
          rutaDecision: 'guia/manual',
          promptHash: '',
          recuperado: [],
          citas: [],
          evals: reporte,
          usage: meta.usage,
          revisor: null,
        });
        await repos.jobs.marcarHecho(job.id, doc.id);
        return doc.id;
      });

      return { tipo: 'hecho', jobId: job.id, documentoId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // Errores PERMANENTES de input (no cambian entre reintentos): tramo no soportado / OA ausente en el
      // contexto. No se reintentan → fallido directo (consistente con el OA-no-encontrado de arriba).
      // OJO: 'fuga_texto:*' NO es permanente (una regeneración puede salir limpia) → sigue el camino transitorio.
      const esPermanente =
        e instanceof GeneracionError &&
        (e.stopReason === 'guia_tramo_no_soportado' || e.stopReason === 'guia_sin_oa');
      // Transitorios (IA, infra, fuga de texto): reintento acotado; agotados → fallido permanente.
      if (!esPermanente && job.intentos < this.maxIntentos) {
        await this.jobs.reintentar(job.id, mensaje);
        return { tipo: 'reintenta', jobId: job.id, error: mensaje };
      }
      await this.jobs.marcarFallido(job.id, mensaje);
      return { tipo: 'fallido', jobId: job.id, error: mensaje };
    }
  }

  /** Marca el job como fallido (error permanente de input) y devuelve el resultado discriminado. */
  private async fallar(jobId: string, error: string): Promise<ResultadoProcesarGuia> {
    await this.jobs.marcarFallido(jobId, error);
    return { tipo: 'fallido', jobId, error };
  }
}
