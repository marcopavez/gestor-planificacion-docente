// apps/web/app/api/health/route.ts
// GET /api/health — { ok, db } donde db = conectividad a Postgres (SELECT 1).
// Fase 1 (H-PA.9): la web ya depende de la DB, así que el health la incluye.

import { NextResponse } from 'next/server';
import { produccion } from '@/lib/produccion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  let db = false;
  try {
    const { pool } = produccion();
    await pool.query('SELECT 1');
    db = true;
  } catch {
    // db queda en false si la conexión falla; no propagamos el error (health no debe 500 por la DB).
    db = false;
  }
  return NextResponse.json({ ok: true, db });
}
