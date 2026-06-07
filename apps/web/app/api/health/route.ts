// apps/web/app/api/health/route.ts
// GET /api/health — devuelve { ok: true } (Fase 0: sin DB real aún).
// En Fase 1 añadirá db: boolean y anthropic: boolean (ver §4.9 del blueprint).

import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ ok: true });
}
