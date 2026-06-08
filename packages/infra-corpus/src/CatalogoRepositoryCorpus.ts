// packages/infra-corpus/src/CatalogoRepositoryCorpus.ts
// Loader file-based de los catálogos de referencia de la planificación (spec 02-planificacion §4.3).
// Lee corpus/catalogos/planificacion.json y lo valida contra SchemaArchivoCatalogos (sets cerrados
// reproducidos verbatim de los PDF). Sin red ni DB (INV-1). NO es un puerto de dominio: es un loader
// de datos fijos que la composition root (apps/*) y los gates consumen como `CatalogosPlanificacion`.
// INV-5: solo importa tipos/schemas de @faro/domain; el dominio nunca importa este adapter.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SchemaArchivoCatalogos, type CatalogosPlanificacion } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { ArchivoCorpusInvalidoError } from './errors.js';

export class CatalogoRepositoryCorpus {
  private cache: CatalogosPlanificacion | null = null;

  /**
   * @param corpusDir Ruta absoluta a la carpeta `corpus/` del repo (no a `corpus/catalogos/`).
   * @param log Logger estructurado (sin console.log — CLAUDE.md).
   */
  constructor(
    private readonly corpusDir: string,
    private readonly log: Logger,
  ) {}

  /** Los catálogos de checkboxes (cacheados tras la primera lectura). */
  async catalogos(): Promise<CatalogosPlanificacion> {
    if (this.cache !== null) return this.cache;
    const ruta = join(this.corpusDir, 'catalogos', 'planificacion.json');
    const crudo = JSON.parse(await readFile(ruta, 'utf8')) as unknown;
    const parsed = SchemaArchivoCatalogos.safeParse(crudo);
    if (!parsed.success) {
      throw new ArchivoCorpusInvalidoError('catalogos/planificacion.json', parsed.error.message);
    }
    this.cache = parsed.data.catalogos;
    this.log.debug({ claves: Object.keys(parsed.data.catalogos).length }, 'corpus: catálogos cargados');
    return this.cache;
  }
}
