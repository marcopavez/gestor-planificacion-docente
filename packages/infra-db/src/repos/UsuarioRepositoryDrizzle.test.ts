// packages/infra-db/src/repos/UsuarioRepositoryDrizzle.test.ts
// Task 6: asegurar es idempotente (ON CONFLICT DO NOTHING), porId lee el estado inicial
// ('trial' por default de schema) e incrementarGeneraciones suma atómicamente en DB.
import { describe, it, expect } from 'vitest';
import { crearDbTest } from '../test/pgliteHelper.js';
import { UsuarioRepositoryDrizzle } from './UsuarioRepositoryDrizzle.js';
import type { DrizzleDb } from '../db.js';

// Timeout alto: pglite carga WASM la primera vez y puede tardar hasta 30s en Windows
// (mismo patrón que ownership.integration.test.ts).
const T = 60_000;

describe('UsuarioRepositoryDrizzle', () => {
  it('asegurar es idempotente y porId lee el estado', async () => {
    const db = await crearDbTest();
    // PGlite no es asignable a DrizzleDb (mismatch de tipos de sesión) — cast establecido en el repo.
    const repo = new UsuarioRepositoryDrizzle(db as unknown as DrizzleDb);
    const id = 'a0000000-0000-0000-0000-000000000001';
    await repo.asegurar(id, 'a@t.cl');
    await repo.asegurar(id, 'a@t.cl'); // idempotente, no lanza
    const u = await repo.porId(id);
    expect(u?.plan).toBe('trial');
    await repo.incrementarGeneraciones(id);
    expect((await repo.porId(id))?.generacionesUsadas).toBe(1);
  }, T);
});
