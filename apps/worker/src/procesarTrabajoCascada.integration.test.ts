// apps/worker/src/procesarTrabajoCascada.integration.test.ts
// CA-PA.4 (mitad worker): la cascada asíncrona end-to-end sobre pglite real + migraciones,
// con LLM de samples y PptxExportAdapter real. Verifica los 4 documentos borrador encadenados
// por origen_id, las 4 trazas, el job 'hecho' con documento raíz, y el .pptx en disco.
// Además cubre el reintento acotado (RF-2.15) y el agotamiento → 'fallido'.

import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { describe, it, expect } from 'vitest';
import type { ClockPort, LlmPort } from '@faro/domain';
import { CascadaAulaUseCase, ProcesarTrabajoCascadaUseCase, RevisarDocumentoUseCase } from '@faro/application';
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
  DocumentoRepositoryDrizzle,
  JobRepositoryDrizzle,
  OaRepositoryDrizzle,
  PlanificacionAnualRepositoryDrizzle,
  UnidadDeTrabajoDrizzle,
  UsuarioRepositoryDrizzle,
  type DrizzleDb,
} from '@faro/infra-db';

// pglite carga WASM la 1ª vez (lento en Windows) — timeout amplio por test.
const T = 60_000;

const __dirname = dirname(fileURLToPath(import.meta.url));
// Las migraciones viven en el paquete infra-db; se resuelven relativo a este archivo de test.
const MIGRATIONS_DIR = join(__dirname, '../../../packages/infra-db/migrations');
// 0002 añade la tabla `usuario` + columnas usuario_id NOT NULL (propiedad por docente — tenancy).
const MIGRATIONS = ['0000_robust_mulholland_black.sql', '0001_glorious_tinkerer.sql', '0002_fancy_centennial.sql'];
// El LLM de samples sirve los artefactos curados de Matemática 1º básico.
const SAMPLES_DIR = join(__dirname, '../../../samples/aula-matematica-1b');

// Schema completo para drizzle(pglite) — mismas tablas que el cliente de producción.
const schema = {
  corpusVersion,
  objetivoAprendizaje,
  planificacionAnual,
  unidadPlanificada,
  documentoGenerado,
  trazaIa,
  jobGeneracion,
};

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

// OA del corpus de Matemática 1º básico citados por los samples (existencia exigida por citationGate).
const OA_CORPUS = ['MA01 OA 01', 'MA01 OA 02', 'MA01 OA 03', 'MA01 OA 04', 'MA01 OA 06', 'MA01 OA 08', 'MA01 OA 11'];
// La unidad trabaja los OA basales (subconjunto que existe en el corpus).
const OA_UNIDAD = ['MA01 OA 03', 'MA01 OA 04', 'MA01 OA 06', 'MA01 OA 08', 'MA01 OA 11'];

const reloj: ClockPort = { hoy: () => new Date('2026-06-06') };

// Dueño (docente) de los artefactos — tenancy. usuario_id NOT NULL + FK exige que la fila exista antes.
const USUARIO_ID = '00000000-0000-0000-0000-000000000001';

async function crearDbPglite(): Promise<TestDb> {
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
  return drizzle(pg, { schema });
}

/** Ingiere corpus mínimo + 1 PlanificacionAnual con 1 unidad. Devuelve { unidadId } y deps. */
async function prepararFixture(db: TestDb): Promise<{ unidadId: string; cvId: string }> {
  // El usuario dueño debe existir antes de insertar plan/job/documento (FK usuario_id NOT NULL).
  await new UsuarioRepositoryDrizzle(db as unknown as DrizzleDb).asegurar(USUARIO_ID, 'docente@colegio.cl');

  const [cv] = await db.insert(corpusVersion).values({ etiqueta: 'v1-mate-1b', estado: 'publicada' }).returning();
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
      establecimiento: 'Colegio Test',
      asignatura: 'Matemática',
      nivel: '1º básico',
      anio: 2026,
      unidades: [{ orden: 1, titulo: 'Unidad 1', oaCodigos: OA_UNIDAD }],
    },
    cv.id,
    USUARIO_ID,
  );

  const rows = await db.execute(
    sql`SELECT id FROM unidad_planificada WHERE planificacion_anual_id = ${plan.id} LIMIT 1`,
  );
  const unidadId = (rows as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
  if (!unidadId) throw new Error('No se pudo crear unidad_planificada');
  return { unidadId, cvId: cv.id };
}

