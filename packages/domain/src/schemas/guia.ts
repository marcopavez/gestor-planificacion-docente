// packages/domain/src/schemas/guia.ts
// Schema de la GUÍA de trabajo del alumno (Tanda 1, 3º-6º). Standalone desde un OA.
// Reusa ItemPrueba para los 'ejercicios' (hereda render, guard anti-fuga y validación por tipo).
// Híbrido: la IA redacta explicacion/ejemplo/ejercicios; el use case SOBRESCRIBE los campos fijos
// (asignatura/curso/oa/conocimiento/perfil_nivel/titulo). Nace borrador (HIL).

import { z } from 'zod';
import { ItemPrueba, fugaDeTextoEnItems, type ItemPruebaType } from './prueba.js';

export const SchemaGuia = z.object({
  // FIJOS (el use case los sobrescribe; la IA no los decide):
  asignatura: z.string(),
  curso: z.string(),
  oa: z.object({ codigo: z.string(), descripcion: z.string() }),
  conocimiento: z.string(),
  // Tanda 1 cubre SOLO 3º-6º (1-2 difiere hasta tener imágenes reales).
  perfil_nivel: z.enum(['3-4', '5-6']),
  titulo: z.string(),
  // REDACTADOS por la IA (nacen borrador):
  explicacion: z.string(),
  ejemplo: z.string(),
  ejercicios: z.array(ItemPrueba),
  desafio: ItemPrueba.optional(),
});

export type Guia = z.infer<typeof SchemaGuia>;

// Cota de cordura para texto largo de la guía (explicacion/ejemplo SON párrafos, a diferencia de los
// campos cortos del ítem). Un valor que la excede no es contenido: es la IA volcando razonamiento
// (misma defensa que la prueba). No va como .max() del schema (el SDK no soporta maxLength en structured
// outputs); se valida tras parsear y la generación se rechaza+reintenta (INV-2).
export const LIMITE_TEXTO_GUIA = 2500;

/** Detecta fuga de texto en una guía (explicacion/ejemplo largos, o fuga en los ejercicios). */
export function fugaDeTextoEnGuia(guia: Guia): { campo: string; largo: number } | null {
  const parrafos: ReadonlyArray<readonly [string, string]> = [
    ['explicacion', guia.explicacion],
    ['ejemplo', guia.ejemplo],
  ];
  for (const [campo, valor] of parrafos) {
    if (valor.length > LIMITE_TEXTO_GUIA) return { campo, largo: valor.length };
  }
  const items: ItemPruebaType[] = [...guia.ejercicios, ...(guia.desafio ? [guia.desafio] : [])];
  const fugaItem = fugaDeTextoEnItems(items);
  if (fugaItem !== null) return { campo: `ejercicio.${fugaItem.campo}`, largo: fugaItem.largo };
  return null;
}
