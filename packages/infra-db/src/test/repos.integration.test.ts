// packages/infra-db/src/test/repos.integration.test.ts
// Tests de integración con pglite en memoria (P4 del plan).
// Cubren: CA-PA.1 (INV-3, CHECK), CA-PA.2 (RF-PA.2, idempotencia OA),
//         round-trip PlanificacionAnualRepository, round-trip básico Documento/Traza/Job.
//
// Timeout alto por test/hook: pglite carga WASM la primera vez y puede tardar 15–30s en Windows.

import { describe, it, expect } from 'vitest';
import { crearDbTest } from './pgliteHelper.js';
import { OaRepositoryDrizzle } from '../repos/OaRepositoryDrizzle.js';
import { DocumentoRepositoryDrizzle } from '../repos/DocumentoRepositoryDrizzle.js';
import { TrazaRepositoryDrizzle } from '../repos/TrazaRepositoryDrizzle.js';
import { JobRepositoryDrizzle } from '../repos/JobRepositoryDrizzle.js';
import { PlanificacionAnualRepositoryDrizzle } from '../repos/PlanificacionAnualRepositoryDrizzle.js';
import { corpusVersion, objetivoAprendizaje } from '../schema/index.js';
import { sql } from 'drizzle-orm';
import type { DrizzleDb } from '../db.js';

// Tiempo máximo por test: pglite puede tardar hasta 30s en Windows al cargar WASM la 1ª vez.
const T = 60_000;

// Tipo de la instancia Drizzle+pglite devuelta por crearDbTest.
type TestDb = Awaited<ReturnType<typeof crearDbTest>>;

// ---------------------------------------------------------------------------
// Helpers de fixtures — se llaman dentro de cada test para aislar el estado.
// ---------------------------------------------------------------------------

async function crearDb(): Promise<TestDb> {
  return crearDbTest();
}

async function insertarCorpusVersion(db: TestDb, etiqueta = 'v1-test'): Promise<string> {
  const [row] = await db
    .insert(corpusVersion)
    .values({ etiqueta, estado: 'publicada' })
    .returning();
  if (!row) throw new Error('No se pudo insertar corpus_version');
  return row.id;
}

async function insertarDocumentoSql(db: TestDb, cvId: string): Promise<string> {
  const result = await db.execute(
    sql`INSERT INTO documento_generado
        (tipo, establecimiento, corpus_version_id, estado_revision, estado_generacion)
        VALUES ('prueba', 'Colegio Test', ${cvId}, 'borrador', 'pendiente')
        RETURNING id`,
  );
  const id = (result as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
  if (!id) throw new Error('No se pudo insertar documento_generado');
  return id;
}

// ---------------------------------------------------------------------------
// CA-PA.1: CHECK chk_aprobado_requiere_humano (INV-3)
// ---------------------------------------------------------------------------
describe('CA-PA.1 — CHECK chk_aprobado_requiere_humano (INV-3)', () => {
  it('insertar documento borrador sin autor_humano: OK', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const docId = await insertarDocumentoSql(db, cvId);

    const rows = await db.execute(
      sql`SELECT id FROM documento_generado WHERE id = ${docId}`,
    );
    expect((rows as unknown as { rows: unknown[] }).rows).toHaveLength(1);
  }, T);

  it('UPDATE a aprobado SIN autor_humano: falla por CHECK', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const docId = await insertarDocumentoSql(db, cvId);

    // La violación del CHECK debe lanzar un error de DB.
    await expect(
      db.execute(
        sql`UPDATE documento_generado
            SET estado_revision = 'aprobado'
            WHERE id = ${docId}`,
      ),
    ).rejects.toThrow();
  }, T);

  it('UPDATE a aprobado CON autor_humano: pasa', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const docId = await insertarDocumentoSql(db, cvId);

    await expect(
      db.execute(
        sql`UPDATE documento_generado
            SET estado_revision = 'aprobado', autor_humano = 'prof.garcia@colegio.cl'
            WHERE id = ${docId}`,
      ),
    ).resolves.not.toThrow();

    const check = await db.execute(
      sql`SELECT estado_revision, autor_humano FROM documento_generado WHERE id = ${docId}`,
    );
    const row = (
      check as unknown as { rows: Array<{ estado_revision: string; autor_humano: string }> }
    ).rows[0];
    expect(row?.estado_revision).toBe('aprobado');
    expect(row?.autor_humano).toBe('prof.garcia@colegio.cl');
  }, T);
});

