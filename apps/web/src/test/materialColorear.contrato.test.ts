// apps/web/src/test/materialColorear.contrato.test.ts
// Contrato e2e para el flujo "material para colorear" (Plan 1): encola job → worker genera borrador
// → persiste DocumentoGenerado tipo 'material_colorear' → descarga .docx (placeholder, sin API key).
// Usa pglite real (mismo patrón que handlers.contrato.test.ts): sin Next, sin DATABASE_URL, sin API key.
// El LlmPort inline retorna un SchemaDescripcionDibujo válido — SamplesLlm no lo incluye aún.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { LlmPort } from '@faro/domain';
import { SchemaDescripcionDibujo } from '@faro/domain';
import {
  GenerarDescripcionDibujoUseCase,
  GenerarMaterialColorearUseCase,
  ProcesarTrabajoMaterialColorearUseCase,
} from '@faro/application';
import { PlaceholderImageGen } from '@faro/infra-ai';
import { BancoImagenesFsAdapter, LaminaExportAdapter, MIME_DOCX } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import {
  corpusVersion,
  documentoGenerado,
  jobGeneracion,
  objetivoAprendizaje,
  planificacionAnual,
  trazaIa,
  unidadPlanificada,
  DocumentoRepositoryDrizzle,
  JobRepositoryDrizzle,
  OaRepositoryDrizzle,
  UnidadDeTrabajoDrizzle,
  type DrizzleDb,
} from '@faro/infra-db';
// Handlers por ruta RELATIVA (igual que handlers.contrato.test.ts).
import { POST as postMaterialColorear } from '../../app/api/aula/material-colorear/route';
import { GET as getMaterialColorearEstado } from '../../app/api/aula/material-colorear/[jobId]/route';

// pglite carga WASM la 1ª vez (lento en Windows) — timeout amplio.
const T = 60_000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../../../packages/infra-db/migrations');
const MIGRATIONS = ['0000_robust_mulholland_black.sql', '0001_glorious_tinkerer.sql'];

// Clave del singleton que produccion.ts cachea en globalThis.
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

// LlmPort inline que retorna un SchemaDescripcionDibujo válido: SamplesLlm no incluye esa muestra todavía.
// Usamos 'as unknown as LlmPort' para el structural cast (no hay 'any' en producción).
const llmDescripcionFake: LlmPort = {
  async generar(_args) {
    const parsed = SchemaDescripcionDibujo.parse({ concepto: 'suma', descripcion_en: 'A child counting apples.' });
    // Devolvemos el parsed de SchemaDescripcionDibujo; el caller (GenerarDescripcionDibujoUseCase) valida.
    return {
      parsed: parsed as ReturnType<typeof _args.schema.parse>,
      stopReason: 'end_turn',
      usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      modelo: 'fake-descripcion',
    };
  },
};

const OA_CODIGO = 'MA01 OA 03';
const ESTABLECIMIENTO = 'Colegio Test';
const NIVEL = '1° básico';

let encoladoJobId: string;
let materialDocId: string;
let dirBanco: string;
let dirExport: string;

