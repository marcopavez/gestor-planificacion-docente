// GET /api/aula/planificacion/[jobId] — estado del job de planificación para el polling (H-2.7).
// Mientras no esté 'hecho' devuelve solo {estado, intentos, error}. Hecho → lee el documento
// borrador persistido y devuelve su contenido (la PlanificacionUnidad), gates, estado de revisión y
// autor, todo lo que la pantalla de revisión HIL necesita. 404 si el job no existe. INV-5: puertos.

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/planificacion/estado');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params;

  try {
    const { jobs, documentos } = produccion();
    const estado = await jobs.obtenerEstado(jobId);
    if (estado === null) {
      return NextResponse.json({ error: `Job '${jobId}' no encontrado.` }, { status: 404 });
    }

    if (estado.estado !== 'hecho' || estado.documentoId === null) {
      return NextResponse.json({ estado: estado.estado, intentos: estado.intentos, error: estado.error });
    }

    const doc = await documentos.porId(estado.documentoId);
    if (doc === null) {
      return NextResponse.json({ error: 'El documento generado no se encontró.' }, { status: 404 });
    }

    return NextResponse.json({
      estado: estado.estado,
      documentoId: doc.id,
      tipo: doc.tipo,
      estadoRevision: doc.estadoRevision,
      autorHumano: doc.autorHumano,
      contenido: doc.contenido, // la PlanificacionUnidad (borrador editable en HIL)
      resultadoGates: doc.resultadoGates,
    });
  } catch (e) {
    return responderError500(log, e, { jobId }, 'GET /planificacion/[jobId] falló');
  }
}
