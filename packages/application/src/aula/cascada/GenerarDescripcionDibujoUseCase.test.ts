import { describe, expect, it } from 'vitest';
import type { BloqueSistema, LlmPort, SalidaEstructurada } from '@faro/domain';
import { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { ContextoCascada } from './tipos.js';

const CTX: ContextoCascada = {
  establecimiento: 'Colegio X',
  asignatura: 'Matemática',
  nivel: '1° básico',
  oaSeleccionados: [{ codigo: 'MA01 OA 01', categoria: 'basal', descripcion: 'Contar del 0 al 20' }],
  corpusVersionId: 'cv-1',
};

// Doble de LlmPort que devuelve un parsed fijo y registra el system que recibió (para verificar grounding).
function fakeLlm(parsed: unknown, capturas?: { system?: readonly BloqueSistema[] }): LlmPort {
  return {
    async generar(args): Promise<SalidaEstructurada<never>> {
      if (capturas) capturas.system = args.system;
      return { parsed: parsed as never, stopReason: 'end_turn', usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 }, modelo: 'fake' };
    },
  };
}

describe('GenerarDescripcionDibujoUseCase', () => {
  it('devuelve la descripción (concepto + descripcion_en) y ancla el OA en el system (bloqueCorpus)', async () => {
    const capturas: { system?: readonly BloqueSistema[] } = {};
    const uc = new GenerarDescripcionDibujoUseCase(
      fakeLlm({ concepto: 'conteo de frutas', descripcion_en: 'ten apples in a basket' }, capturas),
    );
    const { valor } = await uc.ejecutarConMeta(CTX);
    expect(valor.descripcion_en).toBe('ten apples in a basket');
    expect(JSON.stringify(capturas.system)).toContain('MA01 OA 01'); // grounding del corpus
  });

  it('rechaza fuga de texto (descripción descomunal)', async () => {
    const uc = new GenerarDescripcionDibujoUseCase(
      fakeLlm({ concepto: 'c', descripcion_en: 'x'.repeat(5000) }),
    );
    await expect(uc.ejecutar(CTX)).rejects.toThrow(/fuga_texto/);
  });

  it('lanza si el LLM rechaza (parsed=null)', async () => {
    const llm: LlmPort = {
      async generar() {
        return { parsed: null, stopReason: 'refusal', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, modelo: 'fake' };
      },
    };
    await expect(new GenerarDescripcionDibujoUseCase(llm).ejecutar(CTX)).rejects.toThrow();
  });
});
