// packages/infra-corpus/src/OaRepositoryCorpus.ts
// Adapter file-based de OaRepository (RF-1.4, CA-1.2). Lee el corpus curado de las Bases
// Curriculares desde corpus/curriculum/*.json — SIN red ni DB (INV-1). Resuelve cada archivo
// por el MANIFIESTO (match exacto asignatura+nivel → archivo), NO por slug: los nombres llevan
// tildes y el OAT no sigue el patrón <asig>-<nivel>-basico.json.
// INV-5: importa el puerto de @faro/domain; el dominio nunca importa este adapter.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OaRepository, ObjetivoAprendizaje } from '@faro/domain';
import type { Logger } from '@faro/observability';
import {
  ArchivoCorpusInvalidoError,
  BloqueCorpusNoEncontradoError,
  CorpusVersionDesconocidaError,
} from './errors.js';
import { ArchivoCorpusSchema, ManifiestoSchema, type ArchivoCorpus, type Manifiesto } from './schemas.js';

export class OaRepositoryCorpus implements OaRepository {
  private manifiesto: Manifiesto | null = null;
  // Cache de archivos ya parseados (clave = nombre de archivo del manifiesto).
  private readonly archivos = new Map<string, ArchivoCorpus>();
  // Índice código → OA sobre TODO el corpus (para porIds); se construye una sola vez.
  private indicePorCodigo: Map<string, ObjetivoAprendizaje> | null = null;

  /**
   * @param corpusDir Ruta absoluta a la carpeta `corpus/` del repo (no a `corpus/curriculum/`).
   * @param log Logger estructurado (sin console.log — CLAUDE.md).
   */
  constructor(
    private readonly corpusDir: string,
    private readonly log: Logger,
  ) {}

  /** corpus@<version> — identificador inmutable del snapshot del corpus (INV-4). */
  async corpusVersionId(): Promise<string> {
    const m = await this.cargarManifiesto();
    return `corpus@${m.version}`;
  }

  /**
   * Compatibilidad con el puerto. El corpus file-based tiene una sola versión (la del manifiesto)
   * y no guarda histórico, así que validamos que la versión pedida sea la disponible y NO la
   * ignoramos en silencio (evita un caller que crea estar leyendo otra versión — INV-4). `curso`
   * se trata como `nivel`. Para consultas nuevas usa `porAsignaturaNivel` (no exige versión).
   */
  async porAsignaturaCurso(
    asignatura: string,
    curso: string,
    corpusVersionId: string,
  ): Promise<ObjetivoAprendizaje[]> {
    const disponible = await this.corpusVersionId();
    if (corpusVersionId !== disponible) {
      throw new CorpusVersionDesconocidaError(corpusVersionId, disponible);
    }
    return this.porAsignaturaNivel(asignatura, curso);
  }

  async porAsignaturaNivel(asignatura: string, nivel: string): Promise<ObjetivoAprendizaje[]> {
    const m = await this.cargarManifiesto();
    const bloque = m.bloques.find((b) => b.asignatura === asignatura && b.nivel === nivel);
    if (bloque === undefined) {
      throw new BloqueCorpusNoEncontradoError(asignatura, nivel);
    }

    const archivo = await this.cargarArchivo(bloque.archivo);
    const corpusVersionId = `corpus@${m.version}`;
    const oas = archivo.objetivos_aprendizaje.map((oa) =>
      mapearADominio(oa, archivo.asignatura, archivo.nivel, corpusVersionId),
    );
    this.log.debug({ asignatura, nivel, archivo: bloque.archivo, oa: oas.length }, 'corpus: bloque cargado');
    return oas;
  }

  async porIds(ids: readonly string[]): Promise<ObjetivoAprendizaje[]> {
    if (ids.length === 0) return [];
    // file-based: el id ES el código del OA. Recorremos todos los bloques del manifiesto y
    // filtramos por código (preservando el orden de `ids` pedido por el caller).
    const porCodigo = await this.cargarIndicePorCodigo();
    const out: ObjetivoAprendizaje[] = [];
    for (const id of ids) {
      const oa = porCodigo.get(id);
      if (oa !== undefined) out.push(oa);
    }
    return out;
  }

  // --- internos ---

  private async cargarManifiesto(): Promise<Manifiesto> {
    if (this.manifiesto !== null) return this.manifiesto;
    const ruta = join(this.corpusDir, 'curriculum', '_manifest.json');
    const crudo = await leerJson(ruta);
    const parsed = ManifiestoSchema.safeParse(crudo);
    if (!parsed.success) {
      throw new ArchivoCorpusInvalidoError('curriculum/_manifest.json', parsed.error.message);
    }
    this.manifiesto = parsed.data;
    return parsed.data;
  }

  private async cargarArchivo(nombre: string): Promise<ArchivoCorpus> {
    const cacheado = this.archivos.get(nombre);
    if (cacheado !== undefined) return cacheado;
    const ruta = join(this.corpusDir, 'curriculum', nombre);
    const crudo = await leerJson(ruta);
    const parsed = ArchivoCorpusSchema.safeParse(crudo);
    if (!parsed.success) {
      throw new ArchivoCorpusInvalidoError(nombre, parsed.error.message);
    }
    this.archivos.set(nombre, parsed.data);
    return parsed.data;
  }

  private async cargarIndicePorCodigo(): Promise<Map<string, ObjetivoAprendizaje>> {
    if (this.indicePorCodigo !== null) return this.indicePorCodigo;
    const m = await this.cargarManifiesto();
    const corpusVersionId = `corpus@${m.version}`;
    // Lectura concurrente de todos los bloques: una sola pasada por el event loop en vez de
    // ~57 awaits secuenciales (que se starvan bajo carga del resto de la suite).
    const archivos = await Promise.all(m.bloques.map((b) => this.cargarArchivo(b.archivo)));
    const indice = new Map<string, ObjetivoAprendizaje>();
    for (const archivo of archivos) {
      for (const oa of archivo.objetivos_aprendizaje) {
        indice.set(oa.codigo, mapearADominio(oa, archivo.asignatura, archivo.nivel, corpusVersionId));
      }
    }
    this.indicePorCodigo = indice;
    return indice;
  }
}

/**
 * Mapea un OA del corpus file-based a la entidad de dominio. El corpus no trae los campos
 * DB-only obligatorios → se sintetizan: id = código (no hay PK de DB), asignatura/nivel del
 * archivo, corpusVersionId del manifiesto, vigencias = null (la fecha del decreto está [VERIFICAR]).
 * `eje` (string|null|ausente en el corpus) se normaliza a string|undefined.
 */
function mapearADominio(
  oa: ArchivoCorpus['objetivos_aprendizaje'][number],
  asignatura: string,
  nivel: string,
  corpusVersionId: string,
): ObjetivoAprendizaje {
  return {
    id: oa.codigo,
    corpusVersionId,
    codigo: oa.codigo,
    asignatura,
    nivel,
    descripcion: oa.descripcion,
    eje: oa.eje ?? undefined,
    detalle: oa.detalle ?? [],
    indicadores: oa.indicadores,
    vigenciaDesde: null,
    vigenciaHasta: null,
  };
}

async function leerJson(ruta: string): Promise<unknown> {
  const texto = await readFile(ruta, 'utf8');
  return JSON.parse(texto) as unknown;
}
