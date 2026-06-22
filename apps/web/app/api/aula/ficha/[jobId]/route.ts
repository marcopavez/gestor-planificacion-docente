// GET /api/aula/ficha/[jobId] — estado del job de la ficha para el polling. Mientras no esté 'hecho'
// devuelve {estado, intentos, error}. Hecho → lee el documento borrador (la Ficha). 404 si no existe.

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/ficha/estado');

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
      contenido: doc.contenido, // la Ficha (borrador)
    });
  } catch (e) {
    return responderError500(log, e, { jobId }, 'GET /ficha/[jobId] falló');
  }
}
