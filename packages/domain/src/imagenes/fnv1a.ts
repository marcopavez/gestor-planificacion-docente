// packages/domain/src/imagenes/fnv1a.ts
// FNV-1a 32-bit → hex de 8 chars. Compartido por claveDibujo (cache por OA/concepto) y
// claveIlustracion (cache por descripción anclada). Una sola implementación → no diverge el hash.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Hash FNV-1a 32-bit de `s`, como hex de 8 chars con padding (estable, seguro como nombre de archivo). */
export function fnv1aHex(s: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
