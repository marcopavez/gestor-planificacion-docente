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
import { corpusVersion, objetivoAprendizaje, usuario } from '../schema/index.js';
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

/** Crea un usuario mínimo — satisface el FK NOT NULL de documento_generado.usuario_id (Task 1). */
async function insertarUsuarioSql(db: TestDb, email = `t-${crypto.randomUUID()}@t.cl`): Promise<string> {
  const [row] = await db.insert(usuario).values({ id: crypto.randomUUID(), email }).returning();
  if (!row) throw new Error('No se pudo insertar usuario');
  return row.id;
}

// Devuelve también el usuarioId dueño del documento: los tests que llaman porId/listarPorRaiz/
// actualizarEstadoRevision (acotados por dueño desde Task 3) lo necesitan para leer lo que crean.
async function insertarDocumentoSql(db: TestDb, cvId: string): Promise<{ docId: string; usuarioId: string }> {
  const usuarioId = await insertarUsuarioSql(db);
  const result = await db.execute(
    sql`INSERT INTO documento_generado
        (tipo, establecimiento, usuario_id, corpus_version_id, estado_revision, estado_generacion)
        VALUES ('prueba', 'Colegio Test', ${usuarioId}, ${cvId}, 'borrador', 'pendiente')
        RETURNING id`,
  );
  const docId = (result as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
  if (!docId) throw new Error('No se pudo insertar documento_generado');
  return { docId, usuarioId };
}

// ---------------------------------------------------------------------------
// CA-PA.1: CHECK chk_aprobado_requiere_humano (INV-3)
// ---------------------------------------------------------------------------
describe('CA-PA.1 — CHECK chk_aprobado_requiere_humano (INV-3)', () => {
  it('insertar documento borrador sin autor_humano: OK', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const { docId } = await insertarDocumentoSql(db, cvId);

    const rows = await db.execute(
      sql`SELECT id FROM documento_generado WHERE id = ${docId}`,
    );
    expect((rows as unknown as { rows: unknown[] }).rows).toHaveLength(1);
  }, T);

  it('UPDATE a aprobado SIN autor_humano: falla por CHECK', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const { docId } = await insertarDocumentoSql(db, cvId);

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
    const { docId } = await insertarDocumentoSql(db, cvId);

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
    const usuarioId = await insertarUsuarioSql(db);
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

    const guardada = await repo.guardar(planInput, cvId, usuarioId);

    expect(guardada.id).toBeDefined();
    expect(guardada.corpusVersionId).toBe(cvId);
    expect(guardada.establecimiento).toBe('Colegio Faro');
    expect(guardada.unidades).toHaveLength(3);

    const obtenida = await repo.obtener(guardada.id, usuarioId);
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
    const usuarioId = await insertarUsuarioSql(db);
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
      usuarioId,
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
      usuarioId,
    );

    const resultadoA = await repo.listar({ usuarioId, establecimiento: 'Colegio A' });
    expect(resultadoA).toHaveLength(1);
    expect(resultadoA[0]!.asignatura).toBe('Matemática');

    const resultadoB = await repo.listar({ usuarioId, establecimiento: 'Colegio B' });
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
    const { docId, usuarioId } = await insertarDocumentoSql(db, cvId);

    const leido = await repo.porId(docId, usuarioId);
    expect(leido).not.toBeNull();
    expect(leido!.id).toBe(docId);
    expect(leido!.tipo).toBe('prueba');
    expect(leido!.estadoRevision).toBe('borrador');
  }, T);

  it('marcarGeneracion actualiza estado y payload', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);

    const { docId, usuarioId } = await insertarDocumentoSql(db, cvId);

    await repo.marcarGeneracion(docId, 'validado', { titulo: 'Clase generada' }, { ok: true });

    const leido = await repo.porId(docId, usuarioId);
    expect(leido!.estadoGeneracion).toBe('validado');
    expect(leido!.contenido).toMatchObject({ titulo: 'Clase generada' });
    expect(leido!.resultadoGates).toMatchObject({ ok: true });
  }, T);

  it('crearBorrador inserta corpus real + payload + origen_id y nace en borrador (INV-3)', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);
    const usuarioId = await insertarUsuarioSql(db);

    // Documento raíz (unidad) sin origen.
    const unidadDoc = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'Colegio Test',
      usuarioId,
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
      usuarioId,
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
    const { docId } = await insertarDocumentoSql(db, cvId);
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

/**
 * Inserta una planificacion_anual con UNA unidad y devuelve el id de la unidad.
 * SQL directo (no PlanificacionAnualRepositoryDrizzle.guardar): estos tests de Job solo necesitan
 * el id de la unidad, no acoplarse a la firma completa del repo de planificación.
 */
