// apps/web/src/test/ficha.contrato.test.ts
// Contrato e2e para el flujo "ficha para colorear" (Plan 2): encola job → worker genera borrador
// → persiste DocumentoGenerado tipo 'ficha_colorear' → descarga .docx (placeholder, sin API key).
// Usa pglite real (mismo patrón que materialColorear.contrato.test.ts): sin Next, sin DATABASE_URL, sin API key.
// Dos LlmPort inline: uno para la descripción del dibujo (SchemaDescripcionDibujo) y otro para los ejercicios
// (SchemaEjerciciosFicha) — SamplesLlm no los incluye aún.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { LlmPort, SalidaEstructurada } from '@faro/domain';
import { SchemaDescripcionDibujo } from '@faro/domain';
import {
  GenerarDescripcionDibujoUseCase,
  GenerarEjerciciosFichaUseCase,
  GenerarFichaUseCase,
  ProcesarTrabajoFichaUseCase,
} from '@faro/application';
import { PlaceholderImageGen } from '@faro/infra-ai';
import { BancoImagenesFsAdapter, FichaExportAdapter, MIME_DOCX } from '@faro/infra-export';
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
import { POST as postFicha } from '../../app/api/aula/ficha/route';
import { GET as getFichaEstado } from '../../app/api/aula/ficha/[jobId]/route';

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
const llmDescripcionFake: LlmPort = {
  async generar(_args) {
    const parsed = SchemaDescripcionDibujo.parse({ concepto: 'suma', descripcion_en: 'A child counting apples.' });
    return {
      parsed: parsed as ReturnType<typeof _args.schema.parse>,
      stopReason: 'end_turn',
      usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      modelo: 'fake-descripcion',
    };
  },
};

// LlmPort inline que retorna un SchemaEjerciciosFicha válido (lista de ItemPrueba): el use case lo valida.
const itemOk = { oa: 'MA01 OA 03', habilidad: 'recordar', tipo: 'completacion', enunciado: 'Cuenta: 1, 2, ____.' };
const llmEjerciciosFake: LlmPort = {
  async generar(_args) {
    const salida: SalidaEstructurada<unknown> = {
      parsed: { ejercicios: [itemOk, { ...itemOk, enunciado: 'Cuenta: 10, 20, ____.' }] },
      modelo: 'fake-ejercicios',
      usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      stopReason: 'end_turn',
    };
    return salida as SalidaEstructurada<ReturnType<typeof _args.schema.parse>>;
  },
};

const OA_CODIGO = 'MA01 OA 03';
const ESTABLECIMIENTO = 'Colegio Test';
const NIVEL = '1° básico';

let encoladoJobId: string;
let fichaDocId: string;
let dirBanco: string;
let dirExport: string;

describe('ficha (contrato e2e, pglite real, sin API key)', () => {
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
      .values({ etiqueta: 'v1-mate-1b-ficha', estado: 'publicada' })
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

    // --- POST /api/aula/ficha → 202 { jobId } ---
    const postRes = await postFicha(
      new Request('http://t/api/aula/ficha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establecimiento: ESTABLECIMIENTO, asignatura: 'Matemática', nivel: NIVEL, oaCodigo: OA_CODIGO }),
      }),
    );
    if (postRes.status !== 202) {
      const body = (await postRes.json()) as { error?: string };
      throw new Error(`POST /ficha → ${postRes.status}: ${body.error ?? 'desconocido'}`);
    }
    const { jobId } = (await postRes.json()) as { jobId: string };
    encoladoJobId = jobId;

    // --- Corre el worker use case con dependencias reales pero sin API key (PlaceholderImageGen) ---
    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const imageGen = new PlaceholderImageGen();
    const banco = new BancoImagenesFsAdapter(dirBanco);
    const generar = new GenerarFichaUseCase({
      descripcion: new GenerarDescripcionDibujoUseCase(llmDescripcionFake),
      imageGen,
      banco,
      ejercicios: new GenerarEjerciciosFichaUseCase(llmEjerciciosFake),
    });

    const workerUseCase = new ProcesarTrabajoFichaUseCase({
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
    fichaDocId = resultado.documentoId;
  }, T);

  afterAll(() => {
    // Limpia el singleton para no contaminar otros archivos del proceso de test.
    delete (globalThis as Record<symbol, unknown>)[CLAVE];
    if (dirBanco) rmSync(dirBanco, { recursive: true, force: true });
    if (dirExport) rmSync(dirExport, { recursive: true, force: true });
  });

  it('POST /api/aula/ficha devuelve 202 con jobId', () => {
    expect(typeof encoladoJobId).toBe('string');
    expect(encoladoJobId.length).toBeGreaterThan(0);
  });

  it('worker genera borrador tipo ficha_colorear', () => {
    expect(typeof fichaDocId).toBe('string');
    expect(fichaDocId.length).toBeGreaterThan(0);
  });

  it('GET /api/aula/ficha/[jobId] retorna estado hecho con documentoId', async () => {
    const res = await getFichaEstado(new Request('http://t/'), {
      params: Promise.resolve({ jobId: encoladoJobId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { estado: string; documentoId?: string; tipo?: string; estadoRevision?: string };
    expect(body.estado).toBe('hecho');
    expect(body.documentoId).toBe(fichaDocId);
    // INV-3: el documento nace borrador y tiene el tipo correcto.
    expect(body.tipo).toBe('ficha_colorear');
    expect(body.estadoRevision).toBe('borrador');
  });

  it('el DocumentoGenerado persiste con tipo ficha_colorear y estadoRevision borrador', async () => {
    const { db } = (globalThis as Record<symbol, unknown>)[CLAVE] as { db: DrizzleDb };
    const docRepo = new DocumentoRepositoryDrizzle(db);
    const doc = await docRepo.porId(fichaDocId);
    expect(doc).not.toBeNull();
    expect(doc?.tipo).toBe('ficha_colorear');
    expect(doc?.estadoRevision).toBe('borrador');
    // INV-2: el autor humano es null (no lo aprobó nadie).
    expect(doc?.autorHumano).toBeNull();
  });

  it('FichaExportAdapter genera un .docx no vacío con placeholder (sin API key)', async () => {
    const { db } = (globalThis as Record<symbol, unknown>)[CLAVE] as { db: DrizzleDb };
    const docRepo = new DocumentoRepositoryDrizzle(db);
    const doc = await docRepo.porId(fichaDocId);
    expect(doc).not.toBeNull();
    if (doc === null) return;

    const { SchemaFicha } = await import('@faro/domain');
    const ficha = SchemaFicha.parse(doc.contenido);
    const logTest = crearLoggerHijo('test-ficha-export');
    // dirBanco sin PNG → resolverImagen retorna null → placeholder (degradación limpia).
    const adapter = new FichaExportAdapter(dirExport, logTest, dirBanco);
    const archivo = await adapter.aDocx(ficha, { nombreColegio: ESTABLECIMIENTO, comuna: 'Test' });
    // El .docx tiene bytes (header OOXML mínimo).
    expect(archivo.bytes).toBeGreaterThan(0);
    expect(archivo.mime).toBe(MIME_DOCX);
    expect(archivo.ruta.endsWith('.docx')).toBe(true);
  });
});
