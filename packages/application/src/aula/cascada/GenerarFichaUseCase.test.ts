import { describe, expect, it, vi } from 'vitest';
import type { BancoImagenesGeneradasPort } from '@faro/domain';
import { claveDibujo } from '@faro/domain';
import { GenerarFichaUseCase } from './GenerarFichaUseCase.js';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { GenerarEjerciciosFichaUseCase } from './GenerarEjerciciosFichaUseCase.js';
import type { ContextoCascada } from './tipos.js';

const META_D = { modelo: 'fake', usage: { input: 4, output: 2, cacheRead: 0, cacheCreation: 0 }, stopReason: 'end_turn' };
const META_E = { modelo: 'fake-sonnet', usage: { input: 100, output: 50, cacheRead: 0, cacheCreation: 0 }, stopReason: 'end_turn' };
const item = { oa: 'MA01 OA 01', habilidad: 'recordar' as const, tipo: 'completacion' as const, enunciado: 'Cuenta: 1, 2, ____.' };

function ctxGrado(n: string): ContextoCascada {
  return { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: n, oaSeleccionados: [{ codigo: 'MA01 OA 01', categoria: 'basal', descripcion: 'Contar.' }], corpusVersionId: 'cv-1' };
}

function deps() {
  const descripcion = { ejecutarConMeta: vi.fn(async () => ({ valor: { concepto: 'frutas', descripcion_en: 'apples' }, meta: META_D })), ejecutar: vi.fn() } as unknown as GenerarDescripcionDibujoUseCase;
  const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
  const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };
  const ejercicios = { ejecutarConMeta: vi.fn(async () => ({ valor: [item], meta: META_E })), ejecutar: vi.fn() } as unknown as GenerarEjerciciosFichaUseCase;
  return { descripcion, imageGen, banco, ejercicios };
}

describe('GenerarFichaUseCase', () => {
  it('ensambla la ficha: dibujo + ejercicios, perfil_nivel por tramo, imagen_clave determinista', async () => {
    const d = deps();
    const uc = new GenerarFichaUseCase(d);
    const { valor: ficha, meta } = await uc.ejecutarConMeta(ctxGrado('1º básico'), { concepto: 'frutas' });

    expect(ficha.perfil_nivel).toBe('1-2');
    expect(ficha.concepto).toBe('frutas');
    expect(ficha.titulo).toBe('Ficha para colorear: frutas');
    expect(ficha.consigna_dibujo).toBe('Colorea el dibujo.');
    expect(ficha.ejercicios).toHaveLength(1);
    expect(ficha.imagen_clave).toBe(claveDibujo('MA01 OA 01', 'frutas'));
    expect(ficha.descripcion_dibujo).toBe('apples');
    // meta combinada: usage sumado (dibujo + ejercicios).
    expect(meta.usage.input).toBe(104);
    expect(meta.usage.output).toBe(52);
  });

  it('3º básico cae en tramo 3-4', async () => {
    const uc = new GenerarFichaUseCase(deps());
    const { valor } = await uc.ejecutarConMeta(ctxGrado('3º básico'));
    expect(valor.perfil_nivel).toBe('3-4');
  });

  it('rechaza grado > 3 (ficha_tramo_no_soportado) ANTES de llamar a la IA', async () => {
    const d = deps();
    const uc = new GenerarFichaUseCase(d);
    await expect(uc.ejecutarConMeta(ctxGrado('4º básico'))).rejects.toThrow('ficha_tramo_no_soportado');
    expect(d.ejercicios.ejecutarConMeta).not.toHaveBeenCalled();
  });

  it('lanza ficha_sin_oa si no hay OA', async () => {
    const uc = new GenerarFichaUseCase(deps());
    const ctx = { ...ctxGrado('1º básico'), oaSeleccionados: [] };
    await expect(uc.ejecutarConMeta(ctx)).rejects.toThrow('ficha_sin_oa');
  });

  it('los ejercicios usan el CONCEPTO del dibujo, no opts.concepto (anclaje #1)', async () => {
    const d = deps();
    const uc = new GenerarFichaUseCase(d);
    // SIN opts.concepto: el concepto debe salir del dibujo resuelto ('frutas'), no de opts (undefined).
    await uc.ejecutarConMeta(ctxGrado('1º básico'));
    expect(d.ejercicios.ejecutarConMeta).toHaveBeenCalledWith(ctxGrado('1º básico'), 'frutas');
  });
});
