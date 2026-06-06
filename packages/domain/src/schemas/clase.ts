// packages/domain/src/schemas/clase.ts
// Schema Zod de Clase — RF-0.7, §4.6. Se usa en Fase 2 (M0 Aula: cascada).

import { z } from 'zod';

export const SchemaClase = z.object({
  asignatura: z.string(),
  curso: z.string(),
  oa: z.array(z.string()), // OA que aborda la clase
  titulo: z.string(),
  duracion_minutos: z.number(),
  objetivo_clase: z.string(),
  inicio: z.string(), // descripción de la actividad de inicio
  desarrollo: z.string(),
  cierre: z.string(),
  recursos: z.array(z.string()),
  evaluacion_formativa: z.string(),
});

export type Clase = z.infer<typeof SchemaClase>;
