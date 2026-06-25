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
    "- Puedes usar tipos variados apropiados al nivel: 'seleccion_multiple', 'verdadero_falso', 'completacion', 'desarrollo', 'ordenar' (con 'secuencia_correcta'), 'terminos_pareados' (con 'pares' columnaA↔columnaB) y 'pictorico' (con 'imagen' = una DESCRIPCIÓN BREVE, 1 frase, del apoyo visual; nunca una imagen real).",
    "- Cada campo de texto contiene SOLO el contenido del ítem para el estudiante: NUNCA escribas notas para ti, razonamiento, ni instrucciones de formato dentro de un campo (sobre todo en 'imagen').",
    '- Cada ítem evalúa algo DISTINTO: no repitas el mismo enunciado en dos ítems (ni la misma pregunta cambiando sólo la imagen).',
    "- El corazón formativo: cada ítem lleva 'retroalimentacion' = qué orientar al estudiante si falla.",
    "- 'perfil_nivel' según el tramo de edad ('1-2' para 1º–2º básico, '3-4', '5-6', o 'generico').",
    '- Calibración por TRAMO DE EDAD (viene en la entrada del usuario):',
    '  · Tramo 1-2 (pre-lectores): enunciados MUY breves, pensados para que el/la docente los lea en voz alta; en selección múltiple usa MÁXIMO 2 alternativas; NO uses verdadero/falso con secuencias largas de números; NO uses "ordenar" con más de 3 elementos.',
    '  · Tramos 3-4 y 5-6: enunciados para lectores autónomos, con complejidad creciente según el tramo.',
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
    "- Si un slide se beneficia de una imagen, pon en 'topico_imagen' UN valor EXACTO de la lista de tópicos disponibles de la entrada (no inventes tópicos). Si ninguno aplica, omite el campo.",
    "- Completa también 'titulo' (del deck), 'asignatura', 'nivel' y 'oa' (códigos de la unidad), pero la aplicación FIJA esos campos y el tema visual desde la planificación: tu aporte real son los slides.",
  ].join('\n'),
);

export const INSTR_GUIA = instruccion(
  [
    'Genera una GUÍA DE TRABAJO para el ALUMNO (educación básica chilena, 3º a 6º) sobre el CONOCIMIENTO indicado, anclada al OA provisto.',
    'Es para APRENDER y PRACTICAR (no es una prueba calificada). Lenguaje claro y apropiado al nivel.',
    "- 'explicacion': enseña el conocimiento en 1–2 párrafos breves.",
    "- 'ejemplo': un ejemplo RESUELTO/modelado que muestra cómo se hace.",
    "- 'ejercicios': práctica graduada (recordar → aplicar). Tipos: 'seleccion_multiple', 'verdadero_falso', 'completacion', 'desarrollo', 'ordenar' (con 'secuencia_correcta') o 'terminos_pareados' (con 'pares' columnaA↔columnaB). Selección múltiple y verdadero/falso con EXACTAMENTE una alternativa correcta. NO uses 'pictorico'.",
    "- 'desafio' (opcional): un ítem final de mayor exigencia.",
    "- Cada ítem lleva 'retroalimentacion' = qué orientar al alumno si falla.",
    '- Cada campo de texto contiene SOLO el contenido del ítem/sección para el alumno: NUNCA escribas notas para ti, razonamiento ni instrucciones de formato dentro de un campo.',
  ].join('\n'),
);

// Material para colorear: la IA propone QUÉ dibujar anclado al OA. 'descripcion_en' va a Imagen
// (solo-inglés). Restricción legal: dibujos originales; NUNCA personajes con copyright/marca.
export const INSTR_DIBUJO = instruccion(
  [
    'Propón UN dibujo simple para COLOREAR (line-art), apropiado para niños de 1º a 3º básico, ligado al OA y al conocimiento provistos.',
    'El dibujo es pedagógico, NO decorativo: refleja lo que se aprende (p. ej. conteo → objetos para contar; "seres vivos" → un animal concreto).',
    "- 'concepto': etiqueta CORTA en español de lo que se dibuja (p. ej. 'conteo de frutas').",
    "- 'descripcion_en': descripción visual EN INGLÉS, concreta y breve (1–2 frases), de UNA escena simple apta para line-art de contornos gruesos.",
    "- 'descripcion_en' DEBE representar exactamente el 'concepto' (el MISMO motivo): si concepto='conteo de manzanas', el dibujo son manzanas — nunca otro objeto. No cambies de tema entre ambos campos.",
    'Reglas del dibujo (obligatorias):',
    '  · Sin texto, letras ni números dentro del dibujo.',
    '  · Formas simples y grandes, fáciles de pintar para un niño pequeño.',
    '  · PROHIBIDO: personajes con copyright o marca (Disney, Frozen, Pokémon, logos, etc.). Solo objetos/animales/escenas genéricos y originales.',
    '  · Evita escenas con personas si puedes (prefiere animales/objetos).',
  ].join('\n'),
);

