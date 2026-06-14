// GET /api/aula/documentos/[id]/guia — genera y sirve la GUÍA del alumno (Tanda 1) en .docx (o .pdf).
// Query: formato = docx | pdf (default docx); overrides institucionales opcionales (nombreColegio,
// comuna, docente) que se pasan al exportar. Sin variante (la guía tiene solo una forma).
// Render bajo demanda (refleja ediciones HIL). 404/400/422 según el documento; 503 si se pide .pdf
// y no hay LibreOffice (soffice) en el entorno.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NextResponse } from 'next/server';
import type { DatosInstitucionalesGuia } from '@faro/domain';
import { MIME_DOCX, MIME_PDF, MotorPdfNoDisponibleError } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { prepararExportGuia } from '@/lib/exportarGuia';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/guia');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const url = new URL(_req.url);
  const formato = url.searchParams.get('formato') === 'pdf' ? 'pdf' : 'docx';

  // Overrides institucionales (config "pasada al exportar"); lo no provisto cae a defaults de la guía.
  const override: Partial<DatosInstitucionalesGuia> = {
    ...(url.searchParams.get('nombreColegio') !== null
      ? { nombreColegio: url.searchParams.get('nombreColegio') as string }
      : {}),
    ...(url.searchParams.get('comuna') !== null ? { comuna: url.searchParams.get('comuna') as string } : {}),
    ...(url.searchParams.get('docente') !== null ? { docente: url.searchParams.get('docente') as string } : {}),
  };

  try {
    const prep = await prepararExportGuia(id, override);
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

    const { guiaExport } = produccion();
    const archivo =
      formato === 'pdf'
        ? await guiaExport.aPdf(prep.guia, prep.inst, id)
        : await guiaExport.aDocx(prep.guia, prep.inst, id);
    const data = await readFile(archivo.ruta);

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': formato === 'pdf' ? MIME_PDF : MIME_DOCX,
        'Content-Disposition': `attachment; filename="${basename(archivo.ruta)}"`,
        'Content-Length': String(data.length),
      },
    });
  } catch (e) {
    // .pdf pedido sin LibreOffice disponible: 503 claro (el .docx sí funciona).
    if (e instanceof MotorPdfNoDisponibleError) {
      return NextResponse.json(
        { error: 'La exportación a PDF no está disponible en este entorno (falta LibreOffice). Usa .docx.' },
        { status: 503 },
      );
    }
    return responderError500(log, e, { id, formato }, 'GET /documentos/[id]/guia falló');
  }
}