// ---------------------------------------------------------------------------
// CA-PA.2: Idempotencia de ingesta de OA (RF-PA.2, unique(corpus_version_id, codigo))
// ---------------------------------------------------------------------------
describe('CA-PA.2 — Idempotencia de ingesta OA (RF-PA.2)', () => {
  it('ingerir el mismo conjunto de OA dos veces no duplica filas', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const oaRepo = new OaRepositoryDrizzle(db as unknown as DrizzleDb);

    const oasInput = [
      {
        corpusVersionId: cvId,
        codigo: 'MA01 OA 01',
        asignatura: 'Matemática',
        nivel: '1° básico',
        descripcion: 'Contar del 1 al 20.',
        indicadores: ['Cuenta colecciones hasta 20.'],
      },
      {
        corpusVersionId: cvId,
        codigo: 'MA01 OA 02',
        asignatura: 'Matemática',
        nivel: '1° básico',
        descripcion: 'Leer y escribir números del 0 al 20.',
        indicadores: ['Leen números.'],
      },
    ];

    await oaRepo.ingestar(oasInput);
    // Segunda ingesta idéntica — debe ser idempotente.
    await oaRepo.ingestar(oasInput);

    const countResult = await db.execute(
      sql`SELECT COUNT(*) AS n FROM objetivo_aprendizaje WHERE corpus_version_id = ${cvId}`,
    );
    const n = Number(
      (countResult as unknown as { rows: Array<{ n: string }> }).rows[0]?.n ?? 0,
    );
    // Solo debe haber 2 filas, no 4.
    expect(n).toBe(2);
  }, T);

  it('ingestar con descripcion diferente actualiza la fila existente (no duplica)', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const oaRepo = new OaRepositoryDrizzle(db as unknown as DrizzleDb);

    await oaRepo.ingestar([
      {
        corpusVersionId: cvId,
        codigo: 'MA01 OA 01',
        asignatura: 'Matemática',
        nivel: '1° básico',
        descripcion: 'Descripción original.',
      },
    ]);
    await oaRepo.ingestar([
      {
        corpusVersionId: cvId,
        codigo: 'MA01 OA 01',
        asignatura: 'Matemática',
        nivel: '1° básico',
        descripcion: 'Descripción actualizada.',
      },
    ]);

    const countResult = await db.execute(
      sql`SELECT COUNT(*) AS n FROM objetivo_aprendizaje WHERE corpus_version_id = ${cvId}`,
    );
    const n = Number(
      (countResult as unknown as { rows: Array<{ n: string }> }).rows[0]?.n ?? 0,
    );
    expect(n).toBe(1);

    const rows = await db.select().from(objetivoAprendizaje);
    expect(rows[0]?.descripcion).toBe('Descripción actualizada.');
  }, T);
});

