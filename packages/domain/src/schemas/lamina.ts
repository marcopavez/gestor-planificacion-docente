// packages/domain/src/schemas/lamina.ts
// Schema de la LÁMINA para colorear (Plan 1, 1º-3º básico). Standalone desde un OA.
// Híbrido: la IA redacta SOLO la descripción del dibujo (en inglés, para Imagen); el use case
// SOBRESCRIBE los campos fijos (asignatura/curso/oa/concepto/titulo/consigna). Nace borrador (HIL).

import { z } from 'zod';

// La IA propone QUÉ dibujar anclado al OA. 'concepto' = etiqueta corta en español (display/cache);
// 'descripcion_en' = descripción visual EN INGLÉS (Imagen 4 Fast es solo-inglés).
export const SchemaDescripcionDibujo = z.object({
  concepto: z.string(),
  descripcion_en: z.string(),
});
export type DescripcionDibujo = z.infer<typeof SchemaDescripcionDibujo>;

export const SchemaLamina = z.object({
  // FIJOS (el use case los sobrescribe; la IA no los decide):
  asignatura: z.string(),
  curso: z.string(),
  oa: z.object({ codigo: z.string(), descripcion: z.string() }),
  concepto: z.string(),
  titulo: z.string(),
  consigna: z.string(),
  // REDACTADO por la IA (nace borrador): la descripción del dibujo (EN), también sirve de alt-text/placeholder.
  descripcion_dibujo: z.string(),
  // Clave determinista del banco generado: el export la resuelve a un PNG en disco (o placeholder si falta).
  imagen_clave: z.string(),
});
export type Lamina = z.infer<typeof SchemaLamina>;

// Cota de cordura: una descripción de dibujo son 1-2 frases. Excederla = la IA volcó razonamiento
// (misma defensa que la guía/prueba). No va como .max() del schema (el SDK ignora maxLength en
// structured outputs); se valida tras parsear y la generación se rechaza+reintenta (INV-2).
export const LIMITE_TEXTO_DESCRIPCION = 600;

/** Detecta fuga de texto en la descripción del dibujo. */
export function fugaDeTextoEnDescripcion(d: DescripcionDibujo): { campo: string; largo: number } | null {
  if (d.descripcion_en.length > LIMITE_TEXTO_DESCRIPCION) {
    return { campo: 'descripcion_en', largo: d.descripcion_en.length };
  }
  return null;
}

/** Grado numérico del nivel (primer dígito). NaN si no hay dígito. Para el gate "solo 1º-3º". */
export function gradoDeNivel(nivel: string): number {
  const m = nivel.match(/\d/);
  return m ? Number(m[0]) : NaN;
}