describe('material-colorear (contrato e2e, pglite real, sin API key)', () => {
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

    // Inyecta el singleton para que produccion() lo reutilice en los route handlers.
    (globalThis as Record<symbol, unknown>)[CLAVE] = { db, pool: {} as unknown };

    // --- Fixture: corpus publicado con 1 OA de 1º básico ---
    const [cv] = await db
      .insert(corpusVersion)
      .values({ etiqueta: 'v1-mate-1b-colorear', estado: 'publicada' })
      .returning();
    if (!cv) throw new Error('No se pudo crear corpus_version');

    const oaRepo = new OaRepositoryDrizzle(db as unknown as DrizzleDb);
    await oaRepo.ingestar([
      {
        corpusVersionId: cv.id,
        codigo: OA_CODIGO,
        asignatura: 'Matemática',
        nivel: NIVEL,
        descripcion: 'Contar del 0 al 100, de 1 en 1 y de 10 en 10.',
        indicadores: [],
      },
    ]);

    // Directorios temporales para el banco de imágenes y el export.
    dirBanco = mkdtempSync(join(tmpdir(), 'faro-test-banco-'));
    dirExport = mkdtempSync(join(tmpdir(), 'faro-test-export-'));

    // --- POST /api/aula/material-colorear → 202 { jobId } ---
    const postRes = await postMaterialColorear(
      new Request('http://t/api/aula/material-colorear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establecimiento: ESTABLECIMIENTO, asignatura: 'Matemática', nivel: NIVEL, oaCodigo: OA_CODIGO }),
      }),
    );
    if (postRes.status !== 202) {
      const body = (await postRes.json()) as { error?: string };
      throw new Error(`POST /material-colorear → ${postRes.status}: ${body.error ?? 'desconocido'}`);
    }
    const { jobId } = (await postRes.json()) as { jobId: string };
    encoladoJobId = jobId;

    // --- Corre el worker use case con dependencias reales pero sin API key (PlaceholderImageGen) ---
    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const imageGen = new PlaceholderImageGen();
    const banco = new BancoImagenesFsAdapter(dirBanco);
    const generar = new GenerarMaterialColorearUseCase({
      descripcion: new GenerarDescripcionDibujoUseCase(llmDescripcionFake),
      imageGen,
      banco,
    });

    const workerUseCase = new ProcesarTrabajoMaterialColorearUseCase({
      jobs,
      oas: oaRepo,
      generar,
      uow: new UnidadDeTrabajoDrizzle(db as unknown as DrizzleDb),
      maxIntentos: 3,
    });

    const resultado = await workerUseCase.ejecutarSiguiente('w-test');
    if (resultado.tipo !== 'hecho') {
      throw new Error(`Worker falló: ${resultado.tipo} — ${resultado.tipo !== 'sin_trabajo' ? resultado.error : ''}`);
    }
    materialDocId = resultado.documentoId;
  }, T);

  afterAll(() => {
    // Limpia el singleton para no contaminar otros archivos del proceso de test.
    delete (globalThis as Record<symbol, unknown>)[CLAVE];
    if (dirBanco) rmSync(dirBanco, { recursive: true, force: true });
    if (dirExport) rmSync(dirExport, { recursive: true, force: true });
  });

  it('POST /api/aula/material-colorear devuelve 202 con jobId', () => {
    expect(typeof encoladoJobId).toBe('string');
    expect(encoladoJobId.length).toBeGreaterThan(0);
  });

  it('worker genera borrador tipo material_colorear', () => {
    expect(typeof materialDocId).toBe('string');
    expect(materialDocId.length).toBeGreaterThan(0);
  });

  it('GET /api/aula/material-colorear/[jobId] retorna estado hecho con documentoId', async () => {
    const res = await getMaterialColorearEstado(new Request('http://t/'), {
      params: Promise.resolve({ jobId: encoladoJobId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { estado: string; documentoId?: string; tipo?: string; estadoRevision?: string };
    expect(body.estado).toBe('hecho');
    expect(body.documentoId).toBe(materialDocId);
    // INV-3: el documento nace borrador y tiene el tipo correcto.
    expect(body.tipo).toBe('material_colorear');
    expect(body.estadoRevision).toBe('borrador');
  });

  it('el DocumentoGenerado persiste con tipo material_colorear y estadoRevision borrador', async () => {
    // Verifica vía el repositorio de documentos (no a través del route handler para que sea independiente).
    // El singleton ya está inyectado en globalThis; produccion().documentos lo resuelve.
    // Aquí accedemos directamente al adaptador para no acoplar la aserción al handler.
    const { db } = (globalThis as Record<symbol, unknown>)[CLAVE] as { db: DrizzleDb };
    const docRepo = new DocumentoRepositoryDrizzle(db);
    const doc = await docRepo.porId(materialDocId);
    expect(doc).not.toBeNull();
    expect(doc?.tipo).toBe('material_colorear');
    expect(doc?.estadoRevision).toBe('borrador');
    // INV-2: el autor humano es null (no lo aprobó nadie).
    expect(doc?.autorHumano).toBeNull();
  });

  it('LaminaExportAdapter genera un .docx no vacío con placeholder (sin API key)', async () => {
    // Comprueba el adaptador de export directamente (el route handler requiere produccion() + readFile;
    // esto es más directo y no depende del filesystem de produccion). Sin imagen real → placeholder.
    const { db } = (globalThis as Record<symbol, unknown>)[CLAVE] as { db: DrizzleDb };
    const docRepo = new DocumentoRepositoryDrizzle(db);
    const doc = await docRepo.porId(materialDocId);
    expect(doc).not.toBeNull();
    if (doc === null) return;

    const { SchemaLamina } = await import('@faro/domain');
    const lamina = SchemaLamina.parse(doc.contenido);
    const logTest = crearLoggerHijo('test-lamina-export');
    // dirBanco sin PNG → resolverImagen retorna null → placeholder (degradación limpia).
    const adapter = new LaminaExportAdapter(dirExport, logTest, dirBanco);
    const archivo = await adapter.aDocx(lamina, { nombreColegio: ESTABLECIMIENTO, comuna: 'Test' });
    // El .docx tiene bytes (header OOXML mínimo).
    expect(archivo.bytes).toBeGreaterThan(0);
    expect(archivo.mime).toBe(MIME_DOCX);
    expect(archivo.ruta.endsWith('.docx')).toBe(true);
  });
});
