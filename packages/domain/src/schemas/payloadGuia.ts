// packages/domain/src/schemas/payloadGuia.ts
// Payload del job 'guia' (Tanda 1, modo manual): la guía es STANDALONE desde un OA (no deriva de una
// planificación). El worker resuelve el OA + corpus_version vía OaRepository.porAsignaturaNivel.

import { z } from 'zod';

export const SchemaPayloadGuia = z.object({
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  oaCodigo: z.string().min(1),
  conocimiento: z.string().min(1),
  establecimiento: z.string().min(1),
});

export type PayloadGuia = z.infer<typeof SchemaPayloadGuia>;
