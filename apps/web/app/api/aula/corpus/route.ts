// GET /api/aula/corpus — lista los bloques (asignatura, nivel) disponibles en el corpus, para
// poblar los selectores de la pantalla de generación de planificación (H-2.7).

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { listarBloquesCorpus } from '@/lib/corpus';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/corpus');

export async function GET(): Promise<NextResponse> {
  try {
    const bloques = await listarBloquesCorpus();
    return NextResponse.json({ bloques });
  } catch (e) {
    return responderError500(log, e, {}, 'GET /corpus falló');
  }
}
