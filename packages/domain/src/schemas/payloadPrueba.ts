// packages/domain/src/schemas/payloadPrueba.ts
// Payload del job 'prueba_formativa' (Fase 4): la prueba se genera DESDE una planificación de unidad
// ya persistida, así que el job solo referencia su documento (el worker lo carga y valida al tomarlo).
// No lleva el contenido de la unidad: la fuente de verdad es el documento de planificación.

import { z } from 'zod';

export const SchemaPayloadPrueba = z.object({
  // Documento de planificación de unidad (tipo 'planificacion_unidad') del que deriva la prueba.
  planificacionDocumentoId: z.string().uuid(),
});

export type PayloadPrueba = z.infer<typeof SchemaPayloadPrueba>;
