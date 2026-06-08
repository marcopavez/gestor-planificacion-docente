// packages/infra-corpus/src/PlantillaRepositoryCorpus.ts
// Adapter file-based de PlantillaRepository (RF-2.4). Lee las plantillas reales del colegio desde
// corpus/plantillas/*.json — sin red ni DB (INV-1). Cada archivo valida contra
// SchemaPlantillaPlanificacion (estructura fiel a los PDF; no se inventan secciones/campos).
// INV-5: implementa el puerto de @faro/domain; el dominio nunca importa este adapter.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SchemaPlantillaPlanificacion,
  type FormatoPlantillaType,
  type PlantillaPlanificacion,
  type PlantillaRepository,
} from '@faro/domain';
import type { Logger } from '@faro/observability';
import { ArchivoCorpusInvalidoError } from './errors.js';

export class PlantillaRepositoryCorpus implements PlantillaRepository {
  private plantillas: PlantillaPlanificacion[] | null = null;

  /**
   * @param corpusDir Ruta absoluta a la carpeta `corpus/` del repo (no a `corpus/plantillas/`).
   * @param log Logger estructurado (sin console.log — CLAUDE.md).
   */
  constructor(
    private readonly corpusDir: string,
    private readonly log: Logger,
  ) {}

  async porId(id: string): Promise<PlantillaPlanificacion | null> {
    const todas = await this.cargar();
    return todas.find((p) => p.id === id) ?? null;
  }

  async activaPara(
    establecimiento: string,
    formato: FormatoPlantillaType,
  ): Promise<PlantillaPlanificacion | null> {
    const todas = await this.cargar();
    return todas.find((p) => p.establecimiento === establecimiento && p.formato === formato) ?? null;
  }

  async listar(): Promise<PlantillaPlanificacion[]> {
    return [...(await this.cargar())];
  }

  // --- internos ---

  private async cargar(): Promise<PlantillaPlanificacion[]> {
    if (this.plantillas !== null) return this.plantillas;
    const dir = join(this.corpusDir, 'plantillas');
    const entradas = await readdir(dir);
    // Orden estable por nombre de archivo para que listar() sea determinista.
    const archivos = entradas.filter((f) => f.endsWith('.json')).sort();
    const plantillas = await Promise.all(archivos.map((f) => this.cargarArchivo(dir, f)));
    this.plantillas = plantillas;
    this.log.debug({ plantillas: plantillas.length }, 'corpus: plantillas cargadas');
    return plantillas;
  }

  private async cargarArchivo(dir: string, nombre: string): Promise<PlantillaPlanificacion> {
    const texto = await readFile(join(dir, nombre), 'utf8');
    const crudo = JSON.parse(texto) as unknown;
    const parsed = SchemaPlantillaPlanificacion.safeParse(crudo);
    if (!parsed.success) {
      throw new ArchivoCorpusInvalidoError(`plantillas/${nombre}`, parsed.error.message);
    }
    return parsed.data;
  }
}
