// POST /api/aula/material-colorear — encola la generación de una LÁMINA para colorear (Plan 1). Standalone
// desde un OA: body = { establecimiento, asignatura, nivel, oaCodigo, concepto?, regenerar? }. 202 { jobId }.

import { NextResponse } from 'next/server';
import { SchemaPayloadMaterialColorear } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/material-colorear');

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  const parsed = SchemaPayloadMaterialColorear.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `Petición inválida: ${parsed.error.message}` }, { status: 400 });
  }

  try {
    const { jobs } = produccion();
    const jobId = await jobs.encolarMaterialColorear(parsed.data);
    log.info({ jobId, oaCodigo: parsed.data.oaCodigo }, 'material para colorear encolado');
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    return responderError500(log, e, { oaCodigo: parsed.data.oaCodigo }, 'POST /material-colorear falló');
  }
}
