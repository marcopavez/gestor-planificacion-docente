// packages/application/src/planificacion/EditarPlanificacionAnualUseCase.ts
// Caso de uso: editar una PlanificacionAnual existente (reemplazo completo — H-PA.5).
// Misma lógica que Crear pero llama actualizar en lugar de guardar.

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

// razon: 'no_encontrada' permite al caller (web) distinguir 404 de un bloqueo por gate.
export type ResultadoEdicion =
  | { readonly ok: true; readonly planificacion: PlanificacionAnualGuardada }
  | { readonly ok: false; readonly razon: 'gate'; readonly gate: ResultadoGate }
  | { readonly ok: false; readonly razon: 'no_encontrada' };

/** @deprecated Usa ResultadoEdicion */
export type ResultadoEditarPlan = ResultadoEdicion;

export class EditarPlanificacionAnualUseCase {
  constructor(
    private readonly planes: PlanificacionAnualRepository,
    private readonly oas: OaRepository,
    private readonly corpus: CorpusVersionRepository,
    private readonly clock: ClockPort,
  ) {}

  async ejecutar(id: string, input: PlanificacionAnual): Promise<ResultadoEdicion> {
    // 1. Verificar que el plan existe antes de correr el gate — devuelve discriminante claro.
    const existente = await this.planes.obtener(id);
    if (existente === null) {
      return { ok: false, razon: 'no_encontrada' };
    }

    // 2. Validar schema del input.
    const parsed = SchemaPlanificacionAnual.safeParse(input);
    if (!parsed.success) {
      throw new ReglaDominioError(
        'schema_invalido',
        `PlanificacionAnual inválida: ${parsed.error.message}`,
      );
    }
    const plan = parsed.data;

    // 3. Corpus publicado vigente.
    const version = await this.corpus.obtenerPublicadaVigente();
    if (version === null) {
      throw new ReglaDominioError(
        'sin_corpus',
        'No hay una corpus_version publicada vigente. Ejecuta el script de ingesta primero.',
      );
    }

    // 4. OA del corpus para el plan.
    const oasDominio = await this.oas.porAsignaturaCurso(plan.asignatura, plan.nivel, version.id);
    const hoy = this.clock.hoy();

    const corpusGate: OaCorpusGate[] = oasDominio.map((oa) => ({
      codigo: oa.codigo,
      asignatura: oa.asignatura,
      nivel: oa.nivel,
      vigente: estaVigente(oa.vigenciaDesde, oa.vigenciaHasta, hoy),
    }));

    // 5. Gate determinista; si bloquea, NO actualizamos.
    const resultadoGate = secuenciaAnualGate(plan, corpusGate);
    if (!resultadoGate.ok) {
      return { ok: false, razon: 'gate', gate: resultadoGate };
    }

    // 6. Actualizar: borra las unidades existentes e inserta las nuevas (replace-all).
    const planificacion = await this.planes.actualizar(id, plan, version.id);
    return { ok: true, planificacion };
  }
}
