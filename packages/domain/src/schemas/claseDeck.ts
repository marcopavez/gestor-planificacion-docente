// packages/domain/src/schemas/claseDeck.ts
// Schema Zod del deck de clase (.pptx) — spec 02-aula-cascada §4.4.
// El PptxExportAdapter (infra-export) renderiza este modelo a .pptx (INV-6).
// Fase 3 (PPT infantil): se añaden, ADITIVOS y backward-compatibles, el tipo de slide e
// interacción (tipo/opciones), y el tema infantil data-driven (tramo_edad/tema). El LOOK infantil
// vive en los DATOS (tema del deck), no hardcodeado por nivel: sin `tema`, el render sigue siendo el
// institucional de la cascada/worker (los campos nuevos son opcionales o con default).

import { z } from 'zod';
// Reusa el ColorHex del dominio (hex RGB de 6 dígitos sin '#', el que espera la lib de export).
import { ColorHex } from './plantilla.js';

export const SlideDeck = z.object({
  momento: z.enum(['inicio', 'desarrollo', 'cierre']),
  titulo: z.string(),
  contenido: z.array(z.string()), // viñetas
  notas_docente: z.string(),
  sugerencia_imagen: z.string().optional(),
  // Tópico del catálogo de imágenes (banco): la IA lo elige de la lista fija que se le inyecta. El
  // export lo resuelve a una imagen real (color); si no resuelve, cae al placeholder. Opcional →
  // backward-compat con decks ya generados. `sugerencia_imagen` se conserva para las notas del orador.
  topico_imagen: z.string().optional(),
  // Tipo de slide (Fase 3): por defecto 'contenido' → backward-compatible con los decks ya generados.
  // 'pregunta'/'elige' llevan `opciones`; la correcta NO se revela en la slide (va en notas_docente).
  tipo: z.enum(['contenido', 'pregunta', 'que_sigue', 'elige']).default('contenido'),
  // Opciones para slides de interacción ('pregunta'/'elige'); vacío para el resto.
  opciones: z
    .array(z.object({ texto: z.string(), correcta: z.boolean() }))
    .default([]),
});

/**
 * Tema VISUAL del deck infantil (Fase 3) — el LOOK es data-driven: la paleta/fuente/tamaño viven en
 * los datos del deck, no en el renderer ni hardcodeados por nivel. Sin `tema` en el ClaseDeck, el
 * export mantiene el look institucional (la cascada/worker no cambian).
 */
export const TemaDeckInfantil = z.object({
  paleta: z.object({
    primario: ColorHex, // títulos
    secundario: ColorHex,
    acento: ColorHex, // realces
    fondo: ColorHex, // fondo de slide
    texto: ColorHex, // cuerpo
    // Color semántico del ENUNCIADO de preguntas (rojo en los PPT reales del colegio).
    consigna: ColorHex,
    // Color del MARCO a sangre (Fase 3, refs MINEDUC 5-6): opcional → 1-2/3-4 sin marco (backward-compat).
    borde: ColorHex.optional(),
  }),
  fuente: z.object({
    titulo: z.string(), // nombre de fuente del título
    cuerpo: z.string(), // nombre de fuente del cuerpo
  }),
  tamano: z.object({
    titulo: z.number().int().positive(), // pt
    cuerpo: z.number().int().positive(), // pt
  }),
  estilo: z.enum(['pastel', 'primarios', 'naturaleza']),
});

export const SchemaClaseDeck = z.object({
  titulo: z.string(),
  asignatura: z.string(),
  nivel: z.string(),
  oa: z.array(z.string()),
  // Tramo de edad (Fase 3) que elige el tema: 1-2 / 3-4 / 5-6 básico. Opcional → decks previos válidos.
  tramo_edad: z.enum(['1-2', '3-4', '5-6']).optional(),
  // Tema infantil opcional: presente → render infantil data-driven; ausente → render institucional.
  tema: TemaDeckInfantil.optional(),
  slides: z.array(SlideDeck),
});

/**
 * Temas por tramo de edad (Fase 3). CALIBRADAS contra material real (fuentes del sistema — NO Google
 * Fonts): '1-2' y '3-4' contra los PPT/guías del colegio (consigna rojo E2231A); '5-6' contra refs
 * MINEDUC 5º-6º (curriculumnacional.cl). El sistema 5-6 real es color-por-asignatura (acento neutro
 * por defecto aquí; ver nota en la entrada '5-6').
 */
