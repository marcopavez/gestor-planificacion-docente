// packages/domain/src/imagenes/claveIlustracion.ts
// Clave determinista del banco generado para ILUSTRACIONES ancladas (prueba/guía/PPT): hash de la
// DESCRIPCIÓN normalizada (no de OA/concepto como claveDibujo). Pura (INV-1), sin disco. El prefijo
// 'ilustracion|' separa el espacio de claves del de la ficha (no colisionan con claveDibujo).

import { fnv1aHex } from './fnv1a.js';

/** Clave hex (8 chars) de una ilustración por su descripción (trim, minúsculas, espacios colapsados). */
export function claveIlustracion(descripcion: string): string {
  const normal = `ilustracion|${descripcion.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  return fnv1aHex(normal);
}