function construirUseCase(db: TestDb, llm: LlmPort, dirSalida: string, maxIntentos = 3): ProcesarTrabajoCascadaUseCase {
  return new ProcesarTrabajoCascadaUseCase({
    jobs: new JobRepositoryDrizzle(db as unknown as DrizzleDb),
    planes: new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb),
    oas: new OaRepositoryDrizzle(db as unknown as DrizzleDb),
    // UnidadDeTrabajoDrizzle real: la persistencia de la cascada corre en una transacción atómica.
    uow: new UnidadDeTrabajoDrizzle(db as unknown as DrizzleDb),
    export: new PptxExportAdapter(dirSalida, crearLoggerHijo('infra-export-test'), join(dirSalida, 'imagenes-ia')),
    cascada: new CascadaAulaUseCase(llm),
    clock: reloj,
    maxIntentos,
  });
}

describe('CA-PA.4 — worker cascada end-to-end (pglite + samples + pptx real)', () => {
  it('procesa un job: 4 borradores encadenados, 4 trazas, job hecho y .pptx en disco', async () => {
    const db = await crearDbPglite();
    const { unidadId, cvId } = await prepararFixture(db);
    const dirSalida = mkdtempSync(join(tmpdir(), 'faro-pptx-'));

    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const jobId = await jobs.encolarCascadaUnidad(unidadId, USUARIO_ID);

    const useCase = construirUseCase(db, crearSamplesLlm(SAMPLES_DIR), dirSalida);
    const r = await useCase.ejecutarSiguiente('worker-01');

    expect(r.tipo).toBe('hecho');
    if (r.tipo !== 'hecho') throw new Error('esperaba hecho');

    // 4 documentos, todos en estado 'borrador' (INV-3) con el corpus real y el usuario_id del job (tenancy).
    const docs = await db.select().from(documentoGenerado);
    expect(docs).toHaveLength(4);
    for (const d of docs) {
      expect(d.estadoRevision).toBe('borrador');
      expect(d.estadoGeneracion).toBe('validado');
      expect(d.corpusVersionId).toBe(cvId);
      expect(d.usuarioId).toBe(USUARIO_ID);
    }

    const porTipo = new Map(docs.map((d) => [d.tipo, d]));
    const unidadDoc = porTipo.get('planificacion_unidad');
    const claseDoc = porTipo.get('planificacion_clase');
    const pruebaDoc = porTipo.get('prueba');
    const deckDoc = porTipo.get('clase_deck');
    expect(unidadDoc).toBeDefined();
    expect(claseDoc).toBeDefined();
    expect(pruebaDoc).toBeDefined();
    expect(deckDoc).toBeDefined();

    // Cadena de trazabilidad por origen_id: unidad es raíz; clase/prueba → unidad; deck → clase.
    expect(unidadDoc!.origenId).toBeNull();
    expect(claseDoc!.origenId).toBe(unidadDoc!.id);
    expect(pruebaDoc!.origenId).toBe(unidadDoc!.id);
    expect(deckDoc!.origenId).toBe(claseDoc!.id);

    // El job quedó 'hecho' con documento_id = documento raíz (la unidad) y sin lock colgado.
    expect(r.documentoRaizId).toBe(unidadDoc!.id);
    const jobRow = await db.select().from(jobGeneracion).where(sql`id = ${jobId}`);
    expect(jobRow[0]?.estado).toBe('hecho');
    expect(jobRow[0]?.documentoId).toBe(unidadDoc!.id);
    expect(jobRow[0]?.lockedBy).toBeNull();
    expect(jobRow[0]?.lockedAt).toBeNull();

    // 4 filas de traza_ia, una por documento, con modelo y corpus_version_id (RF-PA.10).
    const trazas = await db.select().from(trazaIa);
    expect(trazas).toHaveLength(4);
    for (const t of trazas) {
      expect(t.modelo).toBe('samples-demo');
      expect(t.corpusVersionId).toBe(cvId);
    }
    const docIds = new Set(docs.map((d) => d.id));
    for (const t of trazas) {
      expect(docIds.has(t.documentoId)).toBe(true);
    }

    // El .pptx se generó: la ruta vive en el payload del deck y el archivo existe en disco.
    const payload = deckDoc!.payload as { pptx?: { ruta?: string; bytes?: number } };
    expect(payload.pptx?.ruta).toBeDefined();
    expect(existsSync(payload.pptx!.ruta!)).toBe(true);
    expect((payload.pptx?.bytes ?? 0)).toBeGreaterThan(0);

    rmSync(dirSalida, { recursive: true, force: true });
  }, T);

  it('reintenta cuando la cascada falla (intentos<max) y marca fallido al agotarse', async () => {
    const db = await crearDbPglite();
    const { unidadId } = await prepararFixture(db);
    const dirSalida = mkdtempSync(join(tmpdir(), 'faro-pptx-'));

    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const jobId = await jobs.encolarCascadaUnidad(unidadId, USUARIO_ID);

    // LLM que siempre lanza → la cascada falla en el primer artefacto.
    const llmRoto: LlmPort = {
      async generar() {
        throw new Error('fallo de LLM simulado');
      },
    };
    // maxIntentos=2: 1er intento reintenta, 2º agota → fallido.
    const useCase = construirUseCase(db, llmRoto, dirSalida, 2);

    const r1 = await useCase.ejecutarSiguiente('worker-01');
    expect(r1.tipo).toBe('reintenta');
    let jobRow = await db.select().from(jobGeneracion).where(sql`id = ${jobId}`);
    expect(jobRow[0]?.estado).toBe('pendiente');
    expect(jobRow[0]?.error).toContain('fallo de LLM simulado');

    const r2 = await useCase.ejecutarSiguiente('worker-01');
    expect(r2.tipo).toBe('fallido');
    jobRow = await db.select().from(jobGeneracion).where(sql`id = ${jobId}`);
    expect(jobRow[0]?.estado).toBe('fallido');

    // Ningún documento ni traza se persistió en los intentos fallidos (gate antes de persistir).
    const docs = await db.select().from(documentoGenerado);
    expect(docs).toHaveLength(0);

    rmSync(dirSalida, { recursive: true, force: true });
  }, T);

  it('sin trabajo en la cola devuelve sin_trabajo', async () => {
    const db = await crearDbPglite();
    const dirSalida = mkdtempSync(join(tmpdir(), 'faro-pptx-'));
    const useCase = construirUseCase(db, crearSamplesLlm(SAMPLES_DIR), dirSalida);
    const r = await useCase.ejecutarSiguiente('worker-01');
    expect(r.tipo).toBe('sin_trabajo');
    rmSync(dirSalida, { recursive: true, force: true });
  }, T);

  it('HIL: enviar→aprobar exige autorHumano; el CHECK bloquea aprobado sin humano', async () => {
    const db = await crearDbPglite();
    const { unidadId } = await prepararFixture(db);
    const dirSalida = mkdtempSync(join(tmpdir(), 'faro-pptx-'));

    // Corre la cascada para persistir los 4 borradores reales (como el test end-to-end).
    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    await jobs.encolarCascadaUnidad(unidadId, USUARIO_ID);
    const useCase = construirUseCase(db, crearSamplesLlm(SAMPLES_DIR), dirSalida);
    const r = await useCase.ejecutarSiguiente('worker-01');
    expect(r.tipo).toBe('hecho');

    const docs = await db.select().from(documentoGenerado);
    const unidadDoc = docs.find((d) => d.tipo === 'planificacion_unidad'); // la unidad es la raíz de la cascada
    const otroDoc = docs.find((d) => d.tipo === 'prueba'); // un doc aún en borrador para probar el CHECK
    if (!unidadDoc || !otroDoc) throw new Error('esperaba unidad raíz y un doc no-raíz');

    const revisar = new RevisarDocumentoUseCase(new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb));

    // 1) enviar: borrador → en_revision.
    const r1 = await revisar.enviarARevision(unidadDoc.id, USUARIO_ID);
    expect(r1.ok).toBe(true);
    let row = (await db.select().from(documentoGenerado).where(sql`id = ${unidadDoc.id}`))[0];
    expect(row?.estadoRevision).toBe('en_revision');

    // 2) aprobar SIN humano: la máquina lo rechaza y NO se persiste.
    const r2 = await revisar.aprobar(unidadDoc.id, '', USUARIO_ID);
    expect(r2.ok).toBe(false);
    if (r2.ok) throw new Error('esperaba que aprobar sin humano fallara');
    expect(r2.razon).toBe('transicion_invalida');
    if (r2.razon !== 'transicion_invalida') throw new Error('esperaba transicion_invalida');
    expect(r2.regla).toBe('aprobacion_sin_humano');
    row = (await db.select().from(documentoGenerado).where(sql`id = ${unidadDoc.id}`))[0];
    expect(row?.estadoRevision).toBe('en_revision'); // sigue en revisión: la aprobación no se persistió
    expect(row?.autorHumano).toBeNull();

    // 3) aprobar CON humano: en_revision → aprobado, con autor_humano persistido.
    const r3 = await revisar.aprobar(unidadDoc.id, 'docente@colegio.cl', USUARIO_ID);
    expect(r3.ok).toBe(true);
    if (!r3.ok) throw new Error('esperaba aprobación con humano');
    expect(r3.documento.estadoRevision).toBe('aprobado');
    expect(r3.documento.autorHumano).toBe('docente@colegio.cl');
    row = (await db.select().from(documentoGenerado).where(sql`id = ${unidadDoc.id}`))[0];
    expect(row?.estadoRevision).toBe('aprobado');
    expect(row?.autorHumano).toBe('docente@colegio.cl');

    // 4) El CHECK como última red: saltarse la máquina con SQL directo (aprobado sin humano) falla.
    await expect(
      db.execute(
        sql`UPDATE documento_generado SET estado_revision='aprobado', autor_humano=NULL WHERE id=${otroDoc.id}`,
      ),
    ).rejects.toThrow();

    rmSync(dirSalida, { recursive: true, force: true });
  }, T);
});
