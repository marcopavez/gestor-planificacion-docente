// packages/infra-db/src/test/unidadDeTrabajo.integration.test.ts
// Atomicidad de UnidadDeTrabajoDrizzle (FIX H-PA.8) sobre pglite real + migraciones.
// Demuestra que enTransaccion revierte TODO si fn lanza (cero filas tras el throw) y
// que un caso de éxito SÍ commitea. Es la prueba directa del bloqueante de atomicidad.

import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { crearDbTest } from './pgliteHelper.js';
import { UnidadDeTrabajoDrizzle } from '../repos/UnidadDeTrabajoDrizzle.js';
import { corpusVersion, usuario } from '../schema/index.js';
import type { DrizzleDb } from '../db.js';

// pglite carga WASM la 1ª vez (lento en Windows) — timeout amplio por test.
const T = 60_000;

type TestDb = Awaited<ReturnType<typeof crearDbTest>>;

async function insertarCorpusVersion(db: TestDb): Promise<string> {
  const [row] = await db
    .insert(corpusVersion)
    .values({ etiqueta: 'v1-uow-test', estado: 'publicada' })
    .returning();
  if (!row) throw new Error('No se pudo insertar corpus_version');
  return row.id;
}

// Task 3 hizo usuarioId obligatorio en NuevoDocumento (FK NOT NULL) — seedeamos el dueño.
async function insertarUsuario(db: TestDb): Promise<string> {
  const [row] = await db
    .insert(usuario)
    .values({ id: crypto.randomUUID(), email: 'uow-test@t.cl' })
    .returning();
  if (!row) throw new Error('No se pudo insertar usuario');
  return row.id;
}

async function contarDocumentos(db: TestDb): Promise<number> {
  const res = await db.execute(sql`SELECT COUNT(*) AS n FROM documento_generado`);
  return Number((res as unknown as { rows: Array<{ n: string }> }).rows[0]?.n ?? 0);
}

describe('UnidadDeTrabajoDrizzle — atomicidad (rollback / commit)', () => {
  it('si fn lanza tras un crearBorrador → rollback total (cero filas)', async () => {
    const db = await crearDbTest();
    const cvId = await insertarCorpusVersion(db);
    const usuarioId = await insertarUsuario(db);
    const uow = new UnidadDeTrabajoDrizzle(db as unknown as DrizzleDb);

    // Precondición: no hay documentos antes de la transacción.
    expect(await contarDocumentos(db)).toBe(0);

    const fallo = uow.enTransaccion(async (repos) => {
      // Escribe un documento DENTRO de la tx…
      await repos.documentos.crearBorrador({
        tipo: 'planificacion_unidad',
        establecimientoId: 'Colegio Test',
        usuarioId,
        corpusVersionId: cvId,
        payload: { unidad: 'U1' },
        estadoGeneracion: 'validado',
      });
      // …y luego LANZA: la transacción debe revertir la escritura anterior.
      throw new Error('fallo simulado a mitad de la transacción');
    });

    await expect(fallo).rejects.toThrow('fallo simulado');

    // Atomicidad: ninguna fila quedó tras el throw (la inserción se revirtió).
    expect(await contarDocumentos(db)).toBe(0);
  }, T);

  it('si fn retorna sin lanzar → commit (las filas persisten)', async () => {
    const db = await crearDbTest();
    const cvId = await insertarCorpusVersion(db);
    const usuarioId = await insertarUsuario(db);
    const uow = new UnidadDeTrabajoDrizzle(db as unknown as DrizzleDb);

    const docId = await uow.enTransaccion(async (repos) => {
      const unidadDoc = await repos.documentos.crearBorrador({
        tipo: 'planificacion_unidad',
        establecimientoId: 'Colegio Test',
        usuarioId,
        corpusVersionId: cvId,
        payload: { unidad: 'U1' },
        estadoGeneracion: 'validado',
      });
      const claseDoc = await repos.documentos.crearBorrador({
        tipo: 'planificacion_clase',
        establecimientoId: 'Colegio Test',
        usuarioId,
        corpusVersionId: cvId,
        origenId: unidadDoc.id,
        payload: { clase: 1 },
        estadoGeneracion: 'validado',
      });
      // Una traza en la misma tx: confirma que documentos y trazas comparten transacción.
      await repos.trazas.registrar({
        documentoId: claseDoc.id,
        corpusVersionId: cvId,
        modelo: 'samples-demo',
        rutaDecision: 'cascada/clase',
        promptHash: '',
        recuperado: [],
        citas: [],
        evals: { ok: true },
        usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        revisor: null,
      });
      return unidadDoc.id;
    });

    expect(docId).toBeDefined();
    // Ambos documentos persistieron tras el commit.
    expect(await contarDocumentos(db)).toBe(2);

    const trazas = await db.execute(sql`SELECT COUNT(*) AS n FROM traza_ia`);
    expect(Number((trazas as unknown as { rows: Array<{ n: string }> }).rows[0]?.n ?? 0)).toBe(1);
  }, T);
});
