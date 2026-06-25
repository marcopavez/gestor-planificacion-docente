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
  // deck) — nunca una imagen real. Es además el texto base para GENERAR la ilustración (alt-text).
  imagen: z.string().optional(),
  // Clave del PNG line-art resuelto desde `imagen` (la pone el ProcesarTrabajo*, no la IA). El export
  // resuelve <dirBanco>/<imagen_clave>.png; si falta, cae al placeholder de `imagen`. Opcional → back-compat.
  imagen_clave: z.string().optional(),
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

// Cota de cordura para el texto libre de un ítem (enunciado/imagen/retro/respuesta). Una prueba para
// niños cabe holgadamente: un valor que la excede no es contenido, es la IA "pensando en voz alta"
// dentro de un campo JSON (fuga de cadena-de-pensamiento, p. ej. el .docx con el prompt filtrado). No
// va como .max() del schema porque el SDK no soporta maxLength en structured outputs (skill claude-api);
// se valida aquí, tras parsear, y la generación se rechaza+reintenta (INV-2: basura nunca se persiste).
export const LIMITE_TEXTO_ITEM = 1000;

/**
 * Detecta fuga de texto en una lista de ítems: algún campo de texto libre supera LIMITE_TEXTO_ITEM
 * (la IA volcó razonamiento/borrador dentro de un campo JSON). La usan prueba y guía.
 */
export function fugaDeTextoEnItems(
  items: readonly ItemPruebaType[],
): { campo: string; itemIndex: number; largo: number } | null {
  for (const [itemIndex, it] of items.entries()) {
    const campos: ReadonlyArray<readonly [string, string | undefined]> = [
      ['enunciado', it.enunciado],
      ['imagen', it.imagen],
      ['retroalimentacion', it.retroalimentacion],
      ['respuesta_correcta', it.respuesta_correcta],
    ];
    for (const [campo, valor] of campos) {
      if (valor !== undefined && valor.length > LIMITE_TEXTO_ITEM) {
        return { campo, itemIndex, largo: valor.length };
      }
    }
  }
  return null;
}

/**
 * Detecta fuga de texto en una prueba: la IA volcó razonamiento/borrador en algún campo de texto libre
 * del ítem (string que supera LIMITE_TEXTO_ITEM). Devuelve el primer hallazgo o null si está sana.
 */
export function fugaDeTextoEnPrueba(
  prueba: Prueba,
): { campo: string; itemIndex: number; largo: number } | null {
  return fugaDeTextoEnItems(prueba.items);
}

/**
 * Detecta ítems con el MISMO enunciado (normalizado: trim, minúsculas, espacios colapsados). Un
 * duplicado en una prueba/ficha es un defecto de generación (p. ej. dos ítems "¿quién va 2º?" que
 * sólo cambian la imagen). El caller lanza GeneracionError → el worker reintenta (INV-2). Devuelve el
 * índice del PRIMER ítem repetido, o null si todos los enunciados son distintos.
 */
export function itemsDuplicados(
  items: readonly ItemPruebaType[],
): { itemIndex: number } | null {
  const vistos = new Set<string>();
  for (const [itemIndex, it] of items.entries()) {
    const norm = it.enunciado.trim().toLowerCase().replace(/\s+/g, ' ');
    if (norm.length === 0) continue; // enunciado vacío lo cazan otros gates, no este
    if (vistos.has(norm)) return { itemIndex };
    vistos.add(norm);
  }
  return null;
}
