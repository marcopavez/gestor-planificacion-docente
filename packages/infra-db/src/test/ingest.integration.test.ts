// packages/infra-db/src/test/ingest.integration.test.ts
// Test de integración CA-PA.2 (H-PA.2): ingesta del corpus OA con pglite.
// Verifica: idempotencia (2 corridas = mismas filas), conteo exacto, corpus_version publicada.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import { crearDbTest } from './pgliteHelper.js';
import { OaRepositoryDrizzle } from '../repos/OaRepositoryDrizzle.js';
import { CorpusVersionRepositoryDrizzle } from '../repos/CorpusVersionRepositoryDrizzle.js';
import type { DrizzleDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ruta al corpus de prueba insignia (20 OA de Matemática 1º básico).
// __dirname = packages/infra-db/src/test → 4 niveles arriba = raíz del repo.
const CORPUS_PATH = join(__dirname, '../../../../corpus/curriculum/matematica-1-basico.json');

// Schema mínimo del corpus para validar la lectura en el test (evita any).
interface OaRaw {
  codigo: string;
  eje: string;
  descripcion: string;
  detalle?: string[];
  indicadores: string[];
}
interface CorpusRaw {
  asignatura: string;
  nivel: string;
  vigencia: { desde: string | null; hasta: string | null };
  objetivos_aprendizaje: OaRaw[];
}

/** Simula el mapping que hace apps/ingest/src/main.ts para la ingesta. */
function mapearOas(corpus: CorpusRaw, corpusVersionId: string) {
  return corpus.objetivos_aprendizaje.map((oa) => ({
    corpusVersionId,
    codigo: oa.codigo,
    asignatura: corpus.asignatura,
    nivel: corpus.nivel,
    eje: oa.eje,
    tipo: 'basal' as const,
    descripcion:
      oa.detalle && oa.detalle.length > 0
        ? `${oa.descripcion} ${oa.detalle.join('; ')}`
        : oa.descripcion,
    indicadores: oa.indicadores.length > 0 ? oa.indicadores : null,
    vigenciaDesde: corpus.vigencia.desde ?? null,
    vigenciaHasta: corpus.vigencia.hasta ?? null,
  }));
}

// Tiempo máximo por test: pglite puede tardar hasta 30s en Windows al cargar WASM la 1ª vez.
const T = 60_000;

describe('CA-PA.2 — Ingesta del corpus OA con CorpusVersionRepository (H-PA.2)', () => {
  it(
    'ingerir el corpus insignia DOS veces produce exactamente 20 filas y sin duplicados',
    async () => {
      const db = await crearDbTest();
      const cvRepo = new CorpusVersionRepositoryDrizzle(db as unknown as DrizzleDb);
      const oaRepo = new OaRepositoryDrizzle(db as unknown as DrizzleDb);

      // Leer y parsear el corpus real.
      const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as CorpusRaw;
      expect(raw.objetivos_aprendizaje).toHaveLength(20);

      // Primera ingesta.
      const version1 = await cvRepo.crear('matematica-1basico-v1');
      const oasInput = mapearOas(raw, version1.id);
      await oaRepo.ingestar(oasInput);

      // Segunda ingesta con la MISMA etiqueta reutilizando la misma versión (idempotencia).
      const version2 = await cvRepo.buscarPorEtiqueta('matematica-1basico-v1');
      expect(version2).not.toBeNull();
      expect(version2!.id).toBe(version1.id);
      await oaRepo.ingestar(mapearOas(raw, version2!.id));

      // Verificar: exactamente 20 filas, sin duplicados.
      const countResult = await db.execute(
        sql`SELECT COUNT(*) AS n FROM objetivo_aprendizaje WHERE corpus_version_id = ${version1.id}`,
      );
      const n = Number(
        (countResult as unknown as { rows: Array<{ n: string }> }).rows[0]?.n ?? 0,
      );
      expect(n).toBe(20);
    },
    T,
  );

  it(
    'publicar la corpus_version la deja en estado publicada y obtenerPublicadaVigente la devuelve',
    async () => {
      const db = await crearDbTest();
      const cvRepo = new CorpusVersionRepositoryDrizzle(db as unknown as DrizzleDb);
      const oaRepo = new OaRepositoryDrizzle(db as unknown as DrizzleDb);

      const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as CorpusRaw;
      const version = await cvRepo.crear('matematica-1basico-v2');
      await oaRepo.ingestar(mapearOas(raw, version.id));

      // Antes de publicar, obtenerPublicadaVigente debe devolver null.
      const antesDePublicar = await cvRepo.obtenerPublicadaVigente();
      expect(antesDePublicar).toBeNull();

      const publicada = await cvRepo.publicar(version.id);
      expect(publicada.estado).toBe('publicada');
      expect(publicada.publicadaAt).not.toBeNull();

      // Después de publicar, debe aparecer como vigente.
      const vigente = await cvRepo.obtenerPublicadaVigente();
      expect(vigente).not.toBeNull();
      expect(vigente!.id).toBe(version.id);
      expect(vigente!.estado).toBe('publicada');
    },
    T,
  );

  it(
    'nivel se guarda VERBATIM como string canónico del JSON (ej. "1º básico" con ordinal masculino)',
    async () => {
      const db = await crearDbTest();
      const cvRepo = new CorpusVersionRepositoryDrizzle(db as unknown as DrizzleDb);
      const oaRepo = new OaRepositoryDrizzle(db as unknown as DrizzleDb);

      const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as CorpusRaw;
      const version = await cvRepo.crear('matematica-1basico-v3');
      await oaRepo.ingestar(mapearOas(raw, version.id));

      // El nivel del JSON de corpus es "1º básico" (ordinal º) — debe guardarse verbatim.
      const oas = await oaRepo.porAsignaturaCurso('Matemática', raw.nivel, version.id);
      expect(oas).toHaveLength(20);
      // Verificar que el nivel almacenado coincide exactamente con el del JSON.
      expect(oas[0]?.nivel).toBe(raw.nivel);
    },
    T,
  );
});
