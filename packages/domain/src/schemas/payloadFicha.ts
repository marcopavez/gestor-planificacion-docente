// packages/domain/src/schemas/payloadFicha.ts
// Payload del job 'ficha_colorear' (Plan 2): la ficha es STANDALONE desde un OA (espejo de la lámina).
// El worker resuelve el OA + corpus_version vía OaRepository. 'concepto' afina el dibujo y el tema de los
// ejercicios; 'regenerar' fuerza saltarse el cache del dibujo (HIL).

import { z } from 'zod';

export const SchemaPayloadFicha = z.object({
  establecimiento: z.string().min(1),
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  oaCodigo: z.string().min(1),
  concepto: z.string().min(1).optional(),
  regenerar: z.boolean().optional(),
});
export type PayloadFicha = z.infer<typeof SchemaPayloadFicha>;
