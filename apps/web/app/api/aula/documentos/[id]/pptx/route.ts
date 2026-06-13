// GET /api/aula/documentos/[id]/pptx — sirve el .pptx de un documento clase_deck.
// Dos orígenes de clase_deck conviven (drift real del repo):
//  · Cascada (ProcesarTrabajoCascadaUseCase): payload = { deck, pptx: { ruta, bytes } } → el .pptx se
//    rindió al generar y vive en /generated (efímero); se sirve leyendo esos bytes (410 si ya no está).
//  · PPT infantil (Fase 3, ProcesarTrabajoPptInfantilUseCase): payload = ClaseDeck AUTOCONTENIDO (sin
//    .pptx en disco) → se RINDE bajo demanda con exportarPptx (refleja ediciones HIL).
// Discrimina por la forma del payload: con pptx.ruta → disco; sin ella → render on-demand del deck.
// 404 si el documento no existe; 400 si no es clase_deck; 410 si el .pptx de cascada ya no está en
// disco; 422 si el payload autocontenido no es un deck válido. INV-5: usa puertos.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NextResponse } from 'next/server';
import { SchemaClaseDeck } from '@faro/domain';
import { MIME_PPTX } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { leerPptx } from '@/lib/pptx';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/pptx');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  try {
    const { documentos, pptxExport } = produccion();
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

    // Camino cascada: el .pptx ya se rindió a /generated; servir sus bytes desde disco.
    const pptx = await leerPptx(doc);
    if (pptx.ok) {
      return new NextResponse(new Uint8Array(pptx.bytes), {
        status: 200,
        headers: {
          'Content-Type': MIME_PPTX,
          'Content-Disposition': `attachment; filename="${pptx.nombre}"`,
          'Content-Length': String(pptx.bytes.length),
        },
      });
    }
    // 'no_existe' = deck de cascada con .pptx en disco que ya no está → 410 (regenerar la cascada).
    if (pptx.razon === 'no_existe') {
      return NextResponse.json(
        { error: 'El .pptx ya no está disponible; vuelve a generar la cascada.' },
        { status: 410 },
      );
    }

    // 'sin_ruta' = PPT infantil autocontenido (Fase 3): no hay .pptx en disco → render bajo demanda.
    // El deck es autocontenido (paleta/fuente/slides) → exportarPptx no necesita encabezado ni origen.
    const deck = SchemaClaseDeck.safeParse(doc.contenido);
    if (!deck.success) {
      return NextResponse.json({ error: 'El contenido del documento no es un deck válido.' }, { status: 422 });
    }
    const archivo = await pptxExport.exportarPptx(deck.data);
    const data = await readFile(archivo.ruta);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': MIME_PPTX,
        'Content-Disposition': `attachment; filename="${basename(archivo.ruta)}"`,
        'Content-Length': String(data.length),
      },
    });
  } catch (e) {
    return responderError500(log, e, { id }, 'GET /documentos/[id]/pptx falló');
  }
}
