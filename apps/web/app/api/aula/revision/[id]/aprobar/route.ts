// POST /api/aula/revision/[id]/aprobar — transición HIL en_revision → aprobado (R2, RF-PA.11, INV-3).
// Body: { autorHumano: string (no vacío) }. La aprobación SIEMPRE pasa por la máquina del dominio,
// que exige autorHumano (Art. 8 bis). Mapeo R3: body inválido → 400; no encontrado → 404;
// regla 'aprobacion_sin_humano' → 422; otra transición ilegal → 409; infra → 500.
// INV-5: consume el use case de la composition root; nunca toca Drizzle.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/revision/aprobar');

// R2: el revisor se identifica con un email no vacío (no se valida formato por ahora).
const BodyAprobar = z.object({ autorHumano: z.string().min(1) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  const parsed = BodyAprobar.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Cuerpo inválido: ${parsed.error.message}` },
      { status: 400 },
    );
  }

  try {
    const { revisar } = produccion();
    const resultado = await revisar.aprobar(id, parsed.data.autorHumano);

    if (resultado.ok) {
      return NextResponse.json({ documento: resultado.documento });
    }
    if (resultado.razon === 'no_encontrado') {
      return NextResponse.json({ error: `Documento '${id}' no encontrado.` }, { status: 404 });
    }
    // R3: aprobar sin revisor → 422; cualquier otra transición ilegal (p. ej. desde 'borrador') → 409.
    const status = resultado.regla === 'aprobacion_sin_humano' ? 422 : 409;
    return NextResponse.json({ error: resultado.mensaje, regla: resultado.regla }, { status });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error al aprobar el documento.';
    log.error({ err: mensaje, id }, 'POST /revision/[id]/aprobar falló');
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