// ---------------------------------------------------------------------------
// Round-trip PlanificacionAnualRepository: guardar → obtener → N unidades en orden
// ---------------------------------------------------------------------------
describe('PlanificacionAnualRepository — round-trip', () => {
  it('guardar con N unidades → obtener devuelve las N unidades en orden', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb);

    const planInput = {
      establecimiento: 'Colegio Faro',
      asignatura: 'Matemática',
      nivel: '1° básico',
      anio: 2026,
      unidades: [
        { orden: 2, titulo: 'Unidad 2 — Números', oaCodigos: ['MA01 OA 02'], semanas: 4 },
        {
          orden: 1,
          titulo: 'Unidad 1 — Contar',
          oaCodigos: ['MA01 OA 01'],
          inicio: '2026-03-01',
          fin: '2026-04-30',
        },
        { orden: 3, titulo: 'Unidad 3 — Suma', oaCodigos: ['MA01 OA 03', 'MA01 OA 04'] },
      ],
    };

    const guardada = await repo.guardar(planInput, cvId);

    expect(guardada.id).toBeDefined();
    expect(guardada.corpusVersionId).toBe(cvId);
    expect(guardada.establecimiento).toBe('Colegio Faro');
    expect(guardada.unidades).toHaveLength(3);

    const obtenida = await repo.obtener(guardada.id);
    expect(obtenida).not.toBeNull();
    expect(obtenida!.id).toBe(guardada.id);
    // Las unidades deben venir ordenadas por campo orden ASC.
    expect(obtenida!.unidades.map((u) => u.orden)).toEqual([1, 2, 3]);
    expect(obtenida!.unidades[0]!.titulo).toBe('Unidad 1 — Contar');
    expect(obtenida!.unidades[0]!.oaCodigos).toEqual(['MA01 OA 01']);
    expect(obtenida!.unidades[0]!.inicio).toBe('2026-03-01');
    expect(obtenida!.unidades[1]!.semanas).toBe(4);
    expect(obtenida!.unidades[2]!.oaCodigos).toEqual(['MA01 OA 03', 'MA01 OA 04']);
  }, T);

  it('listar filtra por establecimiento', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb);

    await repo.guardar(
      {
        establecimiento: 'Colegio A',
        asignatura: 'Matemática',
        nivel: '1° básico',
        anio: 2026,
        unidades: [{ orden: 1, titulo: 'U1', oaCodigos: ['MA01 OA 01'] }],
      },
      cvId,
    );
    await repo.guardar(
      {
        establecimiento: 'Colegio B',
        asignatura: 'Lenguaje',
        nivel: '2° básico',
        anio: 2026,
        unidades: [{ orden: 1, titulo: 'U1', oaCodigos: ['LE02 OA 01'] }],
      },
      cvId,
    );

    const resultadoA = await repo.listar({ establecimiento: 'Colegio A' });
    expect(resultadoA).toHaveLength(1);
    expect(resultadoA[0]!.asignatura).toBe('Matemática');

    const resultadoB = await repo.listar({ establecimiento: 'Colegio B' });
    expect(resultadoB).toHaveLength(1);
    expect(resultadoB[0]!.nivel).toBe('2° básico');
  }, T);
});

// ---------------------------------------------------------------------------
// Round-trip básico DocumentoRepository
// ---------------------------------------------------------------------------
describe('DocumentoRepository — round-trip básico', () => {
  it('porId devuelve el documento insertado vía SQL', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);

    // Insertar directamente con SQL para evitar la limitación de NuevoDocumento (sin corpusVersionId).
    const docId = await insertarDocumentoSql(db, cvId);

    const leido = await repo.porId(docId);
    expect(leido).not.toBeNull();
    expect(leido!.id).toBe(docId);
    expect(leido!.tipo).toBe('prueba');
    expect(leido!.estadoRevision).toBe('borrador');
  }, T);

  it('marcarGeneracion actualiza estado y payload', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);

    const docId = await insertarDocumentoSql(db, cvId);

    await repo.marcarGeneracion(docId, 'validado', { titulo: 'Clase generada' }, { ok: true });

    const leido = await repo.porId(docId);
    expect(leido!.estadoGeneracion).toBe('validado');
    expect(leido!.contenido).toMatchObject({ titulo: 'Clase generada' });
    expect(leido!.resultadoGates).toMatchObject({ ok: true });
  }, T);

  it('crearBorrador inserta corpus real + payload + origen_id y nace en borrador (INV-3)', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);

    // Documento raíz (unidad) sin origen.
    const unidadDoc = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'Colegio Test',
      corpusVersionId: cvId,
      payload: { unidad: 'U1' },
      resultadoGates: { ok: true },
      estadoGeneracion: 'validado',
    });
    expect(unidadDoc.estadoRevision).toBe('borrador');
    expect(unidadDoc.estadoGeneracion).toBe('validado');
    expect(unidadDoc.contenido).toMatchObject({ unidad: 'U1' });

    // Documento hijo (clase) con origen_id = unidad → trazabilidad de la cascada.
    const claseDoc = await repo.crearBorrador({
      tipo: 'planificacion_clase',
      establecimientoId: 'Colegio Test',
      corpusVersionId: cvId,
      origenId: unidadDoc.id,
      payload: { clase: 1 },
      estadoGeneracion: 'validado',
    });

    const rows = await db.execute(
      sql`SELECT origen_id, corpus_version_id FROM documento_generado WHERE id = ${claseDoc.id}`,
    );
    const fila = (
      rows as unknown as { rows: Array<{ origen_id: string; corpus_version_id: string }> }
    ).rows[0];
    expect(fila?.origen_id).toBe(unidadDoc.id);
    expect(fila?.corpus_version_id).toBe(cvId);
  }, T);
});

