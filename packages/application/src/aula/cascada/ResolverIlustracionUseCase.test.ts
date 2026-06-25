import { describe, expect, it, vi } from 'vitest';
import type { BancoImagenesGeneradasPort, DibujoCacheado } from '@faro/domain';
import { claveIlustracion } from '@faro/domain';
import { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';

const DESC = 'siete estrellas en una entrada de show';

describe('ResolverIlustracionUseCase', () => {
  it('cache HIT: devuelve la clave sin llamar a generarLineArt', async () => {
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
    const cacheado: DibujoCacheado = { png: Buffer.from('x'), descripcion: DESC, concepto: DESC };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => cacheado), guardar: vi.fn(async () => {}) };

    const uc = new ResolverIlustracionUseCase({ imageGen, banco });
    const clave = await uc.resolver(DESC, 'MA01 OA 01');

    expect(clave).toBe(claveIlustracion(DESC));
    expect(imageGen.generarLineArt).not.toHaveBeenCalled();
    expect(banco.guardar).not.toHaveBeenCalled();
  });

  it('cache MISS: genera, guarda y devuelve la clave (aspectRatio 1:1 por defecto)', async () => {
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png-bytes')) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverIlustracionUseCase({ imageGen, banco });
    const clave = await uc.resolver(DESC, 'MA01 OA 01');

    expect(clave).toBe(claveIlustracion(DESC));
    expect(imageGen.generarLineArt).toHaveBeenCalledWith(DESC, { aspectRatio: '1:1' });
    expect(banco.guardar).toHaveBeenCalledOnce();
    const [claveGuardada, png, meta] = (banco.guardar as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(claveGuardada).toBe(claveIlustracion(DESC));
    expect(png).toEqual(Buffer.from('png-bytes'));
    expect(meta).toMatchObject({ oaCodigo: 'MA01 OA 01', descripcion: DESC, modelo: 'imagegen' });
  });

  it('sin API key (generarLineArt → null): devuelve null y NO guarda (degradación)', async () => {
    const imageGen = { generarLineArt: vi.fn(async () => null) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverIlustracionUseCase({ imageGen, banco });
    const clave = await uc.resolver(DESC, 'MA01 OA 01');

    expect(clave).toBeNull();
    expect(banco.guardar).not.toHaveBeenCalled();
  });

  it('respeta opts.aspectRatio cuando se pasa', async () => {
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverIlustracionUseCase({ imageGen, banco });
    await uc.resolver(DESC, 'MA01 OA 01', { aspectRatio: '16:9' });

    expect(imageGen.generarLineArt).toHaveBeenCalledWith(DESC, { aspectRatio: '16:9' });
  });
});
