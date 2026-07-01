// packages/infra-db/src/repos/ownership.integration.test.ts
// Verifica que documento_generado.usuario_id existe, es NOT NULL y referencia usuario(id).
import { describe, it, expect } from 'vitest';
import { crearDbTest } from '../test/pgliteHelper.js';
import { usuario, documentoGenerado, corpusVersion } from '../schema/index.js';
import { eq } from 'drizzle-orm';

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
