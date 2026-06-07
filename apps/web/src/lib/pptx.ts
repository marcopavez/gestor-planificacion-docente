// apps/web/src/lib/pptx.ts
// Helper server-side: dado un documento clase_deck, resuelve payload.pptx.ruta, valida que el
// archivo exista en disco y lee sus bytes. Si la ruta no existe → 410 (Gone), no 500: el .pptx
// se renderiza a /generated (efímero/gitignored), así que su ausencia es un estado esperado
// (regenerar la cascada), no un error del servidor. Decisión interina P5 del plan: bytes en disco.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { DocumentoGenerado } from '@faro/domain';

/** Resultado discriminado para que el route handler mapee a 200 / 410 sin reventar. */
export type ResultadoPptx =
  | { readonly ok: true; readonly nombre: string; readonly bytes: Buffer }
  // 'sin_ruta' = el payload no trae pptx.ruta (documento mal formado);
  // 'no_existe' = la ruta existía al generar pero el archivo ya no está en disco.
  | { readonly ok: false; readonly razon: 'sin_ruta' | 'no_existe' };

// Forma mínima del payload de un clase_deck (el worker guarda { deck, pptx: { ruta, bytes } }).
interface PayloadDeck {
  pptx?: { ruta?: unknown };
}

/** Extrae la ruta del .pptx del payload de un documento clase_deck (sin asumir su forma). */
function rutaPptx(doc: DocumentoGenerado): string | null {
  const payload = doc.contenido;
  if (typeof payload !== 'object' || payload === null) return null;
  const ruta = (payload as PayloadDeck).pptx?.ruta;
  return typeof ruta === 'string' && ruta.length > 0 ? ruta : null;
}

/** Lee los bytes del .pptx de un documento clase_deck para servirlo como descarga. */
export async function leerPptx(doc: DocumentoGenerado): Promise<ResultadoPptx> {
  const ruta = rutaPptx(doc);
  if (ruta === null) return { ok: false, razon: 'sin_ruta' };
  if (!existsSync(ruta)) return { ok: false, razon: 'no_existe' };

  const bytes = await readFile(ruta);
  return { ok: true, nombre: basename(ruta), bytes };
}
