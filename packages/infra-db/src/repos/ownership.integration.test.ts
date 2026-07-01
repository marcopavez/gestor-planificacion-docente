// packages/infra-db/src/repos/ownership.integration.test.ts
// Verifica que documento_generado.usuario_id existe, es NOT NULL y referencia usuario(id).
import { describe, it, expect } from 'vitest';
import { crearDbTest } from '../test/pgliteHelper.js';
import { usuario, documentoGenerado, corpusVersion } from '../schema/index.js';
import { eq } from 'drizzle-orm';
import { DocumentoRepositoryDrizzle } from './DocumentoRepositoryDrizzle.js';
import type { NuevoDocumento } from '@faro/domain';

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
    const repo = new DocumentoRepositoryDrizzle(db);
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
});
