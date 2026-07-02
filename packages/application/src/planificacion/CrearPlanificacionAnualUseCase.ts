// packages/application/src/planificacion/CrearPlanificacionAnualUseCase.ts
// Caso de uso: crear una PlanificacionAnual pasando por el gate de secuencia (H-PA.5).
// INV-5: solo importa @faro/domain; no toca infra-*.

import type {
  ClockPort,
  CorpusVersionRepository,
  OaRepository,
  PlanificacionAnual,
  PlanificacionAnualGuardada,
  PlanificacionAnualRepository,
} from '@faro/domain';
import {
  ReglaDominioError,
  SchemaPlanificacionAnual,
  estaVigente,
  secuenciaAnualGate,
} from '@faro/domain';
import type { OaCorpus as OaCorpusGate } from '@faro/domain';
import type { ResultadoGate } from '@faro/domain';

/** Resultado discriminado del caso de uso: el gate pudo bloquear. */
export type ResultadoCrearPlan =
  | { readonly ok: true; readonly planificacion: PlanificacionAnualGuardada }
  // razon: 'gate' alinea con ResultadoEdicion para que los callers puedan tratar ambos uniformemente.
  | { readonly ok: false; readonly razon: 'gate'; readonly gate: ResultadoGate };

export class CrearPlanificacionAnualUseCase {
  constructor(
    private readonly planes: PlanificacionAnualRepository,
    private readonly oas: OaRepository,
    private readonly corpus: CorpusVersionRepository,
    private readonly clock: ClockPort,
  ) {}

  async ejecutar(input: PlanificacionAnual, usuarioId: string): Promise<ResultadoCrearPlan> {
    // 1. Validar el schema del input (errores de estructura, no de dominio).
    const parsed = SchemaPlanificacionAnual.safeParse(input);
    if (!parsed.success) {
      throw new ReglaDominioError(
        'schema_invalido',
        `PlanificacionAnual inválida: ${parsed.error.message}`,
      );
    }
    const plan = parsed.data;

    // 2. Obtener la corpus_version publicada vigente; sin corpus no hay validación posible.
    const version = await this.corpus.obtenerPublicadaVigente();
    if (version === null) {
      throw new ReglaDominioError(
        'sin_corpus',
        'No hay una corpus_version publicada vigente. Ejecuta el script de ingesta primero.',
      );
    }

    // 3. Recuperar los OA del corpus para la asignatura/nivel del plan.
    const oasDominio = await this.oas.porAsignaturaCurso(plan.asignatura, plan.nivel, version.id);
    const hoy = this.clock.hoy();

    // Convertir a OaCorpus del gate (secuenciaAnualGate): { codigo, asignatura, nivel, vigente }.
    const corpusGate: OaCorpusGate[] = oasDominio.map((oa) => ({
      codigo: oa.codigo,
      asignatura: oa.asignatura,
      nivel: oa.nivel,
      vigente: estaVigente(oa.vigenciaDesde, oa.vigenciaHasta, hoy),
    }));

    // 4. Correr el gate determinista; si bloquea, NO persistimos (INV-2/INV-3).
    const resultadoGate = secuenciaAnualGate(plan, corpusGate);
    if (!resultadoGate.ok) {
      return { ok: false, razon: 'gate', gate: resultadoGate };
    }

    // 5. Gate pasado: guardar (acotado al dueño, INV tenancy) y devolver.
    const planificacion = await this.planes.guardar(plan, version.id, usuarioId);
    return { ok: true, planificacion };
  }
}