// ---------------------------------------------------------------------------
// Round-trip básico TrazaRepository
// ---------------------------------------------------------------------------
describe('TrazaRepository — round-trip básico', () => {
  it('registrar una traza → existe en DB', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const docId = await insertarDocumentoSql(db, cvId);
    const repo = new TrazaRepositoryDrizzle(db as unknown as DrizzleDb);

    await expect(
      repo.registrar({
        documentoId: docId,
        corpusVersionId: cvId,
        modelo: 'samples/fake',
        rutaDecision: 'cascada_unidad',
        promptHash: 'abc123',
        recuperado: [],
        citas: [],
        evals: { ok: true },
        usage: { input: 100, output: 200, cacheRead: 0, cacheCreation: 0 },
        revisor: null,
      }),
    ).resolves.not.toThrow();

    const count = await db.execute(
      sql`SELECT COUNT(*) AS n FROM traza_ia WHERE documento_id = ${docId}`,
    );
    const n = Number(
      (count as unknown as { rows: Array<{ n: string }> }).rows[0]?.n ?? 0,
    );
    expect(n).toBe(1);
  }, T);
});

// ---------------------------------------------------------------------------
// Round-trip JobRepository (nuevo contrato: cascada-desde-unidad — RF-PA.3, ADR-003)
// ---------------------------------------------------------------------------

/** Inserta una planificacion_anual con UNA unidad y devuelve el id de la unidad. */
async function insertarUnidadPlanificada(db: TestDb, cvId: string): Promise<string> {
  const repo = new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb);
  const guardada = await repo.guardar(
    {
      establecimiento: 'Colegio Test',
      asignatura: 'Matemática',
      nivel: '1° básico',
      anio: 2026,
      unidades: [{ orden: 1, titulo: 'U1', oaCodigos: ['MA01 OA 01'] }],
    },
    cvId,
  );
  // obtenerUnidad no devuelve id de unidad; lo leemos directo de la tabla por el plan recién creado.
  const rows = await db.execute(
    sql`SELECT id FROM unidad_planificada WHERE planificacion_anual_id = ${guardada.id} LIMIT 1`,
  );
  const id = (rows as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
  if (!id) throw new Error('No se pudo crear la unidad_planificada de prueba');
  return id;
}

