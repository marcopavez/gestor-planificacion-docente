// packages/domain/src/schemas/claseDeck.ts
// Schema Zod del deck de clase (.pptx) — spec 02-aula-cascada §4.4.
// El PptxExportAdapter (infra-export) renderiza este modelo a .pptx (INV-6).

import { z } from 'zod';

export const SlideDeck = z.object({
  momento: z.enum(['inicio', 'desarrollo', 'cierre']),
  titulo: z.string(),
  contenido: z.array(z.string()), // viñetas
  notas_docente: z.string(),
  sugerencia_imagen: z.string().optional(),
});

export const SchemaClaseDeck = z.object({
  titulo: z.string(),
  asignatura: z.string(),
  nivel: z.string(),
  oa: z.array(z.string()),
  slides: z.array(SlideDeck),
});

export type ClaseDeck = z.infer<typeof SchemaClaseDeck>;
export type SlideDeckType = z.infer<typeof SlideDeck>;
