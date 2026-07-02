// packages/infra-db/src/repos/ownership.integration.test.ts
// Verifica que documento_generado.usuario_id existe, es NOT NULL y referencia usuario(id).
import { describe, it, expect } from 'vitest';
import { crearDbTest } from '../test/pgliteHelper.js';
import { usuario, documentoGenerado, corpusVersion } from '../schema/index.js';
import { eq } from 'drizzle-orm';
import { DocumentoRepositoryDrizzle } from './DocumentoRepositoryDrizzle.js';
import { PlanificacionAnualRepositoryDrizzle } from './PlanificacionAnualRepositoryDrizzle.js';
import type { NuevoDocumento, PlanificacionAnual } from '@faro/domain';
import type { DrizzleDb } from '../db.js';

// Timeout alto: pglite carga WASM la primera vez y puede tardar hasta 30s en Windows
// (mismo patrón que repos.integration.test.ts).
const T = 60_000;

describe('propiedad por usuario — schema', () => {
  it('documento_generado.usuario_id es NOT NULL y referencia usuario(id)', async () => {
    const db = await crearDbTest();
    const [u] = await db.insert(usuario).values({ id: crypto.randomUUID(), email: 'a@t.cl' }).returning();
    const [cv] = await db.insert(corpusVersion).values({ etiqueta: 't' }).returning();
    const [d] = await db
      .insert(documentoGenerado)
      .values({ tipo: 'prueba', establecimiento: 'X', corpusVersionId: cv!.id, usuarioId: u!.id })
      .returning();
    expect(d!.usuarioId).toBe(u!.id);

    const filas = await db.select().from(documentoGenerado).where(eq(documentoGenerado.usuarioId, u!.id));
    expect(filas).toHaveLength(1);
  }, T);
});