async function insertarUnidadPlanificada(db: TestDb, cvId: string, usuarioId: string): Promise<string> {
  const planResult = await db.execute(
    sql`INSERT INTO planificacion_anual (establecimiento, usuario_id, asignatura, nivel, anio, corpus_version_id)
        VALUES ('Colegio Test', ${usuarioId}, 'Matemática', '1° básico', 2026, ${cvId})
        RETURNING id`,
  );
  const planId = (planResult as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
  if (!planId) throw new Error('No se pudo insertar planificacion_anual de prueba');

  const unidadResult = await db.execute(
    sql`INSERT INTO unidad_planificada (planificacion_anual_id, orden, titulo, oa_codigos)
        VALUES (${planId}, 1, 'U1', ARRAY['MA01 OA 01'])
        RETURNING id`,
  );
  const id = (unidadResult as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
  if (!id) throw new Error('No se pudo crear la unidad_planificada de prueba');
  return id;
}

describe('JobRepository — nuevo contrato cascada-unidad', () => {
  it('encolarCascadaUnidad → tomarSiguiente devuelve la unidad e incrementa intentos → marcarHecho', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const usuarioId = await insertarUsuarioSql(db);
    const unidadId = await insertarUnidadPlanificada(db, cvId, usuarioId);
    const { docId } = await insertarDocumentoSql(db, cvId);
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    const jobId = await repo.encolarCascadaUnidad(unidadId, usuarioId);
    expect(jobId).toBeDefined();

    const job = await repo.tomarSiguiente('worker-01');
    expect(job).not.toBeNull();
    expect(job!.id).toBe(jobId);
    expect(job!.unidadPlanificadaId).toBe(unidadId);
    expect(job!.usuarioId).toBe(usuarioId);
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
    const usuarioId = await insertarUsuarioSql(db);
    const unidadId = await insertarUnidadPlanificada(db, cvId, usuarioId);
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    await repo.encolarCascadaUnidad(unidadId, usuarioId);
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
// JobRepository.encolarPrueba / tomarSiguientePrueba — cola de prueba formativa (Fase 4)
// ---------------------------------------------------------------------------
describe('JobRepository — cola de prueba formativa (Fase 4)', () => {
  it('encolarPrueba → tomarSiguientePrueba devuelve el payload; tomarSiguiente (cascada) NO la toma', async () => {
    const db = await crearDb();
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const usuarioId = await insertarUsuarioSql(db);
    const planDocId = '22222222-2222-4222-8222-222222222222'; // uuid v4 válido (RFC 4122)

    const jobId = await repo.encolarPrueba({ planificacionDocumentoId: planDocId }, usuarioId);
    expect(jobId).toBeDefined();

    // Aislamiento de colas: la cola de cascada NO debe tomar un job de prueba (filtra por tipo_trabajo).
    expect(await repo.tomarSiguiente('worker-01')).toBeNull();

    const job = await repo.tomarSiguientePrueba('worker-01');
    expect(job).not.toBeNull();
    expect(job!.id).toBe(jobId);
    expect(job!.payload.planificacionDocumentoId).toBe(planDocId);
    expect(job!.usuarioId).toBe(usuarioId);
    expect(job!.intentos).toBe(1); // cuenta el intento en curso

    // Tras tomarlo queda en_proceso (visible para el polling de la web); obtenerEstado exige el dueño.
    const estado = await repo.obtenerEstado(jobId, usuarioId);
    expect(estado?.estado).toBe('en_proceso');
  }, T);
});

// ---------------------------------------------------------------------------
// JobRepository.encolarPptInfantil / tomarSiguientePptInfantil — cola de PPT infantil (Fase 3)
// ---------------------------------------------------------------------------
describe('JobRepository — cola de PPT infantil (Fase 3)', () => {
  it('encolarPptInfantil → tomarSiguientePptInfantil devuelve el payload; otras colas NO la toman', async () => {
    const db = await crearDb();
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const usuarioId = await insertarUsuarioSql(db);
    const planDocId = '33333333-3333-4333-8333-333333333333'; // uuid v4 válido (RFC 4122)

    const jobId = await repo.encolarPptInfantil({ planificacionDocumentoId: planDocId }, usuarioId);
    expect(jobId).toBeDefined();

    // Aislamiento de colas: ni la cascada ni la prueba deben tomar un job de PPT (filtran por tipo_trabajo).
    expect(await repo.tomarSiguiente('worker-01')).toBeNull();
    expect(await repo.tomarSiguientePrueba('worker-01')).toBeNull();

    const job = await repo.tomarSiguientePptInfantil('worker-01');
    expect(job).not.toBeNull();
    expect(job!.id).toBe(jobId);
    expect(job!.payload.planificacionDocumentoId).toBe(planDocId);
    expect(job!.usuarioId).toBe(usuarioId);
    expect(job!.intentos).toBe(1); // cuenta el intento en curso

    // Tras tomarlo queda en_proceso (visible para el polling de la web); obtenerEstado exige el dueño.
    const estado = await repo.obtenerEstado(jobId, usuarioId);
    expect(estado?.estado).toBe('en_proceso');
  }, T);
});

// ---------------------------------------------------------------------------
// JobRepository.encolarGuia / tomarSiguienteGuia — cola de guía del alumno (Tanda 1)
// ---------------------------------------------------------------------------
describe('JobRepository — cola de guía del alumno (Tanda 1)', () => {
  it('encolarGuia → tomarSiguienteGuia devuelve el payload; otras colas NO la toman', async () => {
    const db = await crearDb();
    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const usuarioId = await insertarUsuarioSql(db);

    const id = await jobs.encolarGuia(
      {
        asignatura: 'Ciencias Naturales',
        nivel: '3º básico',
        oaCodigo: 'CN03 OA 01',
        conocimiento: 'Los seres vivos',
        establecimiento: 'Colegio Demo',
      },
      usuarioId,
    );
    expect(id).toBeDefined();

    // Aislamiento de colas: ninguna cola vecina (cascada/prueba/PPT) toma un job de guía (filtran por tipo_trabajo).
    expect(await jobs.tomarSiguiente('w-cascada')).toBeNull();
    expect(await jobs.tomarSiguientePrueba('w-prueba')).toBeNull();
    expect(await jobs.tomarSiguientePptInfantil('w-ppt')).toBeNull();

    const t = await jobs.tomarSiguienteGuia('w-guia');
    expect(t?.id).toBe(id);
    expect(t?.payload.oaCodigo).toBe('CN03 OA 01');
    expect(t?.usuarioId).toBe(usuarioId);
    expect(t?.intentos).toBe(1);
  }, T);
});

// ---------------------------------------------------------------------------
// JobRepository.encolarMaterialColorear / tomarSiguienteMaterialColorear — cola de material para colorear
// ---------------------------------------------------------------------------
describe('JobRepository — cola de material para colorear', () => {
  it('encolarMaterialColorear → tomarSiguienteMaterialColorear devuelve el payload; otras colas NO la toman', async () => {
    const db = await crearDb();
    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const usuarioId = await insertarUsuarioSql(db);

    const id = await jobs.encolarMaterialColorear(
      {
        asignatura: 'Ciencias Naturales',
        nivel: '2º básico',
        oaCodigo: 'CN02 OA 01',
        establecimiento: 'Colegio Demo',
      },
      usuarioId,
    );
    expect(id).toBeDefined();

    // Aislamiento de colas: ninguna cola vecina toma un job de material para colorear (filtran por tipo_trabajo).
    expect(await jobs.tomarSiguiente('w-cascada')).toBeNull();
    expect(await jobs.tomarSiguientePrueba('w-prueba')).toBeNull();
    expect(await jobs.tomarSiguientePptInfantil('w-ppt')).toBeNull();
    expect(await jobs.tomarSiguienteGuia('w-guia')).toBeNull();

    const t = await jobs.tomarSiguienteMaterialColorear('w-colorear');
    expect(t?.id).toBe(id);
    expect(t?.payload.oaCodigo).toBe('CN02 OA 01');
    expect(t?.usuarioId).toBe(usuarioId);
    expect(t?.intentos).toBe(1);
  }, T);
});

// ---------------------------------------------------------------------------
// JobRepository.obtenerEstado — lectura del estado para el polling de la web (H-PA.9)
// ---------------------------------------------------------------------------
describe('JobRepository — obtenerEstado (H-PA.9)', () => {
  it('devuelve null para un jobId inexistente', async () => {
    const db = await crearDb();
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    const estado = await repo.obtenerEstado(
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001',
    );
    expect(estado).toBeNull();
  }, T);

  it('refleja pendiente → en_proceso → hecho con documentoId', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const usuarioId = await insertarUsuarioSql(db);
    const unidadId = await insertarUnidadPlanificada(db, cvId, usuarioId);
    const { docId } = await insertarDocumentoSql(db, cvId);
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    const jobId = await repo.encolarCascadaUnidad(unidadId, usuarioId);

    // Recién encolado: pendiente, sin documento, 0 intentos.
    const inicial = await repo.obtenerEstado(jobId, usuarioId);
    expect(inicial).not.toBeNull();
    expect(inicial!.estado).toBe('pendiente');
    expect(inicial!.documentoId).toBeNull();
    expect(inicial!.intentos).toBe(0);
    expect(inicial!.error).toBeNull();

    // Tomado: en_proceso, intentos = 1.
    await repo.tomarSiguiente('worker-01');
    const enProceso = await repo.obtenerEstado(jobId, usuarioId);
    expect(enProceso!.estado).toBe('en_proceso');
    expect(enProceso!.intentos).toBe(1);

    // Hecho: documentoId = raíz de la cascada.
    await repo.marcarHecho(jobId, docId);
    const hecho = await repo.obtenerEstado(jobId, usuarioId);
    expect(hecho!.estado).toBe('hecho');
    expect(hecho!.documentoId).toBe(docId);
  }, T);

  it('no revela el job a un usuario que no es el dueño (acota por usuarioId)', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const usuarioId = await insertarUsuarioSql(db);
    const otroUsuarioId = await insertarUsuarioSql(db);
    const unidadId = await insertarUnidadPlanificada(db, cvId, usuarioId);
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    const jobId = await repo.encolarCascadaUnidad(unidadId, usuarioId);

    expect(await repo.obtenerEstado(jobId, otroUsuarioId)).toBeNull();
    expect(await repo.obtenerEstado(jobId, usuarioId)).not.toBeNull();
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
    const usuarioId = await insertarUsuarioSql(db);

    // Reproducimos la cadena que arma el worker: unidad raíz; clase+prueba → unidad; deck → clase.
    const unidadDoc = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'Colegio Test',
      usuarioId,
      corpusVersionId: cvId,
      payload: { unidad: 'U1' },
      estadoGeneracion: 'validado',
    });
    const claseDoc = await repo.crearBorrador({
      tipo: 'planificacion_clase',
      establecimientoId: 'Colegio Test',
      usuarioId,
      corpusVersionId: cvId,
      origenId: unidadDoc.id,
      payload: { clase: 1 },
      estadoGeneracion: 'validado',
    });
    await repo.crearBorrador({
      tipo: 'prueba',
      establecimientoId: 'Colegio Test',
      usuarioId,
      corpusVersionId: cvId,
      origenId: unidadDoc.id,
      payload: { items: [] },
      estadoGeneracion: 'validado',
    });
    // deck cuelga de la clase, NO de la unidad → exige recorrido transitivo (CTE recursivo).
    await repo.crearBorrador({
      tipo: 'clase_deck',
      establecimientoId: 'Colegio Test',
      usuarioId,
      corpusVersionId: cvId,
      origenId: claseDoc.id,
      payload: { deck: { slides: [] }, pptx: { ruta: '/tmp/x.pptx', bytes: 10 } },
      estadoGeneracion: 'validado',
    });

    const cascada = await repo.listarPorRaiz(unidadDoc.id, usuarioId);
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
    const usuarioId = await insertarUsuarioSql(db);

    const unidadDoc = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'Colegio Test',
      usuarioId,
      corpusVersionId: cvId,
      payload: { unidad: 'U1' },
      estadoGeneracion: 'validado',
    });

    const cascada = await repo.listarPorRaiz(unidadDoc.id, usuarioId);
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
    const usuarioId = await insertarUsuarioSql(db);
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
      usuarioId,
    );

    // guardar ya devuelve unidades con id (UnidadPlanificadaGuardada).
    for (const u of guardada.unidades) {
      expect(typeof u.id).toBe('string');
      expect(u.id.length).toBeGreaterThan(0);
    }

    const obtenida = await repo.obtener(guardada.id, usuarioId);
    expect(obtenida).not.toBeNull();
    // El id de cada unidad debe coincidir con el de guardar (misma fila).
    expect(obtenida!.unidades.map((u) => u.id)).toEqual(guardada.unidades.map((u) => u.id));
  }, T);

  it('listar expone el id de cada unidad', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const usuarioId = await insertarUsuarioSql(db);
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
      usuarioId,
    );

    const listadas = await repo.listar({ usuarioId, establecimiento: 'Colegio Z' });
    expect(listadas).toHaveLength(1);
    expect(typeof listadas[0]!.unidades[0]!.id).toBe('string');
    expect(listadas[0]!.unidades[0]!.id.length).toBeGreaterThan(0);
  }, T);
});

