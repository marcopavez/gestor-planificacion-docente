// packages/domain/src/gates/secuenciaAnualGate.ts
// Gate determinista de la Planificación Anual (RF-PA.5, §4.3 plan-fase-1).
// INV-1: función pura, sin DB ni red. El corpus se pasa como dato (igual que citationGate).
// INV-2: el resultado governa si el plan puede avanzar; el LLM no participa.

import type { PlanificacionAnual } from '../schemas/planificacionAnual.js';
import { construirResultado, type Hallazgo, type ResultadoGate } from './tipos.js';

/** OA del corpus con su estado de vigencia para validar la secuencia anual. */
export interface OaCorpus {
  readonly codigo: string;
  readonly asignatura: string;
  readonly nivel: string;
  readonly vigente: boolean; // false = derogado; no se puede citar
}

export interface OpcionesSecuenciaAnualGate {
  /** Si true, un OA repetido entre unidades produce hallazgo 'marca'. Default: true (P2 del plan). */
  readonly marcarRepeticion?: boolean;
}

/**
 * Valida la secuencia anual contra el corpus de OA.
 * Reglas (§4.3):
 *   1. Existencia + vigencia: cada oaCodigo debe existir en el corpus y estar vigente → 'bloquea'.
 *   2. Cobertura: OA del curso no asignados a ninguna unidad → 'marca'.
 *   3. Repetición: OA presente en >1 unidad → 'marca' (permitida; revisita pedagógica — P2).
 */
export function secuenciaAnualGate(
  plan: PlanificacionAnual,
  corpusOa: readonly OaCorpus[],
  opciones?: OpcionesSecuenciaAnualGate,
): ResultadoGate {
  const marcarRepeticion = opciones?.marcarRepeticion ?? true;
  const h: Hallazgo[] = [];

  // Índice del corpus filtrado por (asignatura, nivel) para la cobertura
  const porCodigo = new Map(corpusOa.map((o) => [o.codigo, o]));
  const delCurso = corpusOa.filter(
    (o) => o.asignatura === plan.asignatura && o.nivel === plan.nivel,
  );

  // --- Regla 1: existencia + vigencia de cada OA declarado en las unidades ---
  for (const unidad of plan.unidades) {
    for (const codigo of unidad.oaCodigos) {
      const oa = porCodigo.get(codigo);
      if (oa === undefined) {
        h.push({
          gate: 'secuencia_anual',
          regla: 'oa_existe',
          severidad: 'bloquea',
          mensaje: `El OA ${codigo} en la unidad "${unidad.titulo}" (orden ${unidad.orden}) no existe en el corpus (corpus_version).`,
          ref: codigo,
        });
      } else if (!oa.vigente) {
        h.push({
          gate: 'secuencia_anual',
          regla: 'oa_vigente',
          severidad: 'bloquea',
          mensaje: `El OA ${codigo} en la unidad "${unidad.titulo}" (orden ${unidad.orden}) está derogado / no vigente en el corpus.`,
          ref: codigo,
        });
      }
    }
  }

  // --- Regla 2: cobertura — OA del curso sin asignar a ninguna unidad ---
  const asignadosCounts = new Map<string, number>();
  for (const unidad of plan.unidades) {
    for (const codigo of unidad.oaCodigos) {
      asignadosCounts.set(codigo, (asignadosCounts.get(codigo) ?? 0) + 1);
    }
  }

  for (const oa of delCurso) {
    if (!asignadosCounts.has(oa.codigo)) {
      h.push({
        gate: 'secuencia_anual',
        regla: 'cobertura_oa',
        severidad: 'marca',
        mensaje: `El OA ${oa.codigo} del curso ${plan.asignatura} ${plan.nivel} no está asignado a ninguna unidad. Revisar cobertura curricular.`,
        ref: oa.codigo,
      });
    }
  }

  // --- Regla 3: repetición de OA entre unidades (configurable — P2) ---
  if (marcarRepeticion) {
    for (const [codigo, veces] of asignadosCounts.entries()) {
      if (veces > 1) {
        h.push({
          gate: 'secuencia_anual',
          regla: 'oa_repetido',
          severidad: 'marca',
          mensaje: `El OA ${codigo} aparece en ${veces} unidades distintas. La revisita pedagógica es válida; revisar intencionalidad.`,
          ref: codigo,
        });
      }
    }
  }

  return construirResultado(h);
}
