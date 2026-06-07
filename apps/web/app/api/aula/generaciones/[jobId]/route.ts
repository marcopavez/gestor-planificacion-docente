// GET /api/aula/generaciones/[jobId] — estado del job para el polling de la web (H-PA.9).
// Si estado==='hecho' y hay documentoId, lee la cascada persistida (listarPorRaiz) y devuelve
// los 4 borradores {unidad, clase, prueba, deck} + deckDocId (para la descarga del .pptx).
// 404 si el job no existe. INV-5: usa puertos de la composition root.

import { NextResponse } from 'next/server';
import type { DocumentoGenerado } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/generaciones/estado');

// Mapea cada tipo de documento de la cascada al payload (contenido) para la UI.
function porTipo(docs: DocumentoGenerado[], tipo: string): unknown {
  return docs.find((d) => d.tipo === tipo)?.contenido ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  // Next 15: params es asíncrono en route handlers dinámicos.
  const { jobId } = await params;

  try {
    const { jobs, documentos } = produccion();
    const estado = await jobs.obtenerEstado(jobId);
    if (estado === null) {
      return NextResponse.json({ error: `Job '${jobId}' no encontrado.` }, { status: 404 });
    }

    // Mientras no esté hecho, devolvemos solo el estado (la UI sigue haciendo polling).
    if (estado.estado !== 'hecho' || estado.documentoId === null) {
      return NextResponse.json({
        estado: estado.estado,
        intentos: estado.intentos,
        error: estado.error,
      });
    }

    // Hecho: leer la cascada completa desde la raíz (unidad) → 4 documentos.
    const cascada = await documentos.listarPorRaiz(estado.documentoId);
    const deckDoc = cascada.find((d) => d.tipo === 'clase_deck');

    return NextResponse.json({
      estado: estado.estado,
      intentos: estado.intentos,
      error: estado.error,
      documentos: {
        unidad: porTipo(cascada, 'planificacion_unidad'),
        clase: porTipo(cascada, 'planificacion_clase'),
        prueba: porTipo(cascada, 'prueba'),
        // El clase_deck persiste su payload como { deck: ClaseDeck, pptx }; la UI de producción
        // espera el ClaseDeck plano (.slides/.titulo), así que lo desempaquetamos aquí.
        deck: (porTipo(cascada, 'clase_deck') as { deck?: unknown } | null)?.deck ?? null,
      },
      // id del documento clase_deck para construir la URL de descarga del .pptx.
      deckDocId: deckDoc?.id ?? null,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error al consultar el estado del job.';
    log.error({ err: mensaje, jobId }, 'GET /generaciones/[jobId] falló');
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
