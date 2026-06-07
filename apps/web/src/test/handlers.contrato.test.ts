// apps/web/src/test/handlers.contrato.test.ts
// Contrato/forma de respuesta de los route handlers de Aula sobre pglite real (H-PA.9/H-PA.10).
// No levanta Next: importa los handlers GET y les pasa Request + params (Promise) a mano.
// Siembra el singleton de produccion.ts con una conexión pglite, de modo que conexion()
// la reutilice sin leer DATABASE_URL ni abrir un Pool de pg.
// Cubre en particular el desempaquetado del clase_deck (el bug que motivó H-PA.9): el deck
// se expone como ClaseDeck plano (.slides/.titulo), nunca como { deck, pptx }.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { ClockPort } from '@faro/domain';
import { CascadaAulaUseCase, ProcesarTrabajoCascadaUseCase } from '@faro/application';
import { crearSamplesLlm } from '@faro/infra-ai';
import { PptxExportAdapter } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import {
  corpusVersion,
  documentoGenerado,
  jobGeneracion,
  objetivoAprendizaje,
  planificacionAnual,
  trazaIa,
  unidadPlanificada,
  JobRepositoryDrizzle,
  OaRepositoryDrizzle,
  PlanificacionAnualRepositoryDrizzle,
  UnidadDeTrabajoDrizzle,
  type DrizzleDb,
} from '@faro/infra-db';
// Handlers por ruta RELATIVA: el alias @/ mapea solo a src/, y los handlers viven en app/.
import { GET as getEstado } from '../../app/api/aula/generaciones/[jobId]/route';
import { GET as getRevisionLista } from '../../app/api/aula/revision/route';
import { GET as getRevisionDetalle } from '../../app/api/aula/revision/[id]/route';

// pglite carga WASM la 1ª vez (lento en Windows) — timeout amplio.
const T = 60_000;

const __dirname = dirname(fileURLToPath(import.meta.url));
// Migraciones y samples viven fuera de apps/web; se resuelven relativo a este archivo.
const MIGRATIONS_DIR = join(__dirname, '../../../../packages/infra-db/migrations');
const MIGRATIONS = ['0000_robust_mulholland_black.sql', '0001_glorious_tinkerer.sql'];
const SAMPLES_DIR = join(__dirname, '../../../../samples/aula-matematica-1b');

// Clave del singleton que produccion.ts cachea en globalThis (Symbol.for compartido por referencia).
const CLAVE = Symbol.for('faro.web.produccion.db');

const schema = {
  corpusVersion,
  objetivoAprendizaje,
  planificacionAnual,
  unidadPlanificada,
  documentoGenerado,
  trazaIa,
  jobGeneracion,
};

const OA_CORPUS = ['MA01 OA 03', 'MA01 OA 04', 'MA01 OA 06', 'MA01 OA 08', 'MA01 OA 11'];
const ESTABLECIMIENTO = 'Colegio Test';
const reloj: ClockPort = { hoy: () => new Date('2026-06-06') };

let jobId: string;
let deckDocId: string;
let dirSalida: string;

