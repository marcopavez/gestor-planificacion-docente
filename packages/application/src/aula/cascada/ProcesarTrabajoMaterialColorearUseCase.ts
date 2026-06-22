// packages/application/src/aula/cascada/ProcesarTrabajoMaterialColorearUseCase.ts
// Material para colorear (Plan 1) · Orquesta la cola asíncrona de la LÁMINA. Espejo de
// ProcesarTrabajoGuiaUseCase: standalone desde un OA (carga el OA del corpus publicado), genera la
// lámina y persiste UN borrador + traza_ia en una transacción (uow). INV-3: nace 'borrador'.

import type {
  JobRepository,
  OaRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { GeneracionError } from '@faro/domain';
import type { ContextoCascada } from './tipos.js';
import type { GenerarMaterialColorearUseCase } from './GenerarMaterialColorearUseCase.js';

export type ResultadoProcesarMaterialColorear =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarMaterialColorear {
  readonly jobs: JobRepository;
  readonly oas: OaRepository;
  readonly generar: GenerarMaterialColorearUseCase;
  readonly uow: UnidadDeTrabajo;
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoMaterialColorearUseCase {
  private readonly jobs: JobRepository;
  private readonly oas: OaRepository;
  private readonly generar: GenerarMaterialColorearUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarMaterialColorear) {
    this.jobs = deps.jobs;
    this.oas = deps.oas;
    this.generar = deps.generar;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarMaterialColorear> {
    const job = await this.jobs.tomarSiguienteMaterialColorear(workerId);
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
          // Solo incluye indicadores si el OA los trae (evita el campo vacío en el contexto).
          ...(oa.indicadores.length > 0 ? { indicadores: oa.indicadores } : {}),
        },
      ],
      corpusVersionId: oa.corpusVersionId,
    };

    try {
      const { valor: lamina, meta } = await this.generar.ejecutarConMeta(ctx, {
        ...(concepto !== undefined ? { concepto } : {}),
        ...(regenerar !== undefined ? { regenerar } : {}),
      });

      // Persistencia ATÓMICA: borrador (sin origenId — lámina standalone) + traza + marcarHecho.
      const documentoId = await this.uow.enTransaccion(async (repos: ReposTransaccion) => {
        const doc = await repos.documentos.crearBorrador({
          tipo: 'material_colorear',
          establecimientoId: establecimiento,
          corpusVersionId: oa.corpusVersionId, // misma versión que cargó el OA (INV-4)
          // origenId omitido: la lámina no cuelga de ninguna unidad (standalone desde el OA)
          payload: lamina,
          // sin gate determinista; el schema valida en el ensamblaje.
          estadoGeneracion: 'validado',
        });
        await repos.trazas.registrar({
          documentoId: doc.id,
          corpusVersionId: oa.corpusVersionId,
          modelo: meta.modelo,
          rutaDecision: 'material/colorear',
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
      // Permanentes (no cambian entre reintentos): tramo no soportado / sin OA.
      // 'fuga_texto:*' NO es permanente (una regeneración puede salir limpia) → camino transitorio.
      const esPermanente =
        e instanceof GeneracionError &&
        (e.stopReason === 'material_tramo_no_soportado' || e.stopReason === 'material_sin_oa');
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
  private async fallar(jobId: string, error: string): Promise<ResultadoProcesarMaterialColorear> {
    await this.jobs.marcarFallido(jobId, error);
    return { tipo: 'fallido', jobId, error };
  }
}
