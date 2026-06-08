// packages/application/src/planificacion/ProcesarTrabajoPlanificacionUseCase.ts
// H-2.7 · Orquesta la cola asíncrona de planificación (RF-2.14, ADR-003), en paralelo a la cascada
// (no la toca). Toma un job 'planificacion', genera la planificación híbrida (GenerarPlanificacionUseCase),
// corre el gate v2 determinista (INV-1) y persiste UN borrador + su traza_ia en una transacción (uow).
// INV-2/INV-3: el documento nace 'borrador'; jamás 'aprobado' sin humano.

import type {
  CatalogosPlanificacion,
  JobRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { planificacionGateV2 } from '@faro/domain';
import {
  GeneracionPlanificacionError,
  type GenerarPlanificacionUseCase,
} from './GenerarPlanificacionUseCase.js';

/** Resultado discriminado de procesar un job (espejo de ProcesarTrabajoCascadaUseCase). */
export type ResultadoProcesarPlanificacion =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarPlanificacion {
  readonly jobs: JobRepository;
  readonly generar: GenerarPlanificacionUseCase;
  /** Catálogos de referencia (datos fijos) para el gate v2 (advertir checkboxes fuera de catálogo). */
  readonly catalogos: CatalogosPlanificacion;
  readonly uow: UnidadDeTrabajo;
  /** Reintentos máximos antes de 'fallido' (incluye el intento en curso). Default 3. */
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoPlanificacionUseCase {
  private readonly jobs: JobRepository;
  private readonly generar: GenerarPlanificacionUseCase;
  private readonly catalogos: CatalogosPlanificacion;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarPlanificacion) {
    this.jobs = deps.jobs;
    this.generar = deps.generar;
    this.catalogos = deps.catalogos;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarPlanificacion> {
    const job = await this.jobs.tomarSiguientePlanificacion(workerId);
    if (job === null) return { tipo: 'sin_trabajo' };

    try {
      // Genera la planificación híbrida (OA del corpus + IA) y resuelve la plantilla/versión.
      const res = await this.generar.ejecutar(job.payload);

      // Gate v2 determinista (sin red): requeridos, OA existe, cobertura; advertencias no bloquean.
      const reporte = planificacionGateV2({
        plan: res.plan,
        plantilla: res.plantilla,
        oaCodigosCorpus: res.corpusOaCodigos,
        catalogos: this.catalogos,
      });

      // Persistencia ATÓMICA: el borrador + su traza_ia + marcarHecho en UNA transacción.
      const documentoId = await this.uow.enTransaccion(async (repos: ReposTransaccion) => {
        const doc = await repos.documentos.crearBorrador({
          tipo: 'planificacion_unidad',
          establecimientoId: res.plan.establecimiento,
          corpusVersionId: res.corpusVersionId, // versión real del corpus de la que salieron los OA (INV-4)
          payload: res.plan,
          resultadoGates: reporte,
          // 'validado' si el gate no bloquea; 'fallido' si bloquea (sigue revisable como borrador).
          estadoGeneracion: reporte.ok ? 'validado' : 'fallido',
        });
        await repos.trazas.registrar({
          documentoId: doc.id,
          corpusVersionId: res.corpusVersionId,
          modelo: res.meta.modelo,
          rutaDecision: 'planificacion/unidad',
          promptHash: '',
          recuperado: [],
          citas: [],
          evals: reporte,
          usage: res.meta.usage,
          revisor: null,
        });
        await repos.jobs.marcarHecho(job.id, doc.id);
        return doc.id;
      });

      return { tipo: 'hecho', jobId: job.id, documentoId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // Errores permanentes (input inválido: plantilla no configurada, OA inexistente) → fallido sin
      // reintentar (un reintento no cambiaría el input — CA-2.4).
      if (e instanceof GeneracionPlanificacionError && e.permanente) {
        await this.jobs.marcarFallido(job.id, mensaje);
        return { tipo: 'fallido', jobId: job.id, error: mensaje };
      }
      // Transitorios (IA, infra): reintento acotado.
      if (job.intentos < this.maxIntentos) {
        await this.jobs.reintentar(job.id, mensaje);
        return { tipo: 'reintenta', jobId: job.id, error: mensaje };
      }
      await this.jobs.marcarFallido(job.id, mensaje);
      return { tipo: 'fallido', jobId: job.id, error: mensaje };
    }
  }
}
