// apps/web/src/lib/corpus.ts
// Carga el corpus curado de OA (Bases Curriculares) para una materia, a través del puerto de
// dominio OaRepository (adapter file-based @faro/infra-corpus). Antes leía el JSON ad-hoc; ahora
// delega en el repo para que la web y el resto del monorepo compartan la misma fuente de verdad
// y el mismo corpus_version inmutable (INV-4/INV-5). Solo lectura, server-side.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OaRepository } from '@faro/domain';
import { OaRepositoryCorpus } from '@faro/infra-corpus';
import { crearLoggerHijo } from '@faro/observability';
import type { MateriaDemo } from './materias';
import { raizRepo } from './raiz';

export interface OaCorpusItem {
  readonly codigo: string;
  readonly descripcion: string;
  readonly eje?: string; // eje curricular / dimensión (OAT); ausente si el corpus no lo trae
  readonly indicadores: readonly string[];
}

export interface CorpusMateria {
  readonly asignatura: string;
  readonly nivel: string;
  readonly corpusVersionId: string;
  readonly oa: readonly OaCorpusItem[];
}

// Una sola instancia del repo por proceso (cachea manifiesto + archivos parseados). Se tipa como
// el puerto OaRepository para no acoplar la web al adapter concreto (INV-5): solo la construcción
// conoce OaRepositoryCorpus.
let repo: OaRepository | null = null;
function obtenerRepo(): OaRepository {
  if (repo === null) {
    repo = new OaRepositoryCorpus(join(raizRepo(), 'corpus'), crearLoggerHijo('infra-corpus'));
  }
  return repo;
}

export async function cargarCorpus(m: MateriaDemo): Promise<CorpusMateria> {
  // El repo resuelve el archivo por el manifiesto (asignatura+nivel) y sella corpus_version en cada
  // OA; derivamos el corpus_version de las entidades en vez de un método del adapter concreto.
  const oas = await obtenerRepo().porAsignaturaNivel(m.asignatura, m.nivel);
  return {
    asignatura: m.asignatura,
    nivel: m.nivel,
    corpusVersionId: oas[0]?.corpusVersionId ?? '',
    oa: oas.map((oa) => ({ codigo: oa.codigo, descripcion: oa.descripcion, eje: oa.eje, indicadores: oa.indicadores })),
  };
}

export interface BloqueCorpus {
  readonly asignatura: string;
  readonly nivel: string;
}

// Forma mínima del manifiesto que la UI necesita para poblar los selectores (asignatura/nivel).
interface ManifiestoMin {
  bloques?: Array<{ asignatura?: unknown; nivel?: unknown }>;
}

/** Lista los bloques (asignatura, nivel) disponibles en el corpus, leyendo el manifiesto. */
export async function listarBloquesCorpus(): Promise<BloqueCorpus[]> {
  const ruta = join(raizRepo(), 'corpus', 'curriculum', '_manifest.json');
  const crudo = JSON.parse(await readFile(ruta, 'utf8')) as ManifiestoMin;
  const bloques = crudo.bloques ?? [];
  return bloques
    .filter((b): b is { asignatura: string; nivel: string } => typeof b.asignatura === 'string' && typeof b.nivel === 'string')
    .map((b) => ({ asignatura: b.asignatura, nivel: b.nivel }));
}

/** OA (código + descripción) de un par (asignatura, nivel) para que la UI ofrezca su selección. */
export async function cargarOaPorAsignaturaNivel(
  asignatura: string,
  nivel: string,
): Promise<OaCorpusItem[]> {
  const oas = await obtenerRepo().porAsignaturaNivel(asignatura, nivel);
  return oas.map((oa) => ({ codigo: oa.codigo, descripcion: oa.descripcion, eje: oa.eje, indicadores: oa.indicadores }));
}
