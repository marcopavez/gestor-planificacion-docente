// packages/domain/src/schemas/planificacionUnidad.ts
// Schema Zod de la Planificación de Unidad (spec 02-aula-cascada §4.4).
// Núcleo oficial MINEDUC (guía §9) + `extras` para campos school-specific de la plantilla.
// Constraints de cobertura/conteo NO van aquí: se validan en planificacionGate.

import { z } from 'zod';

export const OaReferenciado = z.object({
  codigo: z.string(), // 'MA01 OA 03' — verbatim del corpus (no se inventa)
  categoria: z.enum(['basal', 'complementario', 'transversal']),
  descripcion: z.string(),
});

export const IndicadorEvaluacion = z.object({
  oa: z.string(),
  texto: z.string(),
  // Grounding: 'programa_estudio' = oficial citable; 'ia_borrador' = propuesto por IA, requiere revisión.
  fuente: z.enum(['programa_estudio', 'ia_borrador']),
});

export const SchemaPlanificacionUnidad = z.object({
  establecimiento: z.string(),
  asignatura: z.string(),
  nivel: z.string(),
  unidad: z.string(),
  proposito: z.string(),
  duracion_semanas: z.number(),
  horas_pedagogicas: z.number(),
  oa: z.array(OaReferenciado),
  habilidades: z.array(z.string()),
  indicadores_evaluacion: z.array(IndicadorEvaluacion),
  contenidos: z.object({
    conceptuales: z.array(z.string()),
    procedimentales: z.array(z.string()),
    actitudinales: z.array(z.string()),
  }),
  actividades: z.array(z.string()),
  instrumentos_evaluacion: z.array(z.string()),
  tipo_evaluacion: z.array(z.enum(['diagnostica', 'formativa', 'sumativa'])),
  // Campos definidos por la plantilla del colegio (ej. Habilidades del Siglo XXI, Metodologías, DUA).
  extras: z.record(z.string(), z.unknown()),
});

export type PlanificacionUnidad = z.infer<typeof SchemaPlanificacionUnidad>;
export type OaReferenciadoType = z.infer<typeof OaReferenciado>;
export type IndicadorEvaluacionType = z.infer<typeof IndicadorEvaluacion>;
