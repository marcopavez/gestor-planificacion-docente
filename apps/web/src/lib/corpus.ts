// apps/web/src/lib/corpus.ts
// Carga el corpus curado de OA (Bases Curriculares) para una materia, a través del puerto de
// dominio OaRepository (adapter file-based @faro/infra-corpus). Antes leía el JSON ad-hoc; ahora
// delega en el repo para que la web y el resto del monorepo compartan la misma fuente de verdad
// y el mismo corpus_version inmutable (INV-4/INV-5). Solo lectura, server-side.

import { join } from 'node:path';
import { OaRepositoryCorpus } from '@faro/infra-corpus';
import { crearLoggerHijo } from '@faro/observability';
import type { MateriaDemo } from './materias';
import { raizRepo } from './raiz';

export interface OaCorpusItem {
  readonly codigo: string;
  readonly descripcion: string;
  readonly indicadores: readonly string[];
}

export interface CorpusMateria {
  readonly asignatura: string;
  readonly nivel: string;
  readonly corpusVersionId: string;
  readonly oa: readonly OaCorpusItem[];
}

// Una sola instancia del repo por proceso (cachea manifiesto + archivos parseados).
let repo: OaRepositoryCorpus | null = null;
function obtenerRepo(): OaRepositoryCorpus {
  if (repo === null) {
    repo = new OaRepositoryCorpus(join(raizRepo(), 'corpus'), crearLoggerHijo('infra-corpus'));
  }
  return repo;
}

export async function cargarCorpus(m: MateriaDemo): Promise<CorpusMateria> {
  const r = obtenerRepo();
  // El repo resuelve el archivo por el manifiesto (asignatura+nivel) y sella corpus_version.
  const [oas, corpusVersionId] = await Promise.all([
    r.porAsignaturaNivel(m.asignatura, m.nivel),
    r.corpusVersionId(),
  ]);
  return {
    asignatura: m.asignatura,
    nivel: m.nivel,
    corpusVersionId,
    oa: oas.map((oa) => ({ codigo: oa.codigo, descripcion: oa.descripcion, indicadores: oa.indicadores })),
  };
}