export const TEMAS_DECK_INFANTIL: Record<'1-2' | '3-4' | '5-6', TemaDeckInfantilType> = {
  // 1º-2º básico — deck a COLOR, cálido; paleta derivada de las guías de 1°.
  '1-2': {
    paleta: { primario: '1F6F8B', secundario: 'FFC04D', acento: 'F5A623', fondo: 'FDF6E3', texto: '3A3A3A', consigna: 'E2231A' },
    fuente: { titulo: 'Comic Sans MS', cuerpo: 'Comic Sans MS' },
    tamano: { titulo: 48, cuerpo: 30 },
    estilo: 'pastel',
  },
  // 3º-4º básico — pastel-cálido; paleta derivada de los PPT de 3°.
  '3-4': {
    paleta: { primario: '1F6F8B', secundario: 'AEE3F2', acento: 'F2994A', fondo: 'BEE9F5', texto: '2B2B2B', consigna: 'E2231A' },
    fuente: { titulo: 'Verdana', cuerpo: 'Verdana' },
    tamano: { titulo: 44, cuerpo: 26 },
    estilo: 'pastel',
  },
  // 5º-6º básico — CALIBRADO contra refs MINEDUC reales 5º-6º (curriculumnacional.cl "Evaluación
  // Programa - OA##", muestreo de píxeles): look sobrio/maduro, título gris oscuro sobre tarjeta blanca,
  // sans humanista de sistema (Calibri), mucho aire. El sistema real es COLOR-POR-ASIGNATURA — acento:
  // Matemática E92B91 · Ciencias 93C953 · Lenguaje F7963B · Historia 06ABD8. Aquí se fija el cian como
  // acento NEUTRO por defecto hasta cablear el acento por asignatura (requiere cambio de selección/render).
  '5-6': {
    paleta: { primario: '3A3A3A', secundario: 'BDE9F4', acento: '06ABD8', fondo: 'FFFFFF', texto: '3A3A3A', consigna: 'E2231A', borde: '06ABD8' },
    fuente: { titulo: 'Calibri', cuerpo: 'Calibri' },
    tamano: { titulo: 34, cuerpo: 22 },
    estilo: 'naturaleza',
  },
};

/**
 * Mapea un nivel ("1º básico".."6º básico") al tramo de edad que elige el tema infantil. Parsea el
 * primer dígito del texto; agrupa 1-2 / 3-4 / 5-6. Si no se reconoce un dígito 1-6, default '3-4'.
 */
export function tramoDeNivel(nivel: string): '1-2' | '3-4' | '5-6' {
  const match = nivel.match(/\d/);
  const grado = match ? Number(match[0]) : NaN;
  if (grado === 1 || grado === 2) return '1-2';
  if (grado === 5 || grado === 6) return '5-6';
  // 3-4 explícito y default (incluye niveles no reconocidos).
  return '3-4';
}

/**
 * Acento por asignatura del tramo 5-6: el sistema visual MINEDUC es color-por-asignatura. Las 4
 * troncales tienen su color MUESTREADO de refs reales MINEDUC (curriculumnacional.cl, "Evaluación
 * Programa - OA##" 5º-6º). Las otras 6 asignaturas NO tienen color oficial publicado → el color lo
 * decide el producto (decisión del dueño: las decisiones estéticas son de Faro), eligiendo un hue que
 * REFERENCIA el contenido de la asignatura según las Bases Curriculares. Match por palabra clave para
 * tolerar los nombres largos del corpus ("Historia, Geografía y Ciencias Sociales", etc.).
 */
const ACENTO_ASIGNATURA_5_6: ReadonlyArray<readonly [RegExp, string]> = [
  // Troncales — color real de la ref MINEDUC.
  [/matem/i, 'E92B91'], // Matemática — magenta (ref MINEDUC)
  [/ciencias\s+naturales/i, '93C953'], // Ciencias Naturales — verde lima/vida (ref MINEDUC)
  [/lenguaje/i, 'F7963B'], // Lenguaje y Comunicación — naranjo (ref MINEDUC)
  [/historia/i, '06ABD8'], // Historia, Geografía y Cs. Sociales — cian (ref MINEDUC)
  // No-troncales — color de Faro referenciando el contenido de la materia.
  [/artes/i, '8E44AD'], // Artes Visuales — violeta: color, creatividad y expresión visual
  [/m[úu]sica/i, '5E35B1'], // Música — púrpura: ritmo, armonía y expresión sonora
  [/f[íi]sica/i, '0FA36B'], // Educación Física y Salud — verde esmeralda: vitalidad, movimiento, salud
  [/tecnolog/i, '1E6FD9'], // Tecnología — azul: lo digital y las herramientas
  [/orientaci/i, 'E8A33D'], // Orientación — ámbar cálido: bienestar y desarrollo personal/social
  [/ingl[ée]s/i, '00897B'], // Idioma Extranjero Inglés — teal: comunicación y apertura al mundo
];

/** Devuelve el acento MINEDUC de la asignatura (5-6), o `undefined` si no hay ref real de su color. */
export function acentoAsignatura5y6(asignatura: string): string | undefined {
  return ACENTO_ASIGNATURA_5_6.find(([patron]) => patron.test(asignatura))?.[1];
}

/**
 * Tema visual del deck para `(nivel, asignatura)`. El tramo elige la base; en 5-6 el acento y el MARCO
 * a sangre se tiñen POR ASIGNATURA según las refs MINEDUC (color-por-asignatura); las asignaturas sin
 * ref real usan el acento neutro del tema base. Para 1-2/3-4 devuelve el tema base sin cambios (esos
 * tramos se calibraron con un único color por los PPT del colegio, no por asignatura).
 */
export function temaDeckInfantil(nivel: string, asignatura: string): TemaDeckInfantilType {
  const tramo = tramoDeNivel(nivel);
  const base = TEMAS_DECK_INFANTIL[tramo];
  if (tramo !== '5-6') return base;
  const acento = acentoAsignatura5y6(asignatura) ?? base.paleta.acento;
  return { ...base, paleta: { ...base.paleta, acento, borde: acento } };
}

export type ClaseDeck = z.infer<typeof SchemaClaseDeck>;
export type SlideDeckType = z.infer<typeof SlideDeck>;
export type TemaDeckInfantilType = z.infer<typeof TemaDeckInfantil>;