describe('Contrato de los route handlers de Aula (pglite real, sin Next)', () => {
  beforeAll(async () => {
    const pg = new PGlite();
    for (const archivo of MIGRATIONS) {
      const migrationSql = readFileSync(join(MIGRATIONS_DIR, archivo), 'utf-8');
      const statements = migrationSql
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await pg.exec(stmt);
      }
    }
    const db = drizzle(pg, { schema });

    // --- Siembra el singleton de produccion.ts ANTES de invocar cualquier handler ---
    // pool no lo usan estos handlers de lectura; basta un stub.
    (globalThis as Record<symbol, unknown>)[CLAVE] = { db, pool: {} as unknown };

    // --- Fixture: corpus mínimo + 1 PlanificacionAnual con 1 unidad ---
    const [cv] = await db
      .insert(corpusVersion)
      .values({ etiqueta: 'v1-mate-1b', estado: 'publicada' })
      .returning();
    if (!cv) throw new Error('No se pudo crear corpus_version');

    const oaRepo = new OaRepositoryDrizzle(db as unknown as DrizzleDb);
    await oaRepo.ingestar(
      OA_CORPUS.map((codigo) => ({
        corpusVersionId: cv.id,
        codigo,
        asignatura: 'Matemática',
        nivel: '1º básico',
        descripcion: `Descripción de ${codigo}.`,
        indicadores: [],
      })),
    );

    const planRepo = new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb);
    const plan = await planRepo.guardar(
      {
        establecimiento: ESTABLECIMIENTO,
        asignatura: 'Matemática',
        nivel: '1º básico',
        anio: 2026,
        unidades: [{ orden: 1, titulo: 'Unidad 1', oaCodigos: OA_CORPUS }],
      },
      cv.id,
    );

    const filas = await db.execute(
      sql`SELECT id FROM unidad_planificada WHERE planificacion_anual_id = ${plan.id} LIMIT 1`,
    );
    const unidadId = (filas as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
    if (!unidadId) throw new Error('No se pudo crear unidad_planificada');

    // --- Encola el job y corre la cascada para persistir los 4 borradores + trazas + job hecho ---
    dirSalida = mkdtempSync(join(tmpdir(), 'faro-web-pptx-'));
    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    jobId = await jobs.encolarCascadaUnidad(unidadId);

    const useCase = new ProcesarTrabajoCascadaUseCase({
      jobs,
      planes: planRepo,
      oas: oaRepo,
      uow: new UnidadDeTrabajoDrizzle(db as unknown as DrizzleDb),
      export: new PptxExportAdapter(dirSalida, crearLoggerHijo('infra-export-web-test')),
      cascada: new CascadaAulaUseCase(crearSamplesLlm(SAMPLES_DIR)),
      clock: reloj,
      maxIntentos: 3,
    });
    const r = await useCase.ejecutarSiguiente('w');
    if (r.tipo !== 'hecho') throw new Error(`esperaba hecho, fue ${r.tipo}`);

    const docs = await db.select().from(documentoGenerado);
    const deck = docs.find((d) => d.tipo === 'clase_deck');
    if (!deck) throw new Error('esperaba un documento clase_deck persistido');
    deckDocId = deck.id;
  }, T);

  afterAll(() => {
    // Higiene: no filtrar el singleton ni el tmpdir a otros archivos del proceso.
    delete (globalThis as Record<symbol, unknown>)[CLAVE];
    if (dirSalida) rmSync(dirSalida, { recursive: true, force: true });
  });

  it('GET /generaciones/[jobId] (hecho): deck desempaquetado (slides/titulo), no { deck, pptx }', async () => {
    const res = await getEstado(new Request('http://t/'), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      estado: string;
      documentos: { unidad: unknown; clase: unknown; prueba: unknown; deck: { slides?: unknown; titulo?: unknown; deck?: unknown } };
      deckDocId: unknown;
    };
    expect(body.estado).toBe('hecho');

    // El deck va desempaquetado: ClaseDeck plano, NO el envoltorio { deck, pptx }.
    expect(Array.isArray(body.documentos.deck.slides)).toBe(true);
    expect(typeof body.documentos.deck.titulo).toBe('string');
    expect((body.documentos.deck as { deck?: unknown }).deck).toBeUndefined();

    // Los otros tres artefactos vienen presentes; deckDocId permite construir la URL de descarga.
    expect(body.documentos.unidad).not.toBeNull();
    expect(body.documentos.clase).not.toBeNull();
    expect(body.documentos.prueba).not.toBeNull();
    expect(typeof body.deckDocId).toBe('string');
  });

  it('GET /generaciones/[jobId] con un uuid inexistente → 404', async () => {
    const res = await getEstado(new Request('http://t/'), { params: Promise.resolve({ jobId: randomUUID() }) });
    expect(res.status).toBe(404);
  });

  it('GET /revision?establecimiento=...: proyección ligera de 4 docs sin contenido', async () => {
    const res = await getRevisionLista(
      new Request('http://t/api/aula/revision?establecimiento=' + encodeURIComponent(ESTABLECIMIENTO)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      documentos: Array<{ id: string; tipo: string; estadoRevision: string; createdAt: unknown; contenido?: unknown }>;
    };
    expect(Array.isArray(body.documentos)).toBe(true);
    expect(body.documentos).toHaveLength(4);
    for (const d of body.documentos) {
      expect(typeof d.id).toBe('string');
      expect(typeof d.tipo).toBe('string');
      expect(typeof d.estadoRevision).toBe('string');
      expect(d.createdAt).not.toBeUndefined();
      expect(d.contenido).toBeUndefined(); // proyección ligera: sin payload
    }
  });

  it('GET /revision/[id] sobre el deck: contenido es ClaseDeck plano + resultadoGates', async () => {
    const res = await getRevisionDetalle(new Request('http://t/'), { params: Promise.resolve({ id: deckDocId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      contenido: { slides?: unknown; deck?: unknown };
      resultadoGates: unknown;
    };
    // Unificación P-D: el clase_deck se expone plano, no como { deck, pptx }.
    expect(Array.isArray(body.contenido.slides)).toBe(true);
    expect((body.contenido as { deck?: unknown }).deck).toBeUndefined();
    expect(body.resultadoGates).not.toBeUndefined();
  });

  it('GET /revision/[id] con uuid inexistente → 404', async () => {
    const res = await getRevisionDetalle(new Request('http://t/'), { params: Promise.resolve({ id: randomUUID() }) });
    expect(res.status).toBe(404);
  });
});
