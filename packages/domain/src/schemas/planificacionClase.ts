// packages/domain/src/schemas/planificacionClase.ts
// Schema Zod de la Planificación de Clase (clase a clase) — spec 02-aula-cascada §4.4.
// Deriva de la unidad; aquí se fija la profundidad y los momentos (guía MINEDUC §6/§8).
// Se llama ClasePlanificada para no chocar con el schema `Clase` (lección) ya existente.

import { z } from 'zod';

export const ClasePlanificada = z.object({
  numero: z.number(),
  oa: z.array(z.string()), // OA de la unidad a los que tributa
  objetivo_clase: z.string(),
  inicio: z.string(),
  desarrollo: z.string(),
  cierre: z.string(),
  recursos: z.array(z.string()),
  evaluacion_formativa: z.string(),
  indicadores: z.array(z.string()),
  duracion_min: z.number(),
});

export const SchemaPlanificacionClase = z.object({
  unidad_ref: z.string(),
  clases: z.array(ClasePlanificada),
});

export type PlanificacionClase = z.infer<typeof SchemaPlanificacionClase>;
export type ClasePlanificadaType = z.infer<typeof ClasePlanificada>;
