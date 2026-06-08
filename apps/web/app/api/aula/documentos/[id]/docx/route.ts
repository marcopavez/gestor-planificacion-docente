// GET /api/aula/documentos/[id]/docx — genera y sirve el .docx de una planificación de unidad (H-2.7,
// RF-2.9). Render bajo demanda (refleja ediciones HIL — CA-2.5). 404/400/422 según el documento.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NextResponse } from 'next/server';
import { MIME_DOCX } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { prepararExportPlanificacion } from '@/lib/exportarPlanificacion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/docx');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  try {
    const prep = await prepararExportPlanificacion(id);
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

    const { docxExport } = produccion();
    const archivo = await docxExport.aDocx(prep.plan, prep.plantilla, prep.catalogos, id);
    const data = await readFile(archivo.ruta);

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': MIME_DOCX,
        'Content-Disposition': `attachment; filename="${basename(archivo.ruta)}"`,
        'Content-Length': String(data.length),
      },
    });
  } catch (e) {
    return responderError500(log, e, { id }, 'GET /documentos/[id]/docx falló');
  }
}
