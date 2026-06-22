// packages/domain/src/schemas/ficha.ts
// Schema de la FICHA educativa para colorear (Plan 2, 1º-3º básico). Standalone desde un OA.
// Híbrido: la IA redacta los ejercicios (motor de prueba) y la descripción del dibujo; el use case
// SOBRESCRIBE los campos fijos (asignatura/curso/oa/concepto/perfil_nivel/titulo/consigna). Nace borrador (HIL).

import { z } from 'zod';
import { ItemPrueba, fugaDeTextoEnItems } from './prueba.js';

// Salida estructurada del motor de ejercicios de la ficha: solo la lista de ítems (el use case fija el resto).
export const SchemaEjerciciosFicha = z.object({
  ejercicios: z.array(ItemPrueba),
});
export type EjerciciosFicha = z.infer<typeof SchemaEjerciciosFicha>;

export const SchemaFicha = z.object({
  // FIJOS (el use case los sobrescribe; la IA no los decide):
  asignatura: z.string(),
  curso: z.string(),
  oa: z.object({ codigo: z.string(), descripcion: z.string() }),
  concepto: z.string(),
  // La ficha es 1º-3º básico → solo tramos '1-2' y '3-4' (data-driven por grado, como el PPT/prueba).
  perfil_nivel: z.enum(['1-2', '3-4']),
  titulo: z.string(),
  consigna_dibujo: z.string(),
  // REDACTADOS por la IA (nacen borrador): ejercicios (motor de prueba) + descripción del dibujo (alt-text).
  ejercicios: z.array(ItemPrueba),
  descripcion_dibujo: z.string(),
  // Clave determinista del banco generado: el export la resuelve a un PNG en disco (o placeholder si falta).
  imagen_clave: z.string(),
});
export type Ficha = z.infer<typeof SchemaFicha>;

/** Detecta fuga de texto en los ejercicios de la ficha (reusa la guardia de ítems de la prueba/guía). */
export function fugaDeTextoEnFicha(
  ficha: Ficha,
): { campo: string; itemIndex: number; largo: number } | null {
  return fugaDeTextoEnItems(ficha.ejercicios);
}
