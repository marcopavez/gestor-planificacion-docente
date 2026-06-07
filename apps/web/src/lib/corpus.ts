// apps/web/src/lib/corpus.ts
// Carga el corpus curado de OA (Bases Curriculares) para una materia. Fuente de verdad del
// grounding (el foso). En el demo se lee de corpus/curriculum/*.json (JSON versionado, ADR-004).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MateriaDemo } from './materias';
import { raizRepo } from './raiz';

export interface OaCorpusItem {
  readonly codigo: string;
  readonly descripcion: string;
  readonly eje?: string;
  readonly indicadores: readonly string[];
}

export interface CorpusMateria {
  readonly asignatura: string;
  readonly nivel: string;
  readonly corpusVersionId: string;
  readonly oa: readonly OaCorpusItem[];
}

// Forma del archivo corpus/curriculum/<materia>.json (curado por nosotros).
interface ArchivoCorpus {
  asignatura: string;
  nivel: string;
  objetivos_aprendizaje: Array<{ codigo: string; descripcion: string; eje?: string; indicadores?: string[] }>;
}

export function cargarCorpus(m: MateriaDemo): CorpusMateria {
  const ruta = join(raizRepo(), 'corpus', 'curriculum', `${m.corpusFile}.json`);
  const data = JSON.parse(readFileSync(ruta, 'utf8')) as ArchivoCorpus;
  return {
    asignatura: data.asignatura,
    nivel: data.nivel,
    // corpus_version inmutable (string): suficiente para reproducibilidad legal sin DB (INV-4).
    corpusVersionId: `${m.corpusFile}@demo-1`,
    oa: data.objetivos_aprendizaje.map((oa) => ({
      codigo: oa.codigo,
      descripcion: oa.descripcion,
      eje: oa.eje,
      indicadores: oa.indicadores ?? [],
    })),
  };
}
