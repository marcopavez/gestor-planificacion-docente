// packages/domain/src/imagenes/resolver.ts
// Resolución PURA (INV-1): qué imagen del catálogo corresponde a (tópico, asignatura, tramo, tipo).
// Determinista por `seed` → reproducible (coherente con corpus_version). Sin I/O: devuelve la entrada
// (con su `archivo` relativo); leer el PNG es responsabilidad del adapter de export.
import { CATALOGO_IMAGENES, type EntradaImagenT, type TipoImagen, type TramoImagen } from './catalogo.js';

/** Una entrada aplica si coincide tipo+tramo y la materia es la misma o transversal (null). */
function aplica(e: EntradaImagenT, asignatura: string, tramo: TramoImagen, tipo: TipoImagen): boolean {
  return e.tipo === tipo && e.tramo === tramo && (e.materia === null || e.materia === asignatura);
}

/** Hash estable y barato de un string (FNV-1a de 32 bits) para la selección determinista. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Variante testeable: opera sobre un catálogo inyectado. */
export function topicosDisponiblesEn(
  catalogo: readonly EntradaImagenT[],
  asignatura: string,
  tramo: TramoImagen,
  tipo: TipoImagen,
): string[] {
  const topicos = new Set<string>();
  for (const e of catalogo) {
    if (aplica(e, asignatura, tramo, tipo)) topicos.add(e.topico);
  }
  return [...topicos];
}

/** Variante testeable: opera sobre un catálogo inyectado. */
export function resolverImagenEn(
  catalogo: readonly EntradaImagenT[],
  topico: string,
  asignatura: string,
  tramo: TramoImagen,
  tipo: TipoImagen,
  seed = '',
): EntradaImagenT | null {
  const candidatas = catalogo.filter((e) => e.topico === topico && aplica(e, asignatura, tramo, tipo));
  if (candidatas.length === 0) return null;
  // Orden estable por id + índice determinista por seed → misma entrada para el mismo documento.
  const ordenadas = [...candidatas].sort((a, b) => a.id.localeCompare(b.id));
  // `?? null`: bajo noUncheckedIndexedAccess el acceso indexado es `T | undefined`; el índice es
  // siempre válido (candidatas.length>0), pero normalizamos a null para honrar la firma.
  return ordenadas[hash(seed) % ordenadas.length] ?? null;
}

// --- API pública: liga al catálogo real ---
export function topicosDisponiblesPara(asignatura: string, tramo: TramoImagen, tipo: TipoImagen): string[] {
  return topicosDisponiblesEn(CATALOGO_IMAGENES, asignatura, tramo, tipo);
}
export function resolverImagen(
  topico: string,
  asignatura: string,
  tramo: TramoImagen,
  tipo: TipoImagen,
  seed?: string,
): EntradaImagenT | null {
  return resolverImagenEn(CATALOGO_IMAGENES, topico, asignatura, tramo, tipo, seed);
}
