// packages/domain/src/schemas/prueba.ts
// Schema Zod de Prueba — RF-0.7, §4.6.
// Los constraints numéricos (min/max, conteos) NO van aquí: se validan en pedagogicalGate.
// El SDK de Anthropic no soporta esos constraints en structured outputs (blueprint §3.1, §7.2).

import { z } from 'zod';

export const ItemPrueba = z.object({
  oa: z.string(), // OA al que tributa el ítem
  habilidad: z.enum(['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear']),
  tipo: z.enum([
    'seleccion_multiple',
    'verdadero_falso',
    'desarrollo',
    'completacion',
    'ordenar',
    'terminos_pareados',
    'pictorico',
  ]),
  enunciado: z.string(),
  alternativas: z
    .array(z.object({ texto: z.string(), correcta: z.boolean() }))
    .optional(), // solo para seleccion_multiple y verdadero_falso
  respuesta_correcta: z.string().optional(), // para desarrollo y completacion
  // Formativa: el foco es la retroalimentación, no la ponderación → puntaje opcional.
  puntaje: z.number().optional(),
  // El corazón formativo: qué hacer / cómo orientar al alumno si falla el ítem.
  retroalimentacion: z.string().optional(),
  // Para 'ordenar': el orden esperado de los elementos.
  secuencia_correcta: z.array(z.string()).optional(),
  // Para 'terminos_pareados': los pares correctos columna A ↔ columna B.
  pares: z.array(z.object({ columnaA: z.string(), columnaB: z.string() })).optional(),
  // Para 'pictorico': DESCRIPCIÓN placeholder de la imagen (misma filosofía que sugerencia_imagen del
  // deck) — nunca una imagen real.
  imagen: z.string().optional(),
});

export const SchemaPrueba = z.object({
  asignatura: z.string(),
  curso: z.string(),
  tabla_especificaciones: z.array(
    z.object({
      oa: z.string(),
      n_items: z.number(),
      // Formativa: la ponderación es opcional (puede no haber puntaje).
      puntaje: z.number().optional(),
    }),
  ),
  items: z.array(ItemPrueba),
  pauta_correccion: z.string(),
  // Tipo de evaluación; en v2 el foco es la FORMATIVA (default).
  tipo_evaluacion: z.enum(['diagnostica', 'formativa', 'sumativa']).default('formativa'),
  // Perfil por tramo de edad: alinea con los tramos del deck infantil (1-2 / 3-4 / 5-6).
  perfil_nivel: z.enum(['1-2', '3-4', '5-6', 'generico']),
});

export type Prueba = z.infer<typeof SchemaPrueba>;
export type ItemPruebaType = z.infer<typeof ItemPrueba>;
