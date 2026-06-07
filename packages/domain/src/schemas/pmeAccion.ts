// packages/domain/src/schemas/pmeAccion.ts
// Schema Zod de PmeAccion — RF-0.7. Se usa en Fase 4 (M1 PME: Fase Anual).

import { z } from 'zod';

export const SchemaPmeAccion = z.object({
  meta_institucional: z.string(),
  objetivo_plan: z.string(), // uno de los 6 planes obligatorios del PME [E2]
  accion: z.string(),
  responsable: z.string(),
  recursos_sep: z.boolean(), // true si se financia con SEP [E3]
  monto_estimado_clp: z.number().optional(),
  periodo_inicio: z.string(), // YYYY-MM
  periodo_termino: z.string(),
  indicador_logro: z.string(),
  medio_verificacion: z.string(),
});

export type PmeAccion = z.infer<typeof SchemaPmeAccion>;
