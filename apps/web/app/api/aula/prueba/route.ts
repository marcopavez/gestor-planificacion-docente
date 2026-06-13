// POST /api/aula/prueba — encola la generación de una PRUEBA FORMATIVA desde una planificación de unidad
// ya persistida (Fase 4). Body = { planificacionDocumentoId }. Valida que el documento exista y sea una
// planificación de unidad ANTES de encolar (404/400 claros). Responde 202 { jobId } sin bloquear; el worker
// genera y la web hace polling en GET /api/aula/prueba/[jobId]. INV-5: usa puertos, no Drizzle.

import { NextResponse } from 'next/server';
import { SchemaPayloadPrueba } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/prueba');

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  const parsed = SchemaPayloadPrueba.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `Petición inválida: ${parsed.error.message}` }, { status: 400 });
  }
  const payload = parsed.data;

  try {
    const { documentos, jobs } = produccion();

    // La prueba deriva de una planificación de unidad real (404/400 claros antes de encolar).
    const planDoc = await documentos.porId(payload.planificacionDocumentoId);
    if (planDoc === null) {
      return NextResponse.json(
        { error: `Planificación '${payload.planificacionDocumentoId}' no encontrada.` },
        { status: 404 },
      );
    }
    if (planDoc.tipo !== 'planificacion_unidad') {
      return NextResponse.json(
        { error: `El documento '${payload.planificacionDocumentoId}' no es una planificación de unidad.` },
        { status: 400 },
      );
    }

    const jobId = await jobs.encolarPrueba(payload);
    log.info({ jobId, planificacionDocumentoId: payload.planificacionDocumentoId }, 'prueba encolada');
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    return responderError500(log, e, { planificacionDocumentoId: payload.planificacionDocumentoId }, 'POST /prueba falló');
  }
}
