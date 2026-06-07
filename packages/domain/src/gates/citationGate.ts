// packages/domain/src/gates/citationGate.ts
// RF-2.13: cada OA citado existe y está vigente en la corpus_version. Spec §4.6 / ADR-001 §D.
// El "¿el extracto respalda la afirmación?" (LLM) queda advisory/TODO (Fase 1/3).

import type { ClaseDeck } from '../schemas/claseDeck.js';
import type { PlanificacionClase } from '../schemas/planificacionClase.js';
import type { PlanificacionUnidad } from '../schemas/planificacionUnidad.js';
import type { Prueba } from '../schemas/prueba.js';
import { construirResultado, type Hallazgo, type ResultadoGate } from './tipos.js';

/** OA del corpus con su estado de vigencia (la verdad para validar citas). */
export interface OaVigencia {
  readonly codigo: string;
  readonly vigente: boolean;
}

export interface EntradaCitationGate {
  readonly unidad: PlanificacionUnidad;
  readonly clase: PlanificacionClase;
  readonly prueba: Prueba;
  readonly deck: ClaseDeck;
  readonly corpus: readonly OaVigencia[];
}

function codigosCitados(e: EntradaCitationGate): Set<string> {
  const c = new Set<string>();
  e.unidad.oa.forEach((o) => c.add(o.codigo));
  e.unidad.indicadores_evaluacion.forEach((i) => c.add(i.oa));
  e.clase.clases.forEach((cl) => cl.oa.forEach((x) => c.add(x)));
  e.prueba.items.forEach((it) => c.add(it.oa));
  e.prueba.tabla_especificaciones.forEach((t) => c.add(t.oa));
  e.deck.oa.forEach((x) => c.add(x));
  return c;
}

export function citationGate(e: EntradaCitationGate): ResultadoGate {
  const h: Hallazgo[] = [];
  const porCodigo = new Map(e.corpus.map((o) => [o.codigo, o]));

  for (const codigo of codigosCitados(e)) {
    // Los OAT (transversales) no viven en el corpus de asignatura: advisory, no bloqueo.
    if (/^OAT/i.test(codigo)) {
      h.push({
        gate: 'citas',
        regla: 'oa_transversal',
        severidad: 'marca',
        mensaje: `${codigo} es transversal (OAT): fuera del corpus de asignatura. [VERIFICAR contra el corpus de OAT]`,
        ref: codigo,
      });
      continue;
    }
    const oa = porCodigo.get(codigo);
    if (oa === undefined) {
      h.push({
        gate: 'citas',
        regla: 'oa_existe',
        severidad: 'bloquea',
        mensaje: `El OA citado ${codigo} no existe en el corpus (corpus_version).`,
        ref: codigo,
      });
    } else if (!oa.vigente) {
      h.push({
        gate: 'citas',
        regla: 'oa_vigente',
        severidad: 'bloquea',
        mensaje: `El OA citado ${codigo} está derogado / no vigente en el corpus.`,
        ref: codigo,
      });
    }
  }

  return construirResultado(h);
}
