// GET /api/aula/documentos/[id]/material-colorear — genera y sirve la LÁMINA en .docx (o .pdf).
// Query: formato = docx | pdf (default docx); overrides institucionales opcionales. Render bajo demanda
// (refleja ediciones HIL). 503 si se pide .pdf y no hay LibreOffice.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NextResponse } from 'next/server';
import type { DatosInstitucionalesGuia } from '@faro/domain';
import { MIME_DOCX, MIME_PDF, MotorPdfNoDisponibleError } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { prepararExportLamina } from '@/lib/exportarLamina';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/material-colorear');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const url = new URL(_req.url);
  const formato = url.searchParams.get('formato') === 'pdf' ? 'pdf' : 'docx';

  const override: Partial<DatosInstitucionalesGuia> = {
    ...(url.searchParams.get('nombreColegio') !== null
      ? { nombreColegio: url.searchParams.get('nombreColegio') as string }
      : {}),
    ...(url.searchParams.get('comuna') !== null ? { comuna: url.searchParams.get('comuna') as string } : {}),
    ...(url.searchParams.get('docente') !== null ? { docente: url.searchParams.get('docente') as string } : {}),
  };

  try {
    const prep = await prepararExportLamina(id, override);
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

    const { laminaExport } = produccion();
    const archivo =
      formato === 'pdf'
        ? await laminaExport.aPdf(prep.lamina, prep.inst, id)
        : await laminaExport.aDocx(prep.lamina, prep.inst, id);
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
    if (e instanceof MotorPdfNoDisponibleError) {
      return NextResponse.json(
        { error: 'La exportación a PDF no está disponible en este entorno (falta LibreOffice). Usa .docx.' },
        { status: 503 },
      );
    }
    return responderError500(log, e, { id, formato }, 'GET /documentos/[id]/material-colorear falló');
  }
}
