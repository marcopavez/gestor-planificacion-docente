// packages/application/src/aula/cascada/tipos.ts
// Entradas/salidas de la cascada de Aula. Genérico por asignatura/nivel: el OA del corpus
// entra como dato, nunca hardcodeado (extensibilidad a cualquier materia).

import type {
  ClaseDeck,
  OaVigencia,
  PlanificacionClase,
  PlanificacionUnidad,
  Prueba,
  ReporteGates,
  UsoTokens,
} from '@faro/domain';

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
  // Corpus completo (con vigencia) para validar citas en citationGate; si falta, se deriva de
  // oaSeleccionados (todos vigentes). En vivo conviene pasar el corpus completo de la asignatura.
  readonly oaCorpusValidacion?: readonly OaVigencia[];
}

/** Metadatos de auditoría de la llamada al LLM por artefacto (para traza_ia — INV-4, RF-PA.10). */
export interface MetaArtefacto {
  readonly modelo: string;
  readonly usage: UsoTokens;
  readonly stopReason: string;
}

/** Metadatos por artefacto generado (surface aditivo desde cada Generar*UseCase). */
export interface MetadatosCascada {
  readonly unidad: MetaArtefacto;
  readonly clase: MetaArtefacto;
  readonly prueba: MetaArtefacto;
  readonly deck: MetaArtefacto;
}

/** Los cuatro artefactos que produce la cascada (todos borradores — HIL) + el veredicto de gates. */
export interface ResultadoCascada {
  readonly unidad: PlanificacionUnidad;
  readonly clase: PlanificacionClase;
  readonly prueba: Prueba;
  readonly deck: ClaseDeck;
  readonly gates: ReporteGates;
  // Metadatos de cada llamada al LLM (modelo/usage) para las 4 filas de traza_ia.
  readonly metadatos: MetadatosCascada;
}
