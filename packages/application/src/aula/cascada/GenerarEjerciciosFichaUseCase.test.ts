import { describe, expect, it, vi } from 'vitest';
import type { LlmPort, SalidaEstructurada } from '@faro/domain';
import { GenerarEjerciciosFichaUseCase } from './GenerarEjerciciosFichaUseCase.js';
import type { ContextoCascada } from './tipos.js';

const ctx: ContextoCascada = {
  establecimiento: 'esc-1',
  asignatura: 'Matemática',
  nivel: '1º básico',
  oaSeleccionados: [{ codigo: 'MA01 OA 01', categoria: 'basal', descripcion: 'Contar del 0 al 100.' }],
  corpusVersionId: 'cv-1',
};

function llmCon(parsed: unknown): LlmPort {
  const salida: SalidaEstructurada<unknown> = {
    parsed,
    modelo: 'fake-sonnet',
    usage: { input: 100, output: 50, cacheRead: 0, cacheCreation: 0 },
    stopReason: parsed === null ? 'max_tokens' : 'end_turn',
  };
  return { generar: vi.fn(async () => salida) } as unknown as LlmPort;
}

const itemOk = { oa: 'MA01 OA 01', habilidad: 'recordar', tipo: 'completacion', enunciado: 'Cuenta: 1, 2, ____.' };

describe('GenerarEjerciciosFichaUseCase', () => {
  it('devuelve los ejercicios parseados', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon({ ejercicios: [itemOk, { ...itemOk, enunciado: 'Otro' }] }));
    const { valor } = await uc.ejecutarConMeta(ctx, 'conteo');
    expect(valor).toHaveLength(2);
    expect(valor[0]?.tipo).toBe('completacion');
  });

  it('lanza ficha_sin_oa si no hay OA seleccionado', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon({ ejercicios: [itemOk] }));
    await expect(uc.ejecutarConMeta({ ...ctx, oaSeleccionados: [] })).rejects.toThrow('ficha_sin_oa');
  });

  it('lanza ficha_sin_ejercicios si la IA devuelve lista vacía', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon({ ejercicios: [] }));
    await expect(uc.ejecutarConMeta(ctx)).rejects.toThrow('ficha_sin_ejercicios');
  });

  it('rechaza fuga de texto en un ítem', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon({ ejercicios: [{ ...itemOk, enunciado: 'x'.repeat(1001) }] }));
    await expect(uc.ejecutarConMeta(ctx)).rejects.toThrow(/fuga_texto/);
  });

  it('propaga el stopReason si parsed===null', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon(null));
    await expect(uc.ejecutarConMeta(ctx)).rejects.toThrow('max_tokens');
  });
});
