// GET /api/aula/planificaciones?establecimiento=... — lista planificaciones (con unidades[].id).
// POST /api/aula/planificaciones — crea una planificación (body = SchemaPlanificacionAnual).
// INV-5: consume use cases / puertos de la composition root; nunca toca Drizzle.

import { NextResponse } from 'next/server';
import { SchemaPlanificacionAnual } from '@faro/domain';
import { ReglaDominioError } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/planificaciones');

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const establecimiento = url.searchParams.get('establecimiento');
  if (!establecimiento) {
    return NextResponse.json({ error: 'Falta el parámetro establecimiento.' }, { status: 400 });
  }

  // Filtros opcionales (asignatura/nivel/anio) acotan el listado; null → no se aplican.
  const asignatura = url.searchParams.get('asignatura') ?? undefined;
  const nivel = url.searchParams.get('nivel') ?? undefined;
  const anioRaw = url.searchParams.get('anio');
  const anio = anioRaw !== null ? Number(anioRaw) : undefined;
  if (anio !== undefined && Number.isNaN(anio)) {
    return NextResponse.json({ error: 'anio debe ser un número.' }, { status: 400 });
  }

  try {
    const { listarPlanes } = produccion();
    const planificaciones = await listarPlanes.ejecutar({ establecimiento, asignatura, nivel, anio });
    return NextResponse.json({ planificaciones });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error al listar planificaciones.';
    log.error({ err: mensaje }, 'GET /planificaciones falló');
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  const parsed = SchemaPlanificacionAnual.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `PlanificacionAnual inválida: ${parsed.error.message}` },
      { status: 400 },
    );
  }

  try {
    const { crearPlan } = produccion();
    const resultado = await crearPlan.ejecutar(parsed.data);
    // Resultado discriminado del use case: el gate de secuencia pudo bloquear.
    if (!resultado.ok) {
      return NextResponse.json({ razon: 'gate', gate: resultado.gate }, { status: 422 });
    }
    return NextResponse.json({ planificacion: resultado.planificacion }, { status: 201 });
  } catch (e) {
    // ReglaDominioError (sin corpus publicado, schema) → 422; el resto → 500.
    if (e instanceof ReglaDominioError) {
      return NextResponse.json({ error: e.message, regla: e.regla }, { status: 422 });
    }
    const mensaje = e instanceof Error ? e.message : 'Error al crear la planificación.';
    log.error({ err: mensaje }, 'POST /planificaciones falló');
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
