// GET /api/aula/documentos/[id]/pptx — sirve los BYTES del .pptx de un documento clase_deck.
// 404 si el documento no existe; 400 si no es un clase_deck; 410 si la ruta ya no existe en disco
// (el .pptx vive en /generated, efímero — regenerar la cascada). INV-5: usa puertos.

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { leerPptx } from '@/lib/pptx';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/pptx');

const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  try {
    const { documentos } = produccion();
    const doc = await documentos.porId(id);
    if (doc === null) {
      return NextResponse.json({ error: `Documento '${id}' no encontrado.` }, { status: 404 });
    }
    if (doc.tipo !== 'clase_deck') {
      return NextResponse.json(
        { error: `El documento '${id}' no es un clase_deck (tipo: ${doc.tipo}).` },
        { status: 400 },
      );
    }

    const pptx = await leerPptx(doc);
    if (!pptx.ok) {
      // sin_ruta o no_existe → 410 Gone: el archivo era esperado pero ya no está disponible.
      return NextResponse.json(
        { error: 'El .pptx ya no está disponible; vuelve a generar la cascada.' },
        { status: 410 },
      );
    }

    // Servimos los bytes crudos (no base64) con headers de descarga.
    return new NextResponse(new Uint8Array(pptx.bytes), {
      status: 200,
      headers: {
        'Content-Type': MIME_PPTX,
        'Content-Disposition': `attachment; filename="${pptx.nombre}"`,
        'Content-Length': String(pptx.bytes.length),
      },
    });
  } catch (e) {
    return responderError500(log, e, { id }, 'GET /documentos/[id]/pptx falló');
  }
}