// Task 3: DocumentoRepositoryDrizzle debe acotar lecturas/escrituras al dueño (usuario_id) —
// un docente no puede leer ni listar documentos de otro docente, aunque conozca el id.
describe('DocumentoRepository — aislamiento por usuario (Task 3)', () => {
  it('porId y listarPendientesRevision solo devuelven documentos del dueño', async () => {
    const db = await crearDbTest();
    // PGlite no es asignable a DrizzleDb (mismatch de tipos de sesión) — cast establecido en el repo.
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);
    const [cv] = await db.insert(corpusVersion).values({ etiqueta: 't' }).returning();
    await db.insert(usuario).values([
      { id: 'a0000000-0000-0000-0000-000000000001', email: 'a@t.cl' },
      { id: 'b0000000-0000-0000-0000-000000000002', email: 'b@t.cl' },
    ]);

    const nuevoDocA: NuevoDocumento = {
      tipo: 'prueba',
      establecimientoId: 'X',
      corpusVersionId: cv!.id,
      usuarioId: 'a0000000-0000-0000-0000-000000000001',
    };
    const nuevoDocB: NuevoDocumento = {
      tipo: 'prueba',
      establecimientoId: 'Y',
      corpusVersionId: cv!.id,
      usuarioId: 'b0000000-0000-0000-0000-000000000002',
    };
    const dA = await repo.crearBorrador(nuevoDocA);
    await repo.crearBorrador(nuevoDocB);

    expect(await repo.porId(dA.id, 'a0000000-0000-0000-0000-000000000001')).not.toBeNull();
    expect(await repo.porId(dA.id, 'b0000000-0000-0000-0000-000000000002')).toBeNull(); // no es su documento

    const pend = await repo.listarPendientesRevision('b0000000-0000-0000-0000-000000000002');
    expect(pend).toHaveLength(1);
    expect(pend[0]!.establecimientoId).toBe('Y');
  }, T);

  it('listarPorRaiz: el usuario B no puede recorrer la cascada del usuario A (ancla del CTE)', async () => {
    const db = await crearDbTest();
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);
    const [cv] = await db.insert(corpusVersion).values({ etiqueta: 't' }).returning();
    const userA = 'a0000000-0000-0000-0000-000000000001';
    const userB = 'b0000000-0000-0000-0000-000000000002';
    await db.insert(usuario).values([
      { id: userA, email: 'a@t.cl' },
      { id: userB, email: 'b@t.cl' },
    ]);

    const dA = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'X',
      corpusVersionId: cv!.id,
      usuarioId: userA,
    });

    // El ancla del CTE recursivo exige usuario_id = dueño: B no ve nada de la cascada de A.
    expect(await repo.listarPorRaiz(dA.id, userB)).toHaveLength(0);
    // A sí recorre su propia cascada (aquí, solo la raíz).
    expect((await repo.listarPorRaiz(dA.id, userA)).length).toBeGreaterThanOrEqual(1);
  }, T);

  it('listarPorRaiz: el término recursivo sigue devolviendo descendientes legítimos del dueño', async () => {
    const db = await crearDbTest();
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);
    const [cv] = await db.insert(corpusVersion).values({ etiqueta: 't' }).returning();
    const userA = 'a0000000-0000-0000-0000-000000000001';
    const userB = 'b0000000-0000-0000-0000-000000000002';
    await db.insert(usuario).values([
      { id: userA, email: 'a@t.cl' },
      { id: userB, email: 'b@t.cl' },
    ]);

    const raiz = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'X',
      corpusVersionId: cv!.id,
      usuarioId: userA,
    });
    // Hijo que cuelga de la raíz vía origen_id, del mismo dueño (A).
    await repo.crearBorrador({
      tipo: 'clase',
      establecimientoId: 'X',
      corpusVersionId: cv!.id,
      usuarioId: userA,
      origenId: raiz.id,
    });

    // El guardia AND d.usuario_id no debe bloquear descendientes legítimos: A ve raíz + hijo.
    expect((await repo.listarPorRaiz(raiz.id, userA)).length).toBeGreaterThanOrEqual(2);
    // B sigue sin ver nada (ni la raíz ni el hijo), como antes del endurecimiento.
    expect(await repo.listarPorRaiz(raiz.id, userB)).toHaveLength(0);
  }, T);

  it('actualizarEstadoRevision: el usuario B no puede transicionar un documento de A (no-op silencioso)', async () => {
    const db = await crearDbTest();
    const repo = new DocumentoRepositoryDrizzle(db as unknown as DrizzleDb);
    const [cv] = await db.insert(corpusVersion).values({ etiqueta: 't' }).returning();
    const userA = 'a0000000-0000-0000-0000-000000000001';
    const userB = 'b0000000-0000-0000-0000-000000000002';
    await db.insert(usuario).values([
      { id: userA, email: 'a@t.cl' },
      { id: userB, email: 'b@t.cl' },
    ]);

    const dA = await repo.crearBorrador({
      tipo: 'planificacion_unidad',
      establecimientoId: 'X',
      corpusVersionId: cv!.id,
      usuarioId: userA,
    });

    // El WHERE de actualizarEstadoRevision exige usuario_id = dueño: con B, 0 filas afectadas.
    await repo.actualizarEstadoRevision(dA.id, 'en_revision', null, userB);
    expect((await repo.porId(dA.id, userA))!.estadoRevision).toBe('borrador');

    // Con el dueño real (A) sí transiciona.
    await repo.actualizarEstadoRevision(dA.id, 'en_revision', null, userA);
    expect((await repo.porId(dA.id, userA))!.estadoRevision).toBe('en_revision');
  }, T);
});

