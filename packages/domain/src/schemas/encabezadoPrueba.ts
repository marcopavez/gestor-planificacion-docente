// packages/domain/src/schemas/encabezadoPrueba.ts
// Encabezado institucional de la prueba (Fase 4) — es CONFIG del establecimiento + datos de la unidad,
// NO contenido de IA: por eso vive FUERA del SchemaPrueba (el artefacto de IA) y se pasa al exportar
// (decisión del dueño 2026-06-09: "config pasada al exportar", sin corpus). Lo FIJO (colegio, comuna,
// escudo, % exigencia) lo aporta el caller; lo DINÁMICO (docente, título, OA con texto) sale de la
// unidad — `construirEncabezadoPrueba` (application) compone ambos. asignatura/curso NO se duplican
// aquí: el render los lee de la Prueba (única fuente de verdad).

import { z } from 'zod';

/** Una fila de OA del encabezado: código + texto, para la fila "OAx: <descripción>" del documento real. */
export const OaEncabezado = z.object({
  codigo: z.string(),
  descripcion: z.string(),
});

export const SchemaEncabezadoPrueba = z.object({
  // FIJO (config del colegio):
  nombreColegio: z.string(), // "Escuela José A. Bernales D-114"
  comuna: z.string(), // "Conchalí"
  // DESCRIPCIÓN placeholder del escudo (misma filosofía que 'pictorico'/sugerencia_imagen): nunca un
  // asset real. Ausente → no se dibuja el placeholder.
  escudo: z.string().optional(),
  // % de exigencia para la fila "Nota": dato del colegio (no se calcula nota; es formativa).
  porcentajeExigencia: z.number().optional(),
  // DINÁMICO (de la unidad):
  docente: z.string().optional(), // "Profesora: …"
  titulo: z.string(), // "Prueba de Lenguaje"
  oa: z.array(OaEncabezado).default([]), // filas OA con su texto (de la unidad; la Prueba solo trae códigos)
  // Puntaje total declarado en la cabecera (solo si la prueba lleva ponderación; formativa puede omitirlo).
  puntajeTotal: z.number().optional(),
});

export type EncabezadoPrueba = z.infer<typeof SchemaEncabezadoPrueba>;
export type OaEncabezadoType = z.infer<typeof OaEncabezado>;
