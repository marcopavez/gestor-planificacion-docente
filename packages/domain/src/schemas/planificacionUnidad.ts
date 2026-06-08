// packages/domain/src/schemas/planificacionUnidad.ts
// Schema Zod de la Planificación de Unidad — superset de los 2 formatos reales (spec 02-planificacion §4.2).
// Formato A "Planificación de Unidad" (denso) + Formato B "Bloque de Actividades" (DUA).
// Híbrido: los OA (código+texto) y los catálogos son datos fijos; la IA solo redacta proposito,
// experiencias, indicadores y sugiere qué checkboxes marcar (todo nace borrador — HIL).
// Los constraints de cobertura/conteo NO van aquí: se validan en planificacionGateV2.

import { z } from 'zod';

export const OaReferenciado = z.object({
  codigo: z.string(), // 'MA01 OA 03' / 'OAT 9' — verbatim del corpus (no se inventa)
  // 'priorizado' = Formato B (DUA); basal/complementario/transversal = Formato A.
  categoria: z.enum(['basal', 'complementario', 'transversal', 'priorizado']),
  descripcion: z.string(),
  // Sub-viñetas oficiales del OA (texto fijo del currículum); el documento real las sangra bajo la descripción.
  detalle: z.array(z.string()).default([]),
  habilidades: z.array(z.string()).default([]),
});

export const IndicadorEvaluacion = z.object({
  oa: z.string(),
  texto: z.string(),
  // Grounding: 'oficial' = del Programa de Estudio (citable); 'ia_borrador' = propuesto por IA, requiere revisión.
  fuente: z.enum(['oficial', 'ia_borrador']),
});

export const SchemaPlanificacionUnidad = z.object({
  plantilla: z.enum(['A', 'B']),
  establecimiento: z.string(),
  docente: z.string().optional(),
  asignatura: z.string(),
  nivel: z.string(), // "1º básico" … "6º básico"
  unidad: z.string(),
  // Formato A (denso):
  proposito: z.string().optional(),
  duracion_semanas: z.number().int().positive().optional(),
  horas_pedagogicas: z.number().int().positive().optional(),
  // Formato B (DUA):
  periodo: z.string().optional(),
  // Comunes:
  oa: z.array(OaReferenciado).min(1),
  experiencias: z.array(z.string()).default([]), // IA borrador
  indicadores_evaluacion: z.array(IndicadorEvaluacion).default([]), // IA borrador en v2
  evaluacion: z.object({
    tipo: z.array(z.enum(['diagnostica', 'formativa', 'sumativa'])).default([]),
    instrumentos: z.array(z.string()).default([]), // catálogo fijo
  }),
  // Campos definidos por la plantilla del colegio: habilidades_siglo_xxi, metodologias_activas,
  // micropracticas, principios_dua, tipo_aprendizaje, recursos, etc. (catálogos fijos; la IA marca).
  extras: z.record(z.string(), z.unknown()).default({}),
});

export type PlanificacionUnidad = z.infer<typeof SchemaPlanificacionUnidad>;
export type OaReferenciadoType = z.infer<typeof OaReferenciado>;
export type IndicadorEvaluacionType = z.infer<typeof IndicadorEvaluacion>;
