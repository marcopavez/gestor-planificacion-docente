// GET /api/aula/plantillas — lista los presets de planificación (Formato A/B) para el selector de la UI.

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/plantillas');

export async function GET(): Promise<NextResponse> {
  try {
    const { plantillas } = produccion();
    const todas = await plantillas.listar();
    return NextResponse.json({
      plantillas: todas.map((p) => ({ id: p.id, formato: p.formato, nombre: p.nombre, establecimiento: p.establecimiento })),
    });
  } catch (e) {
    return responderError500(log, e, {}, 'GET /plantillas falló');
  }
}
