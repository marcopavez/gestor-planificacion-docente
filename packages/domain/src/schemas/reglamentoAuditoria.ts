// packages/domain/src/schemas/reglamentoAuditoria.ts
// Schema Zod de ReglamentoAuditoria — RF-0.7. Se usa en Fase 3 (M3 Normativo).

import { z } from 'zod';

const HallazgoReglamento = z.object({
  articulo: z.string(), // p.ej. 'Art. 5'
  descripcion: z.string(),
  cumple: z.boolean(),
  norma_ref: z.string(), // referencia canónica a Decreto 67 u otra norma
  recomendacion: z.string().optional(),
});

export const SchemaReglamentoAuditoria = z.object({
  establecimiento_id: z.string(),
  fecha_auditoria: z.string(), // ISO 8601
  total_articulos_revisados: z.number(),
  articulos_conformes: z.number(),
  hallazgos: z.array(HallazgoReglamento),
  resumen_ejecutivo: z.string(),
  requiere_correccion: z.boolean(),
});

export type ReglamentoAuditoria = z.infer<typeof SchemaReglamentoAuditoria>;
