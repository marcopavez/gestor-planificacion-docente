// GET /api/aula/documentos/[id]/pdf — genera y sirve el .pdf de una planificación de unidad (H-2.7,
// RF-2.10). El .pdf es el .docx renderizado por LibreOffice; si no hay motor disponible → 503 claro
// (el .docx sigue funcionando). 404/400/422 según el documento.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NextResponse } from 'next/server';
import { MIME_PDF, MotorPdfNoDisponibleError } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { prepararExportPlanificacion } from '@/lib/exportarPlanificacion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/pdf');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  try {
    const prep = await prepararExportPlanificacion(id);
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

    const { pdfExport } = produccion();
    const archivo = await pdfExport.aPdf(prep.plan, prep.plantilla, prep.catalogos, id);
    const data = await readFile(archivo.ruta);

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': MIME_PDF,
        'Content-Disposition': `attachment; filename="${basename(archivo.ruta)}"`,
        'Content-Length': String(data.length),
      },
    });
  } catch (e) {
    // Sin LibreOffice: 503 claro (no es error del servidor; el .docx sigue disponible).
    if (e instanceof MotorPdfNoDisponibleError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return responderError500(log, e, { id }, 'GET /documentos/[id]/pdf falló');
  }
}