// Task 5: PlanificacionAnualRepositoryDrizzle debe acotar lecturas/escrituras al dueño (usuario_id) —
// un docente no puede listar ni resolver la unidad del plan de otro docente, aunque conozca el id.
describe('PlanificacionAnualRepository — aislamiento por usuario (Task 5)', () => {
  it('listar y obtenerUnidad solo devuelven lo del dueño', async () => {
    const db = await crearDbTest();
    // PGlite no es asignable a DrizzleDb (mismatch de tipos de sesión) — cast establecido en el repo.
    const repo = new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb);
    const [cv] = await db.insert(corpusVersion).values({ etiqueta: 't' }).returning();
    const userA = 'a0000000-0000-0000-0000-000000000001';
    const userB = 'b0000000-0000-0000-0000-000000000002';
    await db.insert(usuario).values([
      { id: userA, email: 'a@t.cl' },
      { id: userB, email: 'b@t.cl' },
    ]);

    const planA: PlanificacionAnual = {
      establecimiento: 'Colegio A',
      asignatura: 'Matemática',
      nivel: '1° básico',
      anio: 2026,
      unidades: [{ orden: 1, titulo: 'U1', oaCodigos: ['MA01 OA 01'] }],
    };
    const guardadaA = await repo.guardar(planA, cv!.id, userA);
    const unidadDeA = guardadaA.unidades[0]!.id;

    // listar({usuarioId: B}) no debe incluir el plan de A.
    const listadoB = await repo.listar({ usuarioId: userB });
    expect(listadoB).toHaveLength(0);
    const listadoA = await repo.listar({ usuarioId: userA });
    expect(listadoA).toHaveLength(1);
    expect(listadoA[0]!.id).toBe(guardadaA.id);

    // obtenerUnidad: B no puede resolver la unidad de A (aunque conozca el id); A sí.
    expect(await repo.obtenerUnidad(unidadDeA, userB)).toBeNull();
    expect(await repo.obtenerUnidad(unidadDeA, userA)).not.toBeNull();
  }, T);

  it('actualizar: el usuario B no puede modificar el plan de A (rechaza y no muta nada)', async () => {
    const db = await crearDbTest();
    const repo = new PlanificacionAnualRepositoryDrizzle(db as unknown as DrizzleDb);
    const [cv] = await db.insert(corpusVersion).values({ etiqueta: 't' }).returning();
    const userA = 'a0000000-0000-0000-0000-000000000001';
    const userB = 'b0000000-0000-0000-0000-000000000002';
    await db.insert(usuario).values([
      { id: userA, email: 'a@t.cl' },
      { id: userB, email: 'b@t.cl' },
    ]);

    const planA: PlanificacionAnual = {
      establecimiento: 'Colegio A',
      asignatura: 'Matemática',
      nivel: '1° básico',
      anio: 2026,
      unidades: [{ orden: 1, titulo: 'U1', oaCodigos: ['MA01 OA 01'] }],
    };
    const guardadaA = await repo.guardar(planA, cv!.id, userA);

    const intentoDeB: PlanificacionAnual = {
      establecimiento: 'Colegio B (hackeado)',
      asignatura: 'Lenguaje',
      nivel: '2° básico',
      anio: 2027,
      unidades: [{ orden: 1, titulo: 'U1-B', oaCodigos: ['LE01 OA 01'] }],
    };

    // El check de existencia+dueño en actualizar() no encuentra el id bajo usuario_id = B →
    // lanza "no encontrada" (mismo tratamiento que un id inexistente, no distingue "no es tuyo").
    await expect(repo.actualizar(guardadaA.id, intentoDeB, cv!.id, userB)).rejects.toThrow(
      `PlanificacionAnual con id '${guardadaA.id}' no encontrada`,
    );

    // El plan de A queda intacto: ni cabecera ni unidades fueron tocadas por el intento de B.
    const planTrasIntento = await repo.obtener(guardadaA.id, userA);
    expect(planTrasIntento).not.toBeNull();
    expect(planTrasIntento!.establecimiento).toBe('Colegio A');
    expect(planTrasIntento!.asignatura).toBe('Matemática');
    expect(planTrasIntento!.anio).toBe(2026);
    expect(planTrasIntento!.unidades).toHaveLength(1);
    expect(planTrasIntento!.unidades[0]!.titulo).toBe('U1');
  }, T);
});
