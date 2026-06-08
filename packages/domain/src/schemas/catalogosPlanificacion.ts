// packages/domain/src/schemas/catalogosPlanificacion.ts
// Catálogos de referencia (datos fijos) de la planificación — spec 02-planificacion §4.3.
// Sets cerrados reproducidos verbatim de los PDF reales del colegio: la IA solo MARCA opciones
// de estos catálogos; nunca agrega opciones nuevas (RF-2.6). El archivo de datos vive en
// corpus/catalogos/planificacion.json; este schema valida su estructura.

import { z } from 'zod';

/** Una opción de catálogo. `abierto: true` = opción de texto libre ("Otro"/"Otros"). */
export const OpcionCatalogo = z.object({
  etiqueta: z.string().min(1), // verbatim del PDF (no se traduce ni resume)
  abierto: z.boolean().optional(),
});

const catalogo = () => z.array(OpcionCatalogo).min(1);

/** Las 11 claves de catálogo de los Formatos A y B (cerradas). */
export const SchemaCatalogosPlanificacion = z.object({
  habilidades_siglo_xxi: catalogo(),
  metodologias_activas: catalogo(),
  estrategias_ensenanza: catalogo(),
  micropracticas: catalogo(),
  estrategias_eval_formativa: catalogo(),
  estrategias_eval_sumativa: catalogo(),
  tipo_aprendizaje: catalogo(),
  tipo_evaluacion: catalogo(),
  instrumentos_evaluacion: catalogo(),
  recursos_espacios: catalogo(),
  principios_dua: catalogo(),
});

/** El archivo corpus/catalogos/planificacion.json (catálogos + metadatos de fuente). */
export const SchemaArchivoCatalogos = z.object({
  catalogos: SchemaCatalogosPlanificacion,
});

export type OpcionCatalogoType = z.infer<typeof OpcionCatalogo>;
export type CatalogosPlanificacion = z.infer<typeof SchemaCatalogosPlanificacion>;
export type ClaveCatalogo = keyof CatalogosPlanificacion;
