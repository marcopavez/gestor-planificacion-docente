// GET /api/aula/revision?establecimiento=... — cola de revisión HIL (RF-PA.12, H-PA.10).
// Lista documentos 'borrador'/'en_revision' del establecimiento, más recientes primero.
// Proyección ligera: NO devuelve payloads completos (eso es el detalle /revision/[id]).
// INV-5: consume el puerto DocumentoRepository de la composition root; nunca toca Drizzle.

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/revision/lista');

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const establecimiento = url.searchParams.get('establecimiento');
  if (!establecimiento) {
    return NextResponse.json({ error: 'Falta el parámetro establecimiento.' }, { status: 400 });
  }

  try {
    const { documentos } = produccion();
    const pendientes = await documentos.listarPendientesRevision(establecimiento);
    // Proyección ligera para la lista: sin payload ni gates (el detalle los trae).
    const items = pendientes.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      estadoRevision: d.estadoRevision,
      createdAt: d.createdAt,
    }));
    return NextResponse.json({ documentos: items });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error al listar documentos pendientes.';
    log.error({ err: mensaje }, 'GET /revision falló');
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
