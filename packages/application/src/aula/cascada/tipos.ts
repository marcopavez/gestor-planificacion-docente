// packages/application/src/aula/cascada/tipos.ts
// Entradas/salidas de la cascada de Aula. Genérico por asignatura/nivel: el OA del corpus
// entra como dato, nunca hardcodeado (extensibilidad a cualquier materia).

import type { ClaseDeck, PlanificacionClase, PlanificacionUnidad, Prueba } from '@faro/domain';

/** OA del corpus curado para una asignatura/nivel (única fuente válida para grounding). */
export interface OaCorpus {
  readonly codigo: string; // 'MA01 OA 03' — verbatim, nunca se inventa
  readonly categoria: 'basal' | 'complementario' | 'transversal';
  readonly descripcion: string;
  readonly habilidades?: readonly string[];
  /** Indicadores oficiales del Programa de Estudio (citables) si existen en el corpus. */
  readonly indicadores?: readonly string[];
}

/** Contexto curricular de una corrida de la cascada (lo que elige el docente + el corpus). */
export interface ContextoCascada {
  readonly establecimiento: string;
  readonly asignatura: string;
  readonly nivel: string; // '1º básico', '2º básico', …
  readonly unidadTitulo?: string; // opcional: título sugerido de la unidad
  readonly oaSeleccionados: readonly OaCorpus[];
  readonly corpusVersionId: string;
}

/** Los cuatro artefactos que produce la cascada (todos borradores — HIL). */
export interface ResultadoCascada {
  readonly unidad: PlanificacionUnidad;
  readonly clase: PlanificacionClase;
  readonly prueba: Prueba;
  readonly deck: ClaseDeck;
}