// ---------------------------------------------------------------------------
// DocumentoRepository — superficie de revisión HIL (RF-PA.12, H-PA.10, INV-3)
// ---------------------------------------------------------------------------

/**
 * Inserta un documento con usuario_id y created_at explícitos (para los tests de filtro/orden por
 * dueño — listarPendientesRevision ya no filtra por establecimiento desde Task 3).
 * Vía SQL directo porque crearBorrador fija created_at internamente.
 */
async function insertarDocumentoConUsuario(
  db: TestDb,
  cvId: string,
  usuarioId: string,
  estadoRevision: string,
  createdAt: string,
  // Necesario para 'aprobado': el CHECK chk_aprobado_requiere_humano lo exige en el mismo INSERT.
  autorHumano: string | null = null,
): Promise<string> {
  const result = await db.execute(
    sql`INSERT INTO documento_generado
        (tipo, establecimiento, usuario_id, corpus_version_id, estado_revision, estado_generacion, created_at, autor_humano)
        VALUES ('prueba', 'Colegio Test', ${usuarioId}, ${cvId}, ${estadoRevision}, 'validado', ${createdAt}, ${autorHumano})
        RETURNING id`,
  );
  const id = (result as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
  if (!id) throw new Error('No se pudo insertar documento_generado');
  return id;
}

describe('DocumentoRepository — revisión HIL (H-PA.10)', () => {
  it('actualizarEstadoRevision: borrador → en_revision → aprobado(autor) reflejado por porId', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);
    const { docId, usuarioId } = await insertarDocumentoSql(db, cvId);

    await repo.actualizarEstadoRevision(docId, 'en_revision', null, usuarioId);
    let leido = await repo.porId(docId, usuarioId);
    expect(leido!.estadoRevision).toBe('en_revision');
    expect(leido!.autorHumano).toBeNull();

    await repo.actualizarEstadoRevision(docId, 'aprobado', 'prof.garcia@colegio.cl', usuarioId);
    leido = await repo.porId(docId, usuarioId);
    expect(leido!.estadoRevision).toBe('aprobado');
    expect(leido!.autorHumano).toBe('prof.garcia@colegio.cl');
  }, T);

  it('actualizarEstadoRevision a aprobado SIN autor → rechazado por el CHECK (INV-3)', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);
    const { docId, usuarioId } = await insertarDocumentoSql(db, cvId);

    // INV-3: el CHECK chk_aprobado_requiere_humano es la última red incluso si el adapter
    // se llama saltándose la máquina de estados del dominio.
    await expect(repo.actualizarEstadoRevision(docId, 'aprobado', null, usuarioId)).rejects.toThrow();
  }, T);

  it('listarPendientesRevision: filtra por usuario dueño, solo borrador/en_revision, orden created_at DESC', async () => {
    const db = await crearDb();
    const cvId = await insertarCorpusVersion(db);
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);
    const usuarioAId = await insertarUsuarioSql(db);
    const usuarioBId = await insertarUsuarioSql(db);

    // Docente A: 1 borrador (antiguo), 1 en_revision (reciente), 1 aprobado (excluido), 1 rechazado (excluido).
    const aBorrador = await insertarDocumentoConUsuario(
      db, cvId, usuarioAId, 'borrador', '2026-01-01T00:00:00Z',
    );
    const aEnRevision = await insertarDocumentoConUsuario(
      db, cvId, usuarioAId, 'en_revision', '2026-03-01T00:00:00Z',
    );
    // aprobado: requiere autor_humano en el mismo INSERT (CHECK chk_aprobado_requiere_humano).
    await insertarDocumentoConUsuario(
      db, cvId, usuarioAId, 'aprobado', '2026-02-01T00:00:00Z', 'rev@colegio.cl',
    );
    await insertarDocumentoConUsuario(
      db, cvId, usuarioAId, 'rechazado', '2026-02-15T00:00:00Z',
    );
    // Otro docente: no debe aparecer en la cola de A (Task 3: aislamiento por usuario_id).
    await insertarDocumentoConUsuario(
      db, cvId, usuarioBId, 'borrador', '2026-04-01T00:00:00Z',
    );

    const pendientes = await repo.listarPendientesRevision(usuarioAId);

    // Solo los dos pendientes del docente A (excluye aprobado/rechazado y al docente B).
    expect(pendientes).toHaveLength(2);
    expect(pendientes.every((d) => ['borrador', 'en_revision'].includes(d.estadoRevision))).toBe(true);
    // Orden created_at DESC: el en_revision (marzo) antes que el borrador (enero).
    expect(pendientes.map((d) => d.id)).toEqual([aEnRevision, aBorrador]);
  }, T);
});
