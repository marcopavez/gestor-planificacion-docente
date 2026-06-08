// packages/domain/src/schemas/generarPlanificacion.ts
// Contratos de la generación híbrida de la Planificación de Unidad (spec 02-planificacion §1.2/§4, H-2.3):
//  - SchemaPayloadPlanificacion: lo que pide el docente (input + selección de OA + plantilla A/B).
//    Es también el payload del job asíncrono 'planificacion' (RF-2.14).
//  - SchemaBorradorPlanificacionIa: lo ÚNICO que redacta/sugiere la IA (RF-2.7). La IA nunca toca
//    los OA (datos fijos del corpus) ni amplía los catálogos: solo elige etiquetas de ellos.
// Ambos son TS puro + Zod (INV-1): el FakeLlm y los adapters reales validan contra el mismo schema.

import { z } from 'zod';

/**
 * Petición de generación de una planificación de unidad (input del docente).
 * Los OA se referencian por código (datos fijos del corpus); la categoría la deriva el use case
 * según la plantilla (Formato B → 'priorizado'; Formato A → 'basal' por defecto).
 */
export const SchemaPayloadPlanificacion = z.object({
  establecimiento: z.string().min(1),
  docente: z.string().min(1).optional(),
  asignatura: z.string().min(1),
  nivel: z.string().min(1), // "1º básico" … "6º básico"
  unidad: z.string().min(1),
  plantilla: z.enum(['A', 'B']),
  // Códigos de OA elegidos por el docente; el use case los resuelve contra el corpus (RF-2.5).
  oaCodigos: z.array(z.string().min(1)).min(1),
  // Formato A (denso):
  duracion_semanas: z.number().int().positive().optional(),
  horas_pedagogicas: z.number().int().positive().optional(),
  // Formato B (DUA):
  periodo: z.string().min(1).optional(),
});

/**
 * Selección sugerida de checkboxes: por clave de campo de plantilla → etiquetas elegidas del catálogo.
 * La IA elige EXCLUSIVAMENTE etiquetas existentes del catálogo (RF-2.6); si propone una fuera del
 * catálogo, el gate v2 la marca como advertencia (no la inventa el dominio).
 */
export const SchemaSeleccionCheckboxes = z.record(z.string(), z.array(z.string()));

/**
 * Lo que produce la IA (borrador) en la generación híbrida (RF-2.7): propósito, experiencias,
 * indicadores (se sellan como `ia_borrador` en el ensamblaje) y la selección de checkboxes.
 * NO incluye los OA: esos son datos fijos del corpus y la IA no los redacta ni altera.
 */
export const SchemaBorradorPlanificacionIa = z.object({
  proposito: z.string().default(''),
  experiencias: z.array(z.string()).default([]),
  indicadores: z
    .array(
      z.object({
        oa: z.string(), // código de OA al que tributa el indicador
        texto: z.string(),
      }),
    )
    .default([]),
  seleccion_checkboxes: SchemaSeleccionCheckboxes.default({}),
});

export type PayloadPlanificacion = z.infer<typeof SchemaPayloadPlanificacion>;
export type SeleccionCheckboxes = z.infer<typeof SchemaSeleccionCheckboxes>;
export type BorradorPlanificacionIa = z.infer<typeof SchemaBorradorPlanificacionIa>;
