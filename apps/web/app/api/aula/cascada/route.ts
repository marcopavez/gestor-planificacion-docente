// POST /api/aula/cascada — corre la cascada (Unidad→Clase→Prueba→Deck) y devuelve los 4
// artefactos + el .pptx (descarga inline). Demo: SÍNCRONO (a diferencia de ADR-003, que en
// producción encola y responde 202 con polling). Ver specs/02-aula-cascada §4.8.

import { NextResponse } from 'next/server';
import { ejecutarCascadaDemo } from '@/lib/cascadaDemo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CuerpoCascada {
  materiaId?: string;
  oaCodigos?: string[];
  unidadTitulo?: string;
}

export async function POST(req: Request) {
  let body: CuerpoCascada;
  try {
    body = (await req.json()) as CuerpoCascada;
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  if (!body.materiaId) {
    return NextResponse.json({ error: 'Falta materiaId.' }, { status: 400 });
  }

  try {
    const salida = await ejecutarCascadaDemo({
      materiaId: body.materiaId,
      oaCodigos: body.oaCodigos,
      unidadTitulo: body.unidadTitulo,
    });
    return NextResponse.json(salida);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error desconocido al generar la cascada.';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
