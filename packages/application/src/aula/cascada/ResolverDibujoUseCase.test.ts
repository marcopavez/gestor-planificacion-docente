import { describe, expect, it, vi } from 'vitest';
import type { BancoImagenesGeneradasPort, DibujoCacheado } from '@faro/domain';
import { claveDibujo } from '@faro/domain';
import { ResolverDibujoUseCase } from './ResolverDibujoUseCase.js';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { ContextoCascada } from './tipos.js';

const ctx: ContextoCascada = {
  establecimiento: 'esc-1',
  asignatura: 'Matemática',
  nivel: '1º básico',
  oaSeleccionados: [{ codigo: 'MA01 OA 01', categoria: 'basal', descripcion: 'Contar.' }],
  corpusVersionId: 'cv-1',
};

const META = { modelo: 'fake', usage: { input: 10, output: 5, cacheRead: 0, cacheCreation: 0 }, stopReason: 'end_turn' };

function fakeDescripcion(): GenerarDescripcionDibujoUseCase {
  return {
    ejecutarConMeta: vi.fn(async () => ({ valor: { concepto: 'frutas', descripcion_en: 'three apples' }, meta: META })),
    ejecutar: vi.fn(),
  } as unknown as GenerarDescripcionDibujoUseCase;
}

describe('ResolverDibujoUseCase', () => {
  it('cache HIT: reusa el dibujo sin llamar a Claude ni a Imagen', async () => {
    const desc = fakeDescripcion();
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
    const cacheado: DibujoCacheado = { png: Buffer.from('x'), descripcion: 'cached desc', concepto: 'cached' };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => cacheado), guardar: vi.fn() };

    const uc = new ResolverDibujoUseCase({ descripcion: desc, imageGen, banco });
    const r = await uc.resolver(ctx, 'MA01 OA 01', { concepto: 'frutas' });

    expect(r).toEqual({ clave: claveDibujo('MA01 OA 01', 'frutas'), concepto: 'cached', descripcion: 'cached desc', meta: { modelo: 'cache', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, stopReason: 'cache_hit' } });
    expect(desc.ejecutarConMeta).not.toHaveBeenCalled();
    expect(imageGen.generarLineArt).not.toHaveBeenCalled();
  });

  it('cache MISS: Claude describe, Imagen dibuja, se guarda en el banco', async () => {
    const desc = fakeDescripcion();
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png-bytes')) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverDibujoUseCase({ descripcion: desc, imageGen, banco });
    const r = await uc.resolver(ctx, 'MA01 OA 01', { concepto: 'frutas' });

    expect(imageGen.generarLineArt).toHaveBeenCalledWith('three apples', { aspectRatio: '3:4' });
    expect(banco.guardar).toHaveBeenCalledOnce();
    expect(r.concepto).toBe('frutas');
    expect(r.descripcion).toBe('three apples');
    expect(r.meta).toBe(META);
  });

  it('regenerar=true: ignora el cache aunque haya hit', async () => {
    const desc = fakeDescripcion();
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => ({ png: Buffer.from('x'), descripcion: 'd', concepto: 'c' })), guardar: vi.fn(async () => {}) };

    const uc = new ResolverDibujoUseCase({ descripcion: desc, imageGen, banco });
    await uc.resolver(ctx, 'MA01 OA 01', { concepto: 'frutas', regenerar: true });

    expect(banco.buscar).not.toHaveBeenCalled();
    expect(desc.ejecutarConMeta).toHaveBeenCalledOnce();
  });

  it('Imagen no disponible (png=null): NO guarda; igual devuelve la descripción', async () => {
    const desc = fakeDescripcion();
    const imageGen = { generarLineArt: vi.fn(async () => null) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverDibujoUseCase({ descripcion: desc, imageGen, banco });
    const r = await uc.resolver(ctx, 'MA01 OA 01');

    expect(banco.guardar).not.toHaveBeenCalled();
    expect(r.descripcion).toBe('three apples');
  });
});
