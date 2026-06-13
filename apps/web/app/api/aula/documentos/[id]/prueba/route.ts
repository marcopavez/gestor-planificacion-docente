// GET /api/aula/documentos/[id]/prueba — genera y sirve la PRUEBA FORMATIVA (Fase 4) en .docx (o .pdf).
// Query: variante = alumno | pauta (default alumno); formato = docx | pdf (default docx); más overrides
// institucionales opcionales (nombreColegio, comuna, docente, porcentajeExigencia) que el dueño decidió
// "pasar al exportar". Render bajo demanda (refleja ediciones HIL). 404/400/422 según el documento; 503
// si se pide .pdf y no hay LibreOffice (soffice) en el entorno.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NextResponse } from 'next/server';
import type { DatosInstitucionales } from '@faro/application';
import type { VariantePrueba } from '@faro/domain';
import { MIME_DOCX, MIME_PDF, MotorPdfNoDisponibleError } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { prepararExportPrueba } from '@/lib/exportarPrueba';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/prueba');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const url = new URL(_req.url);

  // Variante: alumno (sin respuestas) o pauta (con solución + retroalimentación). Default alumno.
  const variante: VariantePrueba = url.searchParams.get('variante') === 'pauta' ? 'pauta' : 'alumno';
  const formato = url.searchParams.get('formato') === 'pdf' ? 'pdf' : 'docx';

  // Overrides institucionales (config "pasada al exportar"); lo no provisto cae a defaults de la unidad.
  const porcentajeStr = url.searchParams.get('porcentajeExigencia');
  const porcentaje = porcentajeStr !== null ? Number(porcentajeStr) : undefined;
  const override: Partial<DatosInstitucionales> = {
    ...(url.searchParams.get('nombreColegio') !== null
      ? { nombreColegio: url.searchParams.get('nombreColegio') as string }
      : {}),
    ...(url.searchParams.get('comuna') !== null ? { comuna: url.searchParams.get('comuna') as string } : {}),
    ...(url.searchParams.get('docente') !== null ? { docente: url.searchParams.get('docente') as string } : {}),
    ...(porcentaje !== undefined && Number.isFinite(porcentaje) ? { porcentajeExigencia: porcentaje } : {}),
  };

  try {
    const prep = await prepararExportPrueba(id, override);
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

    const { pruebaExport } = produccion();
    const archivo =
      formato === 'pdf'
        ? await pruebaExport.aPdf(prep.prueba, prep.encabezado, variante, id)
        : await pruebaExport.aDocx(prep.prueba, prep.encabezado, variante, id);
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
    return responderError500(log, e, { id, variante, formato }, 'GET /documentos/[id]/prueba falló');
  }
}
