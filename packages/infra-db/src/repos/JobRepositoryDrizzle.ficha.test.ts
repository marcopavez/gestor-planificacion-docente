// packages/infra-db/src/repos/JobRepositoryDrizzle.ficha.test.ts
// Tests de integración con pglite: cola 'ficha_colorear' (Task 10, Plan 2).
// Espejo del describe 'material para colorear' en repos.integration.test.ts.

import { describe, expect, it } from 'vitest';
import { JobRepositoryDrizzle } from './JobRepositoryDrizzle.js';
import { crearDbTest } from '../test/pgliteHelper.js';
import { usuario } from '../schema/index.js';
import type { DrizzleDb } from '../db.js';

// Timeout alto — pglite carga WASM la primera vez y puede tardar hasta 30 s en Windows.
const T = 60_000;

const payload = {
  establecimiento: 'esc-1',
  asignatura: 'Matemática',
  nivel: '1º básico',
  oaCodigo: 'MA01 OA 01',
  concepto: 'frutas',
};

describe('JobRepositoryDrizzle · cola ficha_colorear', () => {
  it('encola y toma el job, incrementando intentos y revalidando el payload', async () => {
    const db = await crearDbTest();
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const usuarioId = crypto.randomUUID();
    await db.insert(usuario).values({ id: usuarioId, email: `t-${usuarioId}@t.cl` });

    const jobId = await repo.encolarFicha(payload, usuarioId);
    expect(jobId).toBeTruthy();

    const tomado = await repo.tomarSiguienteFicha('w1');
    expect(tomado?.id).toBe(jobId);
    expect(tomado?.payload).toEqual(payload);
    expect(tomado?.intentos).toBe(1);
    expect(tomado?.usuarioId).toBe(usuarioId);
  }, T);

  it('no devuelve jobs de otras colas (aislamiento por tipo_trabajo)', async () => {
    const db = await crearDbTest();
    const repo = new JobRepositoryDrizzle(db as unknown as DrizzleDb);
    const usuarioId = crypto.randomUUID();
    await db.insert(usuario).values({ id: usuarioId, email: `t2-${usuarioId}@t.cl` });

    // Encola en la cola hermana material_colorear — ficha NO debe tomarla.
    await repo.encolarMaterialColorear(
      {
        asignatura: 'Matemática',
        nivel: '1º básico',
        oaCodigo: 'MA01 OA 01',
        establecimiento: 'esc-1',
      },
      usuarioId,
    );
    const tomado = await repo.tomarSiguienteFicha('w1');
    expect(tomado).toBeNull();
  }, T);
});
