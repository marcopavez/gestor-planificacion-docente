// packages/domain/src/imagenes/claveDibujo.ts
// Clave determinista del banco generado (cache por OA/concepto). Pura (INV-1), sin disco.
// FNV-1a 32-bit (mismo hash que el resolver del banco curado) → hex estable, seguro como nombre
// de archivo. Plan 1 usa concepto='' (una lámina canónica por OA); Plan 2 pasa un concepto.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(s: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0; // a uint32
}

/** Clave hex del dibujo para (oaCodigo, concepto). Determinista → cache reutilizable. */
export function claveDibujo(oaCodigo: string, concepto = ''): string {
  const normal = `${oaCodigo.trim()}|${concepto.trim().toLowerCase()}`;
  return fnv1a(normal).toString(16).padStart(8, '0');
}