describe('JobRepository — nuevo contrato cascada-unidad', () => {
  it('encolarCascadaUnidad → tomarSiguiente devuelve la unidad e incrementa intentos → marcarHecho', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const unidadId = await insertarUnidadPlanificada(db, cvId);
    const docId = await insertarDocumentoSql(db, cvId);
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    const jobId = await repo.encolarCascadaUnidad(unidadId);
    expect(jobId).toBeDefined();

    const job = await repo.tomarSiguiente('worker-01');
    expect(job).not.toBeNull();
    expect(job!.id).toBe(jobId);
    expect(job!.unidadPlanificadaId).toBe(unidadId);
    // tomarSiguiente cuenta el intento en curso (intentos pasa de 0 a 1).
    expect(job!.intentos).toBe(1);

    await repo.marcarHecho(job!.id, docId);

    const estadoResult = await db.execute(
      sql`SELECT estado, documento_id FROM job_generacion WHERE id = ${job!.id}`,
    );
    const fila = (
      estadoResult as unknown as { rows: Array<{ estado: string; documento_id: string }> }
    ).rows[0];
    expect(fila?.estado).toBe('hecho');
    expect(fila?.documento_id).toBe(docId);
  }, T);

  it('reintentar vuelve el job a pendiente con error; marcarFallido lo deja fallido', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const unidadId = await insertarUnidadPlanificada(db, cvId);
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    await repo.encolarCascadaUnidad(unidadId);
    const job = await repo.tomarSiguiente('worker-01');
    expect(job).not.toBeNull();

    await repo.reintentar(job!.id, 'fallo transitorio');
    const trasReintento = await db.execute(
      sql`SELECT estado, error FROM job_generacion WHERE id = ${job!.id}`,
    );
    const filaR = (
      trasReintento as unknown as { rows: Array<{ estado: string; error: string }> }
    ).rows[0];
    expect(filaR?.estado).toBe('pendiente');
    expect(filaR?.error).toBe('fallo transitorio');

    // Un nuevo tomarSiguiente lo retoma (estaba pendiente) e incrementa intentos a 2.
    const reintento = await repo.tomarSiguiente('worker-02');
    expect(reintento!.intentos).toBe(2);

    await repo.marcarFallido(reintento!.id, 'fallo definitivo');
    const trasFallo = await db.execute(
      sql`SELECT estado, error FROM job_generacion WHERE id = ${reintento!.id}`,
    );
    const filaF = (
      trasFallo as unknown as { rows: Array<{ estado: string; error: string }> }
    ).rows[0];
    expect(filaF?.estado).toBe('fallido');
    expect(filaF?.error).toBe('fallo definitivo');
  }, T);
});

// ---------------------------------------------------------------------------
// JobRepository.obtenerEstado — lectura del estado para el polling de la web (H-PA.9)
// ---------------------------------------------------------------------------
describe('JobRepository — obtenerEstado (H-PA.9)', () => {
  it('devuelve null para un jobId inexistente', async () => {
    const db = await crearDb();
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    const estado = await repo.obtenerEstado('00000000-0000-0000-0000-000000000000');
    expect(estado).toBeNull();
  }, T);

  it('refleja pendiente → en_proceso → hecho con documentoId', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const unidadId = await insertarUnidadPlanificada(db, cvId);
    const docId = await insertarDocumentoSql(db, cvId);
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    const jobId = await repo.encolarCascadaUnidad(unidadId);

    // Recién encolado: pendiente, sin documento, 0 intentos.
    const inicial = await repo.obtenerEstado(jobId);
    expect(inicial).not.toBeNull();
    expect(inicial!.estado).toBe('pendiente');
    expect(inicial!.documentoId).toBeNull();
    expect(inicial!.intentos).toBe(0);
    expect(inicial!.error).toBeNull();

    // Tomado: en_proceso, intentos = 1.
    await repo.tomarSiguiente('worker-01');
    const enProceso = await repo.obtenerEstado(jobId);
    expect(enProceso!.estado).toBe('en_proceso');
    expect(enProceso!.intentos).toBe(1);

    // Hecho: documentoId = raíz de la cascada.
    await repo.marcarHecho(jobId, docId);
    const hecho = await repo.obtenerEstado(jobId);
    expect(hecho!.estado).toBe('hecho');
    expect(hecho!.documentoId).toBe(docId);
  }, T);
});

