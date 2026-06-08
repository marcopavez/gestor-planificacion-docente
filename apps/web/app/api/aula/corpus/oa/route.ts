// GET /api/aula/corpus/oa?asignatura=&nivel= — OA (código + descripción) de un par para que la UI
// ofrezca su selección (datos fijos del corpus — RF-2.5). 400 si faltan parámetros.

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { cargarOaPorAsignaturaNivel } from '@/lib/corpus';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/corpus/oa');

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const asignatura = url.searchParams.get('asignatura');
  const nivel = url.searchParams.get('nivel');
  if (!asignatura || !nivel) {
    return NextResponse.json({ error: 'Faltan los parámetros asignatura y nivel.' }, { status: 400 });
  }

  try {
    const oa = await cargarOaPorAsignaturaNivel(asignatura, nivel);
    return NextResponse.json({ asignatura, nivel, oa });
  } catch (e) {
    // Sin bloque para (asignatura, nivel): el corpus no lo trae → 404 claro (no es error de servidor).
    if (e instanceof Error && e.name === 'BloqueCorpusNoEncontradoError') {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    return responderError500(log, e, { asignatura, nivel }, 'GET /corpus/oa falló');
  }
}
