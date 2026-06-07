// POST /api/aula/generaciones { unidadPlanificadaId } — encola la cascada para una unidad.
// Responde 202 con { jobId } sin bloquear (ADR-003): el worker procesa el job; la web hace polling
// en GET /api/aula/generaciones/[jobId]. INV-5: usa puertos de la composition root.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/generaciones');

const SchemaCuerpo = z.object({
  unidadPlanificadaId: z.string().uuid('unidadPlanificadaId debe ser un UUID'),
});

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  const parsed = SchemaCuerpo.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { unidadPlanificadaId } = parsed.data;

  try {
    const { planes, jobs } = produccion();

    // Validar que la unidad exista ANTES de encolar → 404 claro (evita jobs que el worker no puede resolver).
    const unidad = await planes.obtenerUnidad(unidadPlanificadaId);
    if (unidad === null) {
      return NextResponse.json(
        { error: `Unidad planificada '${unidadPlanificadaId}' no encontrada.` },
        { status: 404 },
      );
    }

    const jobId = await jobs.encolarCascadaUnidad(unidadPlanificadaId);
    log.info({ jobId, unidadPlanificadaId }, 'cascada encolada');
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    return responderError500(log, e, { unidadPlanificadaId }, 'POST /generaciones falló');
  }
}
