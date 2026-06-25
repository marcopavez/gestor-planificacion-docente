// packages/application/src/aula/cascada/ProcesarTrabajoPruebaUseCase.ts
// Fase 4 · Orquesta la cola asíncrona de la PRUEBA FORMATIVA (espejo de ProcesarTrabajoPlanificacionUseCase),
// en paralelo a la cascada y a la planificación (no las toca). Toma un job 'prueba_formativa', carga la
// planificación de unidad de origen (su documento), genera la prueba híbrida (GenerarPruebaFormativaUseCase),
// corre el pedagogicalGate determinista (INV-1) y persiste UN borrador + su traza_ia en una transacción (uow).
// INV-3: el documento nace 'borrador'. La prueba cuelga de la unidad por origen_id (para el export).

import type {
  DocumentoRepository,
  JobRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { pedagogicalGate, SchemaPlanificacionUnidad } from '@faro/domain';
import type { GenerarPruebaFormativaUseCase } from './GenerarPruebaFormativaUseCase.js';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
import { resolverIlustracionesItems } from './resolverIlustraciones.js';

/** Resultado discriminado de procesar un job de prueba (espejo de ProcesarTrabajoPlanificacionUseCase). */
export type ResultadoProcesarPrueba =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarPrueba {
  readonly jobs: JobRepository;
  /** Para cargar el documento de planificación de origen (la unidad de la que deriva la prueba). */
  readonly documentos: DocumentoRepository;
  readonly generar: GenerarPruebaFormativaUseCase;
  /** Resuelve las ilustraciones line-art ancladas de los ítems pictóricos (cache compartida). */
  readonly ilustrador: ResolverIlustracionUseCase;
  readonly uow: UnidadDeTrabajo;
  /** Reintentos máximos antes de 'fallido' (incluye el intento en curso). Default 3. */
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoPruebaUseCase {
  private readonly jobs: JobRepository;
  private readonly documentos: DocumentoRepository;
  private readonly generar: GenerarPruebaFormativaUseCase;
  private readonly ilustrador: ResolverIlustracionUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarPrueba) {
    this.jobs = deps.jobs;
    this.documentos = deps.documentos;
    this.generar = deps.generar;
    this.ilustrador = deps.ilustrador;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarPrueba> {
    const job = await this.jobs.tomarSiguientePrueba(workerId);
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
      // Genera la prueba formativa (ítems + tabla anclados a OA por la IA; el resto fijo de la unidad).
      const { valor: pruebaBase, meta } = await this.generar.ejecutarConMeta(unidad);

      // Resuelve las ilustraciones line-art ancladas (FUERA de la tx: hace red/IO). El OA = primero de la
      // unidad (solo alimenta la metadata del banco). Degrada: sin API key, los ítems no ganan imagen_clave.
      const oaCodigo = unidad.oa[0]?.codigo ?? '';
      const items = await resolverIlustracionesItems(pruebaBase.items, oaCodigo, this.ilustrador);
      const prueba = { ...pruebaBase, items };

      // Gate pedagógico determinista (sin red): ítem→OA, una correcta, puntajes si hay ponderación.
      const reporte = pedagogicalGate(prueba);

      // Persistencia ATÓMICA: el borrador (origen_id = la planificación) + su traza + marcarHecho.
      const documentoId = await this.uow.enTransaccion(async (repos: ReposTransaccion) => {
        const doc = await repos.documentos.crearBorrador({
          tipo: 'prueba',
          establecimientoId: unidad.establecimiento,
          corpusVersionId, // misma versión que vio la planificación (INV-4)
          origenId: planDoc.id, // la prueba cuelga de la unidad → el export resuelve el encabezado
          payload: prueba,
          resultadoGates: reporte,
          // 'validado' si el gate no bloquea; 'fallido' si bloquea (sigue revisable como borrador).
          estadoGeneracion: reporte.ok ? 'validado' : 'fallido',
        });
        await repos.trazas.registrar({
          documentoId: doc.id,
          corpusVersionId,
          modelo: meta.modelo,
          rutaDecision: 'prueba/formativa',
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
  private async fallar(jobId: string, error: string): Promise<ResultadoProcesarPrueba> {
    await this.jobs.marcarFallido(jobId, error);
    return { tipo: 'fallido', jobId, error };
  }
}
