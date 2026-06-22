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
  fuente: z.enum(['openclipart', 'undraw', 'pixabay']),
  licencia: z.string(), // "CC0", "unDraw", "Pixabay"
});
export type EntradaImagenT = z.infer<typeof EntradaImagen>;

// Inmutable (como corpus_version): un documento puede registrar qué versión del banco vio.
export const IMAGENES_VERSION = '2026.1';

// El set semilla real lo llena la curación (Task 7). Arranca con una entrada de cada tipo para
// que los tests de integridad tengan algo válido; crece sin tocar el código.
export const CATALOGO_IMAGENES: readonly EntradaImagenT[] = [
  {
    id: 'numero_3-bn',
    topico: 'numero_3',
    materia: null,
    tramo: '1-2',
    tipo: 'linea_bn',
    archivo: 'transversal/numero_3-bn.png',
    fuente: 'openclipart',
    licencia: 'CC0',
  },
  {
    id: 'conteo-color',
    topico: 'conteo',
    materia: 'Matemática',
    tramo: '1-2',
    tipo: 'color',
    archivo: 'matematica/conteo-color.png',
    fuente: 'undraw',
    licencia: 'unDraw',
  },
];
