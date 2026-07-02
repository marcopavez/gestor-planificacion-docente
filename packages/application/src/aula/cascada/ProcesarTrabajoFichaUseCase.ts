// packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.ts
// Ficha educativa (Plan 2) · Orquesta la cola asíncrona 'ficha_colorear'. Espejo de
// ProcesarTrabajoMaterialColorearUseCase: standalone desde un OA (carga el OA del corpus publicado),
// genera la ficha y persiste UN borrador + traza_ia en una transacción (uow). INV-3: nace 'borrador'.

import type {
  JobRepository,
  OaRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { GeneracionError } from '@faro/domain';
import type { ContextoCascada } from './tipos.js';
import type { GenerarFichaUseCase } from './GenerarFichaUseCase.js';

export type ResultadoProcesarFicha =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarFicha {
  readonly jobs: JobRepository;
  readonly oas: OaRepository;
  readonly generar: GenerarFichaUseCase;
  readonly uow: UnidadDeTrabajo;
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoFichaUseCase {
  private readonly jobs: JobRepository;
  private readonly oas: OaRepository;
  private readonly generar: GenerarFichaUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarFicha) {
    this.jobs = deps.jobs;
    this.oas = deps.oas;
    this.generar = deps.generar;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarFicha> {
    const job = await this.jobs.tomarSiguienteFicha(workerId);
    if (job === null) return { tipo: 'sin_trabajo' };

    const { establecimiento, asignatura, nivel, oaCodigo, concepto, regenerar } = job.payload;

    // Carga el OA del corpus PUBLICADO (el adapter resuelve la corpus_version vigente). PERMANENTE si falta.
    const oasNivel = await this.oas.porAsignaturaNivel(asignatura, nivel);
    const oa = oasNivel.find((o) => o.codigo === oaCodigo);
    if (oa === undefined) {
      return this.fallar(job.id, `OA '${oaCodigo}' no existe en el corpus publicado de ${asignatura} ${nivel}.`);
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
          ...(oa.indicadores.length > 0 ? { indicadores: oa.indicadores } : {}),
        },
      ],
      corpusVersionId: oa.corpusVersionId,
    };

    try {
      const { valor: ficha, meta } = await this.generar.ejecutarConMeta(ctx, {
        ...(concepto !== undefined ? { concepto } : {}),
        ...(regenerar !== undefined ? { regenerar } : {}),
      });

      // Persistencia ATÓMICA: borrador (sin origenId — ficha standalone) + traza + marcarHecho.
      const documentoId = await this.uow.enTransaccion(async (repos: ReposTransaccion) => {
        const doc = await repos.documentos.crearBorrador({
          tipo: 'ficha_colorear',
          establecimientoId: establecimiento,
          usuarioId: job.usuarioId, // dueño del documento = dueño del job (tenancy)
          corpusVersionId: oa.corpusVersionId, // misma versión que cargó el OA (INV-4)
          payload: ficha,
          estadoGeneracion: 'validado', // el schema valida en el ensamblaje; sin gate determinista extra
        });
        await repos.trazas.registrar({
          documentoId: doc.id,
          corpusVersionId: oa.corpusVersionId,
          modelo: meta.modelo,
          rutaDecision: 'ficha/colorear',
          promptHash: '',
          recuperado: [],
          citas: [],
          evals: null,
          usage: meta.usage,
          revisor: null,
        });
        await repos.jobs.marcarHecho(job.id, doc.id);
        return doc.id;
      });

      return { tipo: 'hecho', jobId: job.id, documentoId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // Permanentes (no cambian entre reintentos): tramo no soportado / sin OA. 'fuga_texto:*' y
      // 'ficha_sin_ejercicios' NO son permanentes (una regeneración puede salir limpia).
      const esPermanente =
        e instanceof GeneracionError &&
        (e.stopReason === 'ficha_tramo_no_soportado' || e.stopReason === 'ficha_sin_oa');
      if (!esPermanente && job.intentos < this.maxIntentos) {
        await this.jobs.reintentar(job.id, mensaje);
        return { tipo: 'reintenta', jobId: job.id, error: mensaje };
      }
      await this.jobs.marcarFallido(job.id, mensaje);
      return { tipo: 'fallido', jobId: job.id, error: mensaje };
    }
  }

  /** Marca el job como fallido (error permanente de input) y devuelve el resultado discriminado. */
  private async fallar(jobId: string, error: string): Promise<ResultadoProcesarFicha> {
    await this.jobs.marcarFallido(jobId, error);
    return { tipo: 'fallido', jobId, error };
  }
}