// ---------------------------------------------------------------------------
// DocumentoRepository.listarPorRaiz — cascada completa raíz + descendientes (H-PA.9)
// ---------------------------------------------------------------------------
describe('DocumentoRepository — listarPorRaiz (H-PA.9)', () => {
  it('devuelve la raíz + los 3 descendientes (clase/prueba→unidad, deck→clase)', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);

    // Reproducimos la cadena que arma el worker: unidad raíz; clase+prueba → unidad; deck → clase.
    const unidadDoc = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'Colegio Test',
      corpusVersionId: cvId,
      payload: { unidad: 'U1' },
      estadoGeneracion: 'validado',
    });
    const claseDoc = await repo.crearBorrador({
      tipo: 'planificacion_clase',
      establecimientoId: 'Colegio Test',
      corpusVersionId: cvId,
      origenId: unidadDoc.id,
      payload: { clase: 1 },
      estadoGeneracion: 'validado',
    });
    await repo.crearBorrador({
      tipo: 'prueba',
      establecimientoId: 'Colegio Test',
      corpusVersionId: cvId,
      origenId: unidadDoc.id,
      payload: { items: [] },
      estadoGeneracion: 'validado',
    });
    // deck cuelga de la clase, NO de la unidad → exige recorrido transitivo (CTE recursivo).
    await repo.crearBorrador({
      tipo: 'clase_deck',
      establecimientoId: 'Colegio Test',
      corpusVersionId: cvId,
      origenId: claseDoc.id,
      payload: { deck: { slides: [] }, pptx: { ruta: '/tmp/x.pptx', bytes: 10 } },
      estadoGeneracion: 'validado',
    });

    const cascada = await repo.listarPorRaiz(unidadDoc.id);
    expect(cascada).toHaveLength(4);
    const tipos = cascada.map((d) => d.tipo).sort();
    expect(tipos).toEqual(['clase_deck', 'planificacion_clase', 'planificacion_unidad', 'prueba']);
    // La raíz debe estar presente.
    expect(cascada.some((d) => d.id === unidadDoc.id)).toBe(true);
    // El deck (nieto de la unidad) debe incluirse pese a colgar de la clase.
    const deck = cascada.find((d) => d.tipo === 'clase_deck');
    expect(deck?.contenido).toMatchObject({ pptx: { ruta: '/tmp/x.pptx' } });
  }, T);

  it('raíz sin descendientes devuelve solo la raíz', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);

    const unidadDoc = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'Colegio Test',
      corpusVersionId: cvId,
      payload: { unidad: 'U1' },
      estadoGeneracion: 'validado',
    });

    const cascada = await repo.listarPorRaiz(unidadDoc.id);
    expect(cascada).toHaveLength(1);
    expect(cascada[0]!.id).toBe(unidadDoc.id);
  }, T);
});

// ---------------------------------------------------------------------------
// PlanificacionAnualRepository — id de unidad expuesto por obtener/listar (H-PA.9)
// ---------------------------------------------------------------------------
describe('PlanificacionAnualRepository — id de unidad (H-PA.9)', () => {
  it('obtener expone el id de cada unidad', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb);

    const guardada = await repo.guardar(
      {
        establecimiento: 'Colegio Faro',
        asignatura: 'Matemática',
        nivel: '1° básico',
        anio: 2026,
        unidades: [
          { orden: 1, titulo: 'U1', oaCodigos: ['MA01 OA 01'] },
          { orden: 2, titulo: 'U2', oaCodigos: ['MA01 OA 02'] },
        ],
      },
      cvId,
    );

    // guardar ya devuelve unidades con id (UnidadPlanificadaGuardada).
    for (const u of guardada.unidades) {
      expect(typeof u.id).toBe('string');
      expect(u.id.length).toBeGreaterThan(0);
    }

    const obtenida = await repo.obtener(guardada.id);
    expect(obtenida).not.toBeNull();
    // El id de cada unidad debe coincidir con el de guardar (misma fila).
    expect(obtenida!.unidades.map((u) => u.id)).toEqual(guardada.unidades.map((u) => u.id));
  }, T);

  it('listar expone el id de cada unidad', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb);

    await repo.guardar(
      {
        establecimiento: 'Colegio Z',
        asignatura: 'Matemática',
        nivel: '1° básico',
        anio: 2026,
        unidades: [{ orden: 1, titulo: 'U1', oaCodigos: ['MA01 OA 01'] }],
      },
      cvId,
    );

    const listadas = await repo.listar({ establecimiento: 'Colegio Z' });
    expect(listadas).toHaveLength(1);
    expect(typeof listadas[0]!.unidades[0]!.id).toBe('string');
    expect(listadas[0]!.unidades[0]!.id.length).toBeGreaterThan(0);
  }, T);
});
