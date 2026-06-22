// packages/domain/src/schemas/payloadMaterialColorear.ts
// Payload del job 'material_colorear' (Plan 1): la lámina es STANDALONE desde un OA (espejo de la guía).
// El worker resuelve el OA + corpus_version vía OaRepository.porAsignaturaNivel.
// 'concepto' (opcional) afina el dibujo (Plan 2); 'regenerar' fuerza saltarse el cache (HIL).

import { z } from 'zod';

export const SchemaPayloadMaterialColorear = z.object({
  establecimiento: z.string().min(1),
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  oaCodigo: z.string().min(1),
  concepto: z.string().min(1).optional(),
  regenerar: z.boolean().optional(),
});

export type PayloadMaterialColorear = z.infer<typeof SchemaPayloadMaterialColorear>;
