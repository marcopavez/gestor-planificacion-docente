// packages/application/src/aula/cascada/generacion.ts
// Glue de generación de la cascada: bloque de corpus (cacheable, el foso), instrucciones por
// artefacto y el guardia parsed===null (RF-0.9). Los prompts son reales: en modo demo el
// LlmPort sirve samples y los ignora; en modo live, dirigen la generación.

import type { BloqueSistema, PlanificacionClase, PlanificacionUnidad, SalidaEstructurada } from '@faro/domain';
import { GeneracionError } from '@faro/domain';
import type { ClasePlanificadaType } from '@faro/domain';
import type { ContextoCascada, MetaArtefacto } from './tipos.js';

// Alias hacia la única fuente de verdad (MetaArtefacto en tipos.ts): evita duplicar campos.
// Se conserva el nombre MetaGeneracion porque los Generar*UseCase lo importan desde aquí.
export type MetaGeneracion = MetaArtefacto;

/** RF-0.9: si el LLM devuelve null (refusal/max_tokens), nunca se persiste basura. */
export function exigirParsed<T>(salida: SalidaEstructurada<T>): T {
  if (salida.parsed === null) {
    throw new GeneracionError(salida.stopReason);
  }
  return salida.parsed;
}

/**
 * Variante aditiva de exigirParsed: además del valor, devuelve los metadatos de la llamada
 * (modelo/usage/stopReason) para registrar la traza por artefacto sin cambiar la generación.
 */
export function exigirParsedConMeta<T>(salida: SalidaEstructurada<T>): { valor: T; meta: MetaGeneracion } {
  if (salida.parsed === null) {
    throw new GeneracionError(salida.stopReason);
  }
  return {
    valor: salida.parsed,
    meta: { modelo: salida.modelo, usage: salida.usage, stopReason: salida.stopReason },
  };
}

/**
 * Bloque de sistema estable y cacheable: rol + OA del corpus curado (única fuente válida).
 * Es idéntico en las 4 llamadas de una corrida → se beneficia del prompt caching (RF-0.11).
 */
export function bloqueCorpus(ctx: ContextoCascada): BloqueSistema {
  const oaLista = ctx.oaSeleccionados
    .map((oa) => {
      const hab = oa.habilidades?.length ? `\n    Habilidades: ${oa.habilidades.join(', ')}` : '';
      const ind = oa.indicadores?.length
        ? `\n    Indicadores oficiales (Programa de Estudio): ${oa.indicadores.map((i) => `«${i}»`).join('; ')}`
        : '';
      return `- [${oa.categoria}] ${oa.codigo}: ${oa.descripcion}${hab}${ind}`;
    })
    .join('\n');

  const texto = [
    'Eres un asistente de planificación curricular para colegios chilenos (K-12), alineado a las Bases Curriculares (MINEDUC).',
    '',
    'Reglas inviolables:',
    '1. Usa EXCLUSIVAMENTE los OA provistos abajo y cita sus códigos VERBATIM. Nunca inventes OA, códigos, decretos, indicadores oficiales ni cifras.',
    '2. Un indicador de evaluación solo lleva fuente "oficial" si aparece abajo como indicador oficial del Programa de Estudio; si lo propones tú, márcalo "ia_borrador".',
    '3. Todo lo que produces es un BORRADOR sujeto a revisión docente obligatoria (human-in-the-loop).',
    '4. Respeta el enfoque del nivel (p. ej. en 1º básico: progresión concreto → pictórico → simbólico; estudiantes pre-lectores → enunciados leídos por el/la docente).',
    '',
    `Contexto: ${ctx.asignatura} · ${ctx.nivel} · ${ctx.establecimiento} (corpus_version=${ctx.corpusVersionId}).`,
    'OBJETIVOS DE APRENDIZAJE (corpus curado — única fuente válida):',
    oaLista,
  ].join('\n');

  return { texto, cacheable: true };
}

/**
 * Bloque de sistema para artefactos derivados de una PlanificacionUnidad ya generada (p. ej. el PPT
 * infantil): el grounding son los OA de la unidad (verbatim), que la IA no debe alterar. Equivalente
 * a bloqueCorpus pero a partir de la unidad (no del ContextoCascada), porque aguas abajo solo se tiene
 * la planificación. Cacheable: es estable para una misma unidad.
 */
