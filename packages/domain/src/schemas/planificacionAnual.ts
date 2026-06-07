// packages/domain/src/schemas/planificacionAnual.ts
// Schema Zod de la Planificación Anual / línea de tiempo (RF-PA.4, §4.3 plan-fase-1).
// Es input del docente — NO generada por el LLM.
// Los constraints de cobertura/repetición/vigencia se validan en secuenciaAnualGate.

import { z } from 'zod';

export const SchemaUnidadPlanificada = z.object({
  orden: z.number().int().positive(),
  titulo: z.string().min(1),
  oaCodigos: z.array(z.string().min(1)).min(1),
  inicio: z.string().date().optional(),
  fin: z.string().date().optional(),
  semanas: z.number().int().positive().optional(),
});

export const SchemaPlanificacionAnual = z.object({
  establecimiento: z.string().min(1),
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  anio: z.number().int(),
  unidades: z.array(SchemaUnidadPlanificada).min(1),
});

export type UnidadPlanificada = z.infer<typeof SchemaUnidadPlanificada>;
export type PlanificacionAnual = z.infer<typeof SchemaPlanificacionAnual>;

/**
 * UnidadPlanificada enriquecida con el id de fila (Opción A del plan, type-safe).
 * La web necesita el id de la unidad para disparar la cascada (POST /generaciones).
 * El adapter ya tiene el id de fila; antes lo descartaba al mapear a UnidadPlanificada.
 */
export type UnidadPlanificadaGuardada = UnidadPlanificada & {
  readonly id: string;
};

/**
 * PlanificacionAnual enriquecida con los campos de persistencia (id + corpusVersionId).
 * Devuelta por PlanificacionAnualRepository.guardar/obtener/listar.
 * Las unidades incluyen su id de fila (UnidadPlanificadaGuardada) para que la web pueda
 * referenciarlas al encolar la cascada (RF-PA.7 / H-PA.9).
 * Los campos de persistencia son responsabilidad de infra-db, no del dominio puro.
 */
export type PlanificacionAnualGuardada = Omit<PlanificacionAnual, 'unidades'> & {
  readonly id: string;
  readonly corpusVersionId: string;
  readonly unidades: UnidadPlanificadaGuardada[];
};
