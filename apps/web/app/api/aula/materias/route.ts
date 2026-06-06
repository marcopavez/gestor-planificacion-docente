// GET /api/aula/materias — lista las materias del demo y sus OA (para poblar la UI).

import { NextResponse } from 'next/server';
import { cargarCorpus } from '@/lib/corpus';
import { MATERIAS_DEMO } from '@/lib/materias';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const materias = MATERIAS_DEMO.map((m) => {
    const corpus = cargarCorpus(m);
    return {
      id: m.id,
      asignatura: m.asignatura,
      nivel: m.nivel,
      oa: corpus.oa.map((oa) => ({ codigo: oa.codigo, descripcion: oa.descripcion, eje: oa.eje })),
    };
  });
  return NextResponse.json({ modo: process.env['ANTHROPIC_API_KEY'] ? 'live' : 'demo', materias });
}
