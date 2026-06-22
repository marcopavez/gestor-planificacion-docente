import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MetaDibujo } from '@faro/domain';
import { BancoImagenesFsAdapter } from './BancoImagenesFsAdapter.js';

const META: MetaDibujo = {
  oaCodigo: 'MA01 OA 01',
  concepto: 'conteo de frutas',
  descripcion: 'ten apples in a basket',
  modelo: 'imagen-4.0-fast-generate-001',
  imagenesVersion: '2026.1',
};

describe('BancoImagenesFsAdapter', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'faro-banco-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('buscar() → null cuando la clave no existe', async () => {
    const banco = new BancoImagenesFsAdapter(dir);
    expect(await banco.buscar('noexiste')).toBeNull();
  });

  it('guardar() luego buscar() devuelve el PNG + concepto + descripción', async () => {
    const banco = new BancoImagenesFsAdapter(dir);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // firma PNG (fake)
    await banco.guardar('abc123', png, META);

    const cached = await banco.buscar('abc123');
    expect(cached).not.toBeNull();
    expect(cached?.png.equals(png)).toBe(true);
    expect(cached?.descripcion).toBe('ten apples in a basket');
    expect(cached?.concepto).toBe('conteo de frutas');
  });
});
