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

/**
 * Cómo se disponen los checkbox_set de una sección en el export:
 * 'matriz' = lado a lado en columnas (la "Diversificación de la Enseñanza" del Formato A);
 * 'apilado' (default) = uno debajo del otro. Es explícito en la plantilla, no se infiere por
 * adyacencia: la "Evaluación" tiene varios checkbox_set pero el PDF real los apila (RF-2.11);
 * 'lista_en_linea' = numerada en una sola línea (los "Principios DUA" del Formato B: no son
 * checkboxes en el PDF real, sino "1 … 2 … 3 …" en una línea).
 */
export const LayoutSeccion = z.enum(['matriz', 'apilado', 'lista_en_linea']);

/**
 * Color de sombreado como hex RGB de 6 dígitos SIN '#' (formato que espera la lib `docx`):
 * 'DDEBF7', 'FFF2CC', 'F8CBAD'. El LOOK es data-driven (RF-2.3): vive en la plantilla, no en el
 * renderer; así un colegio puede ajustar su paleta sin tocar código.
 */
export const ColorHex = z.string().regex(/^[0-9A-Fa-f]{6}$/, "Color hex de 6 dígitos sin '#'");

/**
 * Tema VISUAL de una sección (opcional — sin él, la sección se renderiza sin sombreados especiales):
 * - `banda`: sombreado de la banda de título de la sección (p. ej. crema en "OBJETIVOS DE APRENDIZAJES").
 * - `cabecera`: sombreado de las celdas de cabecera de las tablas/matrices de la sección
 *   (naranja en la tabla de 4 columnas del Formato B; celeste en la matriz de Diversificación del A).
 */
export const TemaSeccion = z.object({
  banda: ColorHex.optional(),
  cabecera: ColorHex.optional(),
});

/**
 * Encabezado institucional del documento (la membrete del colegio): 3 bloques de texto (izquierda /
 * centro / derecha) que se repiten en cada página, más una banda decorativa opcional. Es lo único
 * "institucional inevitable" del LOOK (logos/textos del colegio); los logos se enchufan luego como
 * ImageRun (hoy van como texto). Vive en la plantilla, no hardcodeado por formato.
 */
export const HeaderTema = z.object({
  izquierda: z.array(z.string()).default([]),
  centro: z.array(z.string()).default([]),
  derecha: z.array(z.string()).default([]),
  bandaColor: ColorHex.optional(), // banda decorativa bajo el header (granate en el Formato B)
});

/**
 * Tema VISUAL de la plantilla (opcional). Hace data-driven el LOOK del export (RF-2.3): orientación
 * de página, encabezado institucional, líneas de título y el color de las celdas-etiqueta. Sin `tema`
 * el documento se renderiza vertical y sin membrete (comportamiento previo).
 */
export const TemaPlantilla = z.object({
  orientacion: z.enum(['vertical', 'horizontal']).optional(),
  header: HeaderTema.optional(),
  titulo: z.array(z.string()).optional(), // líneas de título centradas (p. ej. "PLANIFICACIÓN")
  tituloBanda: ColorHex.optional(), // sombreado de la banda full-width tras el título (celeste en A)
  colorEtiqueta: ColorHex.optional(), // sombreado de celdas-etiqueta de la grilla del encabezado (crema en A)
  colorCategoria: ColorHex.optional(), // sombreado de la columna de categoría de la tabla de OA (celeste en A)
});

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
  // Ausente → 'apilado'. Solo la sección que el PDF muestra como matriz lo declara 'matriz'.
  layout: LayoutSeccion.optional(),
  tema: TemaSeccion.optional(),
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
    tema: TemaPlantilla.optional(),
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
export type LayoutSeccionType = z.infer<typeof LayoutSeccion>;
export type TemaPlantillaType = z.infer<typeof TemaPlantilla>;
export type TemaSeccionType = z.infer<typeof TemaSeccion>;
export type HeaderTemaType = z.infer<typeof HeaderTema>;
