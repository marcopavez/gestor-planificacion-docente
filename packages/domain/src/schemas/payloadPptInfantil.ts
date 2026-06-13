// packages/domain/src/schemas/payloadPptInfantil.ts
// Payload del job 'ppt_infantil' (Fase 3): el PPT infantil se genera DESDE una planificación de unidad
// ya persistida, así que el job solo referencia su documento (el worker lo carga y valida al tomarlo).
// No lleva el contenido de la unidad: la fuente de verdad es el documento de planificación.

import { z } from 'zod';

export const SchemaPayloadPptInfantil = z.object({
  // Documento de planificación de unidad (tipo 'planificacion_unidad') del que deriva el PPT infantil.
  planificacionDocumentoId: z.string().uuid(),
});

export type PayloadPptInfantil = z.infer<typeof SchemaPayloadPptInfantil>;
