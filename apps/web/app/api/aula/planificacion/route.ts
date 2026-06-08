// POST /api/aula/planificacion — encola la generación híbrida de una Planificación de Unidad (H-2.7,
// RF-2.14). Body = SchemaPayloadPlanificacion. Valida que exista una plantilla activa para
// (establecimiento, formato) ANTES de encolar (404 claro). Responde 202 { jobId } sin bloquear;
// el worker genera y la web hace polling en GET /api/aula/planificacion/[jobId]. INV-5: usa puertos.

import { NextResponse } from 'next/server';
import { SchemaPayloadPlanificacion } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/planificacion');

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  const parsed = SchemaPayloadPlanificacion.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `Petición inválida: ${parsed.error.message}` }, { status: 400 });
  }
  const payload = parsed.data;

  try {
    const { plantillas, jobs } = produccion();

    // Plantilla activa para (establecimiento, formato): sin ella no hay layout que generar (404 claro).
    const plantilla = await plantillas.activaPara(payload.establecimiento, payload.plantilla);
    if (plantilla === null) {
      return NextResponse.json(
        { error: `No hay una plantilla de Formato ${payload.plantilla} para '${payload.establecimiento}'.` },
        { status: 404 },
      );
    }

    const jobId = await jobs.encolarPlanificacion(payload);
    log.info({ jobId, asignatura: payload.asignatura, nivel: payload.nivel, formato: payload.plantilla }, 'planificación encolada');
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    return responderError500(log, e, { asignatura: payload.asignatura }, 'POST /planificacion falló');
  }
}