// Ficha educativa para colorear (Plan 2): ejercicios cortos anclados al OA para 1º-3º. REUSA el motor de
// PRUEBA (que sí soporta 1º-2º pre-lectores e ítems pictóricos); decisión del dueño. No es una prueba
// calificada: es práctica para colorear. La restricción de no-fuga es la misma de la prueba/guía.
export const INSTR_FICHA = instruccion(
  [
    'Genera 2 o 3 EJERCICIOS CORTOS para una FICHA PARA COLOREAR (niños de 1º a 3º básico), anclados al OA y al concepto provistos.',
    'Es para practicar y colorear (no es una prueba calificada). Lenguaje MUY simple y concreto.',
    "- Tipos apropiados al nivel: 'seleccion_multiple', 'verdadero_falso', 'completacion', 'ordenar' (con 'secuencia_correcta'), 'terminos_pareados' (con 'pares' columnaA↔columnaB) o 'pictorico' (con 'imagen' = una DESCRIPCIÓN BREVE, 1 frase, del apoyo visual; nunca una imagen real). Selección múltiple y verdadero/falso con EXACTAMENTE una alternativa correcta.",
    '- En 1º–2º (pre-lectores): enunciados muy breves para que el/la docente los lea en voz alta; prefiere apoyo visual (ítems pictóricos).',
    "- Cada ítem lleva 'oa' = el código del OA provisto, y 'retroalimentacion' = qué orientar si el/la estudiante falla.",
    "- Cada campo de texto contiene SOLO el contenido del ítem para el/la estudiante: NUNCA escribas notas para ti, razonamiento ni instrucciones de formato dentro de un campo (sobre todo en 'imagen').",
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

export function entradaPrueba(unidad: PlanificacionUnidad, tramo: '1-2' | '3-4' | '5-6'): string {
  return [
    `Tramo de edad: ${tramo} básico`,
    `Planificación de unidad (JSON):\n${JSON.stringify(unidad)}`,
    '',
    'Genera una evaluación formativa que evalúe los OA basales de la unidad, calibrada a ese tramo de edad.',
  ].join('\n');
}

export function entradaDeck(unidad: PlanificacionUnidad, clase: ClasePlanificadaType): string {
  return [
    `Unidad: ${unidad.unidad} (${unidad.asignatura} · ${unidad.nivel})`,
    `Clase a convertir en deck (JSON):`,
    JSON.stringify(clase),
  ].join('\n');
}

/** Entrada para el PPT infantil: la planificación completa + el tramo de edad que fija el lenguaje. */
export function entradaDeckInfantil(
  unidad: PlanificacionUnidad,
  tramo: '1-2' | '3-4' | '5-6',
  topicosColor: readonly string[],
): string {
  const listaTopicos = topicosColor.length
    ? topicosColor.join(', ')
    : '(no hay imágenes disponibles para este nivel; omite topico_imagen)';
  return [
    `Unidad: ${unidad.unidad} (${unidad.asignatura} · ${unidad.nivel})`,
    `Tramo de edad: ${tramo} básico`,
    `Tópicos de imagen disponibles (elige uno EXACTO de esta lista para 'topico_imagen', o ninguno): ${listaTopicos}`,
    `Planificación de unidad (JSON):`,
    JSON.stringify(unidad),
    '',
    'Genera los slides del PPT infantil para esta unidad, anclados a su propósito, experiencias, OA e indicadores.',
  ].join('\n');
}

export function entradaGuia(ctx: ContextoCascada, conocimiento: string): string {
  const oa = ctx.oaSeleccionados[0];
  return [
    `Asignatura: ${ctx.asignatura}`,
    `Nivel: ${ctx.nivel}`,
    `OA: ${oa?.codigo} — ${oa?.descripcion}`,
    `Conocimiento a trabajar en esta guía: ${conocimiento}`,
    'Genera una guía de trabajo para el alumno sobre ESE conocimiento, anclada al OA.',
  ].join('\n');
}

/** Entrada para la descripción del dibujo de la lámina: asignatura/nivel/OA + el conocimiento opcional. */
export function entradaDibujo(ctx: ContextoCascada, concepto?: string): string {
  const oa = ctx.oaSeleccionados[0];
  const lineaConcepto = concepto !== undefined && concepto.trim() !== ''
    ? `Concepto a representar: ${concepto}`
    : 'Concepto a representar: (propón uno apropiado al OA)';
  return [
    `Asignatura: ${ctx.asignatura}`,
    `Nivel: ${ctx.nivel}`,
    `OA: ${oa?.codigo} — ${oa?.descripcion}`,
    lineaConcepto,
    'Propón el dibujo para colorear (concepto en español + descripcion_en en inglés), anclado al OA.',
  ].join('\n');
}

/** Entrada para los ejercicios de la ficha: asignatura/nivel/OA + el concepto (tema) opcional. */
export function entradaFicha(ctx: ContextoCascada, concepto?: string): string {
  const oa = ctx.oaSeleccionados[0];
  const lineaConcepto = concepto !== undefined && concepto.trim() !== ''
    ? `Tema de la ficha: ${concepto}`
    : 'Tema de la ficha: (derívalo del OA)';
  return [
    `Asignatura: ${ctx.asignatura}`,
    `Nivel: ${ctx.nivel}`,
    `OA: ${oa?.codigo} — ${oa?.descripcion}`,
    lineaConcepto,
    'Genera 2 o 3 ejercicios cortos para una ficha para colorear, anclados a ESE OA.',
  ].join('\n');
}

export function refClasePrincipal(clasePlan: PlanificacionClase): ClasePlanificadaType | null {
  return clasePlan.clases[0] ?? null;
}
