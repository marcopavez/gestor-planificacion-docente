// packages/domain/src/gates/index.ts
// Agregador de los gates deterministas de la cascada (INV-2: el LLM propone, los gates disponen).

import type { ClaseDeck } from '../schemas/claseDeck.js';
import type { PlanificacionClase } from '../schemas/planificacionClase.js';
import type { PlanificacionUnidad } from '../schemas/planificacionUnidad.js';
import type { Prueba } from '../schemas/prueba.js';
import { citationGate, type OaVigencia } from './citationGate.js';
import { pedagogicalGate } from './pedagogicalGate.js';
import { planificacionGate } from './planificacionGate.js';
import type { ResultadoGate } from './tipos.js';

export type { Severidad, Hallazgo, ResultadoGate } from './tipos.js';
export { construirResultado } from './tipos.js';
export { planificacionGate } from './planificacionGate.js';
export { planificacionGateV2, type EntradaPlanificacionGateV2 } from './planificacionGateV2.js';
export { pedagogicalGate } from './pedagogicalGate.js';
export { citationGate, type OaVigencia, type EntradaCitationGate } from './citationGate.js';
export { secuenciaAnualGate, type OaCorpus, type OpcionesSecuenciaAnualGate } from './secuenciaAnualGate.js';

export interface ReporteGates {
  readonly ok: boolean;
  readonly planificacion: ResultadoGate;
  readonly pedagogica: ResultadoGate;
  readonly citas: ResultadoGate;
}

export interface EntradaGatesCascada {
  readonly unidad: PlanificacionUnidad;
  readonly clase: PlanificacionClase;
  readonly prueba: Prueba;
  readonly deck: ClaseDeck;
  readonly corpus: readonly OaVigencia[];
}

/** Corre los tres gates sobre los artefactos de una corrida y consolida el veredicto. */
export function correrGatesCascada(e: EntradaGatesCascada): ReporteGates {
  const planificacion = planificacionGate(e.unidad, e.clase);
  const pedagogica = pedagogicalGate(e.prueba);
  const citas = citationGate({ unidad: e.unidad, clase: e.clase, prueba: e.prueba, deck: e.deck, corpus: e.corpus });
  return { ok: planificacion.ok && pedagogica.ok && citas.ok, planificacion, pedagogica, citas };
}
