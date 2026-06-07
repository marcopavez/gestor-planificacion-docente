// POST /api/aula/revision/[id]/enviar — transición HIL borrador → en_revision (R1, RF-PA.11).
// La transición la decide la máquina de estados del dominio (vía RevisarDocumentoUseCase); aquí
// solo mapeamos el resultado a HTTP (R3): no encontrado → 404; transición ilegal → 409; infra → 500.
// INV-5: consume el use case de la composition root; nunca toca Drizzle.

import { NextResponse } from 'next/server';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/revision/enviar');

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  try {
    const { revisar } = produccion();
    const resultado = await revisar.enviarARevision(id);

    if (resultado.ok) {
      return NextResponse.json({ documento: resultado.documento });
    }
    if (resultado.razon === 'no_encontrado') {
      return NextResponse.json({ error: `Documento '${id}' no encontrado.` }, { status: 404 });
    }
    // 'enviar' no aprueba: la única regla posible aquí es 'transicion_invalida' → 409.
    return NextResponse.json(
      { error: resultado.mensaje, regla: resultado.regla },
      { status: 409 },
    );
  } catch (e) {
    return responderError500(log, e, { id }, 'POST /revision/[id]/enviar falló');
  }
}
