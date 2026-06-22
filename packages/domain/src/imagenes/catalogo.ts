// packages/domain/src/imagenes/catalogo.ts
// Catálogo de imágenes curado, versionado y con licencia limpia (INV-4).
// Es DATA pura: `archivo` es una ruta relativa (string); el dominio nunca lee disco (INV-1).
// Lo consume el export (resuelve la ruta absoluta) y el use case (lista de tópicos al prompt).
import { z } from 'zod';

export const TRAMOS_IMAGEN = ['1-2', '3-4', '5-6'] as const;
export type TramoImagen = (typeof TRAMOS_IMAGEN)[number];
export const TIPOS_IMAGEN = ['linea_bn', 'color'] as const;
export type TipoImagen = (typeof TIPOS_IMAGEN)[number];

export const EntradaImagen = z.object({
  id: z.string(), // slug único: "num-3-bn", "manzana-color"
  topico: z.string(), // vocabulario controlado: "numero_3", "manzana", "triangulo"
  materia: z.string().nullable(), // null = transversal (sirve a cualquier asignatura)
  tramo: z.enum(TRAMOS_IMAGEN),
  tipo: z.enum(TIPOS_IMAGEN),
  archivo: z.string(), // ruta RELATIVA al dir de assets (PNG)
  // 'imagen-ia' = dibujos line-art generados (banco auto-llenado en runtime), coexisten con los curados.
  fuente: z.enum(['openclipart', 'undraw', 'pixabay', 'noto-emoji', 'imagen-ia']),
  licencia: z.string(), // "CC0", "unDraw", "Pixabay"
});
export type EntradaImagenT = z.infer<typeof EntradaImagen>;

// Inmutable (como corpus_version): un documento puede registrar qué versión del banco vio.
export const IMAGENES_VERSION = '2026.1';

// Set semilla curado (2026-06-21): emojis de Noto Emoji (Apache-2.0; PNG 512px en
// packages/infra-export/assets/imagenes/), revisados visualmente uno por uno. Tramo 1-2, tipo color
// (el consumidor cableado hoy es el PPT). Crece sin tocar el código: añadir un PNG + una línea aquí.
function entradaColor(topico: string, materia: string | null, sub: string): EntradaImagenT {
  return {
    id: `${topico}-color`,
    topico,
    materia,
    tramo: '1-2',
    tipo: 'color',
    archivo: `${sub}/${topico}-color.png`,
    fuente: 'noto-emoji',
    licencia: 'Apache-2.0',
  };
}

// Transversales (sirven a cualquier asignatura): números, frutas, animales, formas, objetos de aula.
const TRANSVERSALES = [
  'numero_1', 'numero_2', 'numero_3', 'numero_4', 'numero_5',
  'manzana', 'platano', 'uvas', 'perro', 'gato', 'pajaro', 'pez',
  'estrella', 'pelota', 'circulo', 'cuadrado', 'triangulo', 'lapiz', 'libro',
];
// Matemática 1º-2º.
const MATEMATICA = ['suma', 'resta', 'numeros', 'conteo'];

export const CATALOGO_IMAGENES: readonly EntradaImagenT[] = [
  ...TRANSVERSALES.map((t) => entradaColor(t, null, 'transversal')),
  ...MATEMATICA.map((t) => entradaColor(t, 'Matemática', 'matematica')),
];
