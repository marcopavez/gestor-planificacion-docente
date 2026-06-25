// packages/domain/src/imagenes/claveDibujo.ts
// Clave determinista del banco generado (cache por OA/concepto). Pura (INV-1), sin disco.
// FNV-1a 32-bit (helper compartido en fnv1a.ts) → hex estable, seguro como nombre de archivo.
// Plan 1 usa concepto='' (una lámina canónica por OA); Plan 2 pasa un concepto.

import { fnv1aHex } from './fnv1a.js';

/** Clave hex del dibujo para (oaCodigo, concepto). Determinista → cache reutilizable. */
export function claveDibujo(oaCodigo: string, concepto = ''): string {
  const normal = `${oaCodigo.trim()}|${concepto.trim().toLowerCase()}`;
  return fnv1aHex(normal);
}
