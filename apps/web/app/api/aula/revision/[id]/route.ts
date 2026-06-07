// GET /api/aula/revision/[id] — detalle de un documento para revisión HIL (RF-PA.12, H-PA.10).
// Devuelve contenido + panel de gates + estado/autor para que el revisor decida. 404 si no existe.
// INV-5: consume el puerto DocumentoRepository de la composition root; nunca toca Drizzle.

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/revision/detalle');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Next 15: params es asíncrono en route handlers dinámicos.
  const { id } = await params;

  try {
    const { documentos } = produccion();
    const doc = await documentos.porId(id);
    if (doc === null) {
      return NextResponse.json({ error: `Documento '${id}' no encontrado.` }, { status: 404 });
    }

    return NextResponse.json({
      id: doc.id,
      tipo: doc.tipo,
      estadoRevision: doc.estadoRevision,
      autorHumano: doc.autorHumano,
      // payload/contenido del artefacto (el render por tipo lo hace la UI).
      contenido: doc.contenido,
      // Reporte de gates deterministas ya corridos por el worker (esta historia los MUESTRA, no reejecuta).
      resultadoGates: doc.resultadoGates,
      createdAt: doc.createdAt,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error al obtener el documento.';
    log.error({ err: mensaje, id }, 'GET /revision/[id] falló');
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
