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
 * Temas por tramo de edad (Fase 3). Las paletas '1-2' y '3-4' están CALIBRADAS contra los PPT/guías
 * reales del colegio (color de consigna rojo E2231A, fuentes del sistema — NO Google Fonts). El tramo
 * '5-6' queda con valores provisionales hasta tener referencias.
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
  // 5º-6º básico — paleta naturaleza provisional. [VERIFICAR: faltan referencias 5-6]
  // Se añade consigna:'E2231A' por consistencia de tipo con los otros tramos.
  '5-6': {
    paleta: { primario: '16A085', secundario: '8E44AD', acento: 'E67E22', fondo: 'F7FBF9', texto: '20303A', consigna: 'E2231A' },
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

export type ClaseDeck = z.infer<typeof SchemaClaseDeck>;
export type SlideDeckType = z.infer<typeof SlideDeck>;
export type TemaDeckInfantilType = z.infer<typeof TemaDeckInfantil>;
