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
    'Eres un asistente de planificación curricular para colegios chilenos (K-12), alineado a las Bases Curriculares y a la normativa MINEDUC (Decreto 67 de evaluación).',
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
    'Genera una PRUEBA (evaluación sumativa) alineada al Decreto 67.',
    "- 'tabla_especificaciones': una fila por OA evaluado (n_items y puntaje).",
    '- Cada ítem tributa a un OA de la unidad; selección múltiple con EXACTAMENTE una alternativa correcta.',
    '- La suma de puntajes de los ítems debe coincidir con la tabla de especificaciones.',
    "- 'perfil_nivel' según el nivel ('1B' para 1º básico, '2B', '3B', o 'generico').",
    '- En 1º básico, ítems apropiados para pre-lectores (enunciado leído por el/la docente, apoyo visual).',
    "- 'alineada_reglamento': false salvo que se entregue el reglamento de evaluación del colegio.",
    "- 'version_nee_dua': false (la variante DUA/NEE se genera por separado).",
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
  return `Planificación de unidad (JSON):\n${JSON.stringify(unidad)}\n\nGenera una prueba sumativa que evalúe los OA basales de la unidad.`;
}

export function entradaDeck(unidad: PlanificacionUnidad, clase: ClasePlanificadaType): string {
  return [
    `Unidad: ${unidad.unidad} (${unidad.asignatura} · ${unidad.nivel})`,
    `Clase a convertir en deck (JSON):`,
    JSON.stringify(clase),
  ].join('\n');
}

export function refClasePrincipal(clasePlan: PlanificacionClase): ClasePlanificadaType | null {
  return clasePlan.clases[0] ?? null;
}