export function bloqueCorpusUnidad(unidad: PlanificacionUnidad): BloqueSistema {
  const oaLista = unidad.oa
    .map((oa) => {
      const hab = oa.habilidades.length ? `\n    Habilidades: ${oa.habilidades.join(', ')}` : '';
      return `- [${oa.categoria}] ${oa.codigo}: ${oa.descripcion}${hab}`;
    })
    .join('\n');

  const texto = [
    'Eres un asistente que prepara material de aula para niños de educación básica chilena (Bases Curriculares MINEDUC).',
    '',
    'Reglas inviolables:',
    '1. Usa EXCLUSIVAMENTE los OA de la unidad provistos abajo y cita sus códigos VERBATIM. Nunca inventes OA ni reescribas su texto.',
    '2. Todo lo que produces es un BORRADOR sujeto a revisión docente obligatoria (human-in-the-loop).',
    '3. Adecúa el lenguaje a la edad de los estudiantes del nivel.',
    '',
    `Contexto: ${unidad.asignatura} · ${unidad.nivel} · ${unidad.establecimiento}.`,
    `Unidad: ${unidad.unidad}.`,
    unidad.proposito ? `Propósito de la unidad: ${unidad.proposito}` : '',
    'OBJETIVOS DE APRENDIZAJE de la unidad (única fuente válida — no los modifiques):',
    oaLista,
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { texto, cacheable: true };
}

function instruccion(texto: string): BloqueSistema {
  return { texto, cacheable: false };
}

export const INSTR_UNIDAD = instruccion(
  [
    'Genera una PLANIFICACIÓN DE UNIDAD completa y coherente con los OA provistos.',
    "- 'plantilla': usa 'A' (Planificación de Unidad, densa) salvo que se pida el formato DUA ('B').",
    "- 'oa': incluye cada OA con su categoría, descripción VERBATIM del corpus y sus 'habilidades' (si las hay).",
    "- 'indicadores_evaluacion': 1–3 por cada OA basal; usa fuente 'oficial' solo si el indicador aparece como oficial del Programa de Estudio, de lo contrario 'ia_borrador'.",
    "- 'experiencias': situaciones de aprendizaje/actividades concretas y apropiadas al nivel.",
    "- 'evaluacion.tipo': incluye al menos diagnóstica, formativa y sumativa; 'evaluacion.instrumentos': del catálogo del colegio.",
    "- 'duracion_semanas' y 'horas_pedagogicas' coherentes entre sí.",
    "- 'extras': campos propios de la plantilla del colegio (DUA, metodologías, etc.); usa {} si no aplica.",
  ].join('\n'),
);

export const INSTR_CLASE = instruccion(
  [
    'Genera la PLANIFICACIÓN CLASE A CLASE que desarrolla la unidad.',
    '- Cada clase con objetivo_clase y los tres momentos didácticos: inicio, desarrollo y cierre.',
    '- recursos, evaluacion_formativa e indicadores (que tributen a OA de la unidad), y duracion_min realista.',
    '- En conjunto, las clases deben cubrir TODOS los OA basales de la unidad.',
    "- 'unidad_ref' = título de la unidad.",
  ].join('\n'),
);

export const INSTR_PRUEBA = instruccion(
  [
    'Genera una evaluación FORMATIVA (para aprender, no para calificar) anclada a los OA de la unidad.',
    "- 'tipo_evaluacion': 'formativa' (úsala salvo que se pida 'diagnostica').",
    "- 'tabla_especificaciones': una fila por OA evaluado (n_items; el puntaje es opcional en formativa).",
    '- Cada ítem tributa a un OA de la unidad; selección múltiple y verdadero/falso con EXACTAMENTE una alternativa correcta.',
    "- Puedes usar tipos variados apropiados al nivel: 'seleccion_multiple', 'verdadero_falso', 'completacion', 'desarrollo', 'ordenar' (con 'secuencia_correcta'), 'terminos_pareados' (con 'pares' columnaA↔columnaB) y 'pictorico' (con 'imagen' = DESCRIPCIÓN de un apoyo visual, nunca una imagen real).",
    "- El corazón formativo: cada ítem lleva 'retroalimentacion' = qué orientar al estudiante si falla.",
    "- 'perfil_nivel' según el tramo de edad ('1-2' para 1º–2º básico, '3-4', '5-6', o 'generico').",
    '- En el tramo 1-2, ítems apropiados para pre-lectores (enunciado leído por el/la docente, apoyo visual).',
    "- El puntaje es opcional: si lo incluyes en un ítem, inclúyelo también en su fila de la tabla y haz que cuadren.",
  ].join('\n'),
);

export const INSTR_DECK = instruccion(
  [
    'Genera un DECK de diapositivas para proyectar UNA clase.',
    '- Slides ordenados por momento: inicio → desarrollo → cierre.',
    '- Cada slide: titulo, contenido (viñetas breves apropiadas al nivel), notas_docente y, opcional, sugerencia_imagen.',
    "- 'titulo' del deck descriptivo; 'oa' = los OA de la clase; 'asignatura' y 'nivel' del contexto.",
  ].join('\n'),
);

// Fase 3 (PPT infantil): la IA redacta SOLO los slides; el use case ensambla el ClaseDeck (tema/tramo
// salen de los datos, no de la IA). El tramo (1-2 / 3-4 / 5-6) condiciona el lenguaje y el tamaño de texto.
export const INSTR_DECK_INFANTIL = instruccion(
  [
    'Genera los SLIDES de un PPT INFANTIL (niños de 6 a 12 años) para proyectar una clase, derivado de su planificación de unidad.',
    'El tramo de edad (1-2 / 3-4 / 5-6 básico) viene en la entrada: ajusta el lenguaje a ese tramo.',
    '- Lenguaje simple, frases cortas y concretas; en el tramo 1-2 asume pre-lectores (texto que el/la docente lee en voz alta).',
    "- Secuencia los slides por momento: 'inicio' → 'desarrollo' → 'cierre' (sigue propósito y experiencias de la unidad).",
    "- Cada slide lleva su 'tipo':",
    "  · 'contenido' → titulo + contenido (viñetas muy breves, 1 idea por viñeta).",
    "  · 'pregunta' / 'elige' → una pregunta clara en 'titulo' y 2–4 'opciones' { texto, correcta }; marca EXACTAMENTE una 'correcta:true'. NO reveles la respuesta en el contenido: la respuesta correcta va SOLO en 'notas_docente'.",
    "  · 'que_sigue' → un slide de transición ('¿Qué sigue?') con pistas breves de lo que viene en 'contenido'.",
    "- Incluye 2–4 slides de interacción ('pregunta'/'elige') apoyadas en los OA e indicadores de la unidad.",
    "- 'notas_docente' para el/la docente: cómo guiar el slide y, en interacción, cuál es la respuesta correcta y por qué.",
    '- NO inventes OA ni alteres su texto; apóyate en el propósito, experiencias e indicadores de la unidad.',
    "- Completa también 'titulo' (del deck), 'asignatura', 'nivel' y 'oa' (códigos de la unidad), pero la aplicación FIJA esos campos y el tema visual desde la planificación: tu aporte real son los slides.",
  ].join('\n'),
);

// --- Entradas de usuario (la petición concreta + artefactos aguas arriba) ---

export function entradaUnidad(ctx: ContextoCascada): string {
  const titulo = ctx.unidadTitulo ?? '(propón un título apropiado para la unidad)';
  return [
    `Asignatura: ${ctx.asignatura}`,
    `Nivel: ${ctx.nivel}`,
    `Unidad: ${titulo}`,
    'Genera la planificación de unidad para los OA del corpus.',
  ].join('\n');
}

export function entradaClase(unidad: PlanificacionUnidad): string {
  return `Planificación de unidad (JSON):\n${JSON.stringify(unidad)}\n\nGenera la planificación clase a clase que la desarrolla.`;
}

export function entradaPrueba(unidad: PlanificacionUnidad): string {
  return `Planificación de unidad (JSON):\n${JSON.stringify(unidad)}\n\nGenera una evaluación formativa que evalúe los OA basales de la unidad.`;
}

export function entradaDeck(unidad: PlanificacionUnidad, clase: ClasePlanificadaType): string {
  return [
    `Unidad: ${unidad.unidad} (${unidad.asignatura} · ${unidad.nivel})`,
    `Clase a convertir en deck (JSON):`,
    JSON.stringify(clase),
  ].join('\n');
}

/** Entrada para el PPT infantil: la planificación completa + el tramo de edad que fija el lenguaje. */
export function entradaDeckInfantil(unidad: PlanificacionUnidad, tramo: '1-2' | '3-4' | '5-6'): string {
  return [
    `Unidad: ${unidad.unidad} (${unidad.asignatura} · ${unidad.nivel})`,
    `Tramo de edad: ${tramo} básico`,
    `Planificación de unidad (JSON):`,
    JSON.stringify(unidad),
    '',
    'Genera los slides del PPT infantil para esta unidad, anclados a su propósito, experiencias, OA e indicadores.',
  ].join('\n');
}

export function refClasePrincipal(clasePlan: PlanificacionClase): ClasePlanificadaType | null {
  return clasePlan.clases[0] ?? null;
}
