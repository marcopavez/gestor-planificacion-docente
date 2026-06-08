// packages/domain/src/schemas/plantilla.ts
// Schema Zod de la PlantillaPlanificacion data-driven (spec 02-planificacion, RF-2.4/RF-2.6).
// Una plantilla describe la ESTRUCTURA del formato real del colegio (secciones → campos), no su
// contenido: qué campos hay, de qué tipo, quién los llena (origen) y qué catálogo fijo usan. El
// contenido vive en SchemaPlanificacionUnidad. Reconstruidas FIELES a los PDF (no se inventan
// estructuras): Formato A "Planificación de Unidad" (denso) y Formato B "Bloque de Actividades" (DUA).

import { z } from 'zod';
import { SchemaCatalogosPlanificacion } from './catalogosPlanificacion.js';

/** Tipo de dato de un campo de plantilla. */
export const TipoCampo = z.enum([
  'texto',
  'texto_largo',
  'lista',
  'checkbox_set',
  'tabla_oa',
  'encabezado',
  'fecha',
  'numero',
]);

/**
 * Quién produce el valor del campo (generación híbrida — §4):
 * 'fijo' = dato fijo (colegio/corpus), 'input' = lo captura el docente, 'ia' = lo redacta/sugiere la IA.
 */
export const OrigenCampo = z.enum(['fijo', 'input', 'ia']);

/** Formato real soportado: A (denso) o B (DUA). */
export const FormatoPlantilla = z.enum(['A', 'B']);

// `catalogo` referencia una de las 11 claves de corpus/catalogos/planificacion.json (DRY: derivado
// del schema de catálogos, no una lista paralela que se desincronice).
const ClaveCatalogoRef = SchemaCatalogosPlanificacion.keyof();

export const CampoPlantilla = z.object({
  clave: z.string().min(1),
  etiqueta: z.string().min(1), // verbatim del PDF
  tipo: TipoCampo,
  requerido: z.boolean(),
  origen: OrigenCampo,
  catalogo: ClaveCatalogoRef.optional(), // solo para checkbox_set
  orden: z.number().int().nonnegative(),
});

export const SeccionPlantilla = z.object({
  clave: z.string().min(1),
  titulo: z.string().min(1),
  orden: z.number().int().nonnegative(),
  campos: z.array(CampoPlantilla).min(1),
});

// Nota: z.object() descarta claves desconocidas, así que los presets pueden llevar metadatos de
// procedencia (p. ej. `_fuente`) sin declararlos aquí; se ignoran al parsear.
export const SchemaPlantillaPlanificacion = z
  .object({
    id: z.string().min(1),
    formato: FormatoPlantilla,
    nombre: z.string().min(1),
    establecimiento: z.string().min(1),
    version: z.string().min(1),
    secciones: z.array(SeccionPlantilla).min(1),
  })
  // Invariante estructural: checkbox_set ⟺ catalogo. Un checkbox_set sin catálogo no tendría
  // opciones; un catálogo en un campo que no es checkbox_set no se renderiza como set cerrado.
  .superRefine((plantilla, ctx) => {
    plantilla.secciones.forEach((seccion, si) => {
      seccion.campos.forEach((campo, ci) => {
        const esCheckbox = campo.tipo === 'checkbox_set';
        const tieneCatalogo = campo.catalogo !== undefined;
        if (esCheckbox && !tieneCatalogo) {
          ctx.addIssue({
            code: 'custom',
            message: `El campo '${campo.clave}' es checkbox_set pero no referencia un catálogo.`,
            path: ['secciones', si, 'campos', ci, 'catalogo'],
          });
        }
        if (!esCheckbox && tieneCatalogo) {
          ctx.addIssue({
            code: 'custom',
            message: `El campo '${campo.clave}' referencia un catálogo pero su tipo es '${campo.tipo}', no checkbox_set.`,
            path: ['secciones', si, 'campos', ci, 'catalogo'],
          });
        }
      });
    });
  });

export type PlantillaPlanificacion = z.infer<typeof SchemaPlantillaPlanificacion>;
export type CampoPlantillaType = z.infer<typeof CampoPlantilla>;
export type SeccionPlantillaType = z.infer<typeof SeccionPlantilla>;
export type TipoCampoType = z.infer<typeof TipoCampo>;
export type OrigenCampoType = z.infer<typeof OrigenCampo>;
export type FormatoPlantillaType = z.infer<typeof FormatoPlantilla>;
