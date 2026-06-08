// packages/infra-corpus/src/schemas.ts
// Zod del corpus file-based REAL (corpus/curriculum/*.json + _manifest.json).
// OJO: la clave del array de OA en los archivos reales es `objetivos_aprendizaje` (NO `oa`);
// la spec Fase 1 §4.2 quedó desincronizada. Esta es la forma autoritativa (la del disco).
// z.object() descarta claves desconocidas (numero, fuente, vigencia, ejes, _fuente…):
// solo modelamos lo que el repositorio necesita; lo demás es metadato de procedencia.
// `detalle` SÍ se modela: son las sub-viñetas oficiales del OA (el corpus de Lenguaje las trae) y
// el documento real las sangra bajo la descripción — antes se perdían al descartarlas aquí.

import { z } from 'zod';

/** Una habilidad a nivel de archivo (Bases): forma real {letra, categoria, descripcion}. */
export const HabilidadCorpusSchema = z.object({
  letra: z.string(),
  categoria: z.string(),
  descripcion: z.string(),
});

/** Un OA del corpus file-based. `eje` es la dimensión (OAT) o el eje curricular (asignatura). */
export const OaCorpusSchema = z.object({
  codigo: z.string().min(1), // 'MA01 OA 01' / 'OAT 9' — verbatim del corpus (no se inventa)
  descripcion: z.string().min(1),
  // En el corpus real `eje` aparece como string, ausente o explícitamente null → toleramos los tres.
  eje: z.string().nullish(),
  indicadores: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  // Sub-viñetas oficiales del OA (texto fijo del currículum); ausente/null en la mayoría de bloques.
  detalle: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
});

/** Un archivo corpus/curriculum/<asignatura>-<nivel>.json (o oat-transversales.json). */
export const ArchivoCorpusSchema = z.object({
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  habilidades: z.array(HabilidadCorpusSchema).optional(),
  objetivos_aprendizaje: z.array(OaCorpusSchema).min(1),
});

/** Un bloque del manifiesto: el índice (asignatura, nivel) → archivo. */
export const BloqueManifiestoSchema = z.object({
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  archivo: z.string().min(1),
  oa: z.number().int().nonnegative(), // conteo esperado de OA (chequeo de integridad)
});

/** corpus/curriculum/_manifest.json — versión inmutable del corpus + índice de bloques. */
export const ManifiestoSchema = z.object({
  version: z.string().min(1), // 'corpus_version' inmutable (INV-4); p. ej. "2026.1"
  bloques: z.array(BloqueManifiestoSchema).min(1),
});

export type HabilidadCorpus = z.infer<typeof HabilidadCorpusSchema>;
export type OaCorpus = z.infer<typeof OaCorpusSchema>;
export type ArchivoCorpus = z.infer<typeof ArchivoCorpusSchema>;
export type BloqueManifiesto = z.infer<typeof BloqueManifiestoSchema>;
export type Manifiesto = z.infer<typeof ManifiestoSchema>;
