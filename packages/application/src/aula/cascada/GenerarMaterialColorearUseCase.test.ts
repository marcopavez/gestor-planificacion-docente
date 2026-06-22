import { describe, expect, it, vi } from 'vitest';
import type {
  BancoImagenesGeneradasPort,
  DibujoCacheado,
  ImageGenPort,
  LlmPort,
  MetaDibujo,
  SalidaEstructurada,
} from '@faro/domain';
import { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import { GenerarMaterialColorearUseCase } from './GenerarMaterialColorearUseCase.js';
import type { ContextoCascada } from './tipos.js';

const CTX: ContextoCascada = {
  establecimiento: 'Colegio X',
  asignatura: 'Matemática',
  nivel: '1° básico',
  oaSeleccionados: [{ codigo: 'MA01 OA 01', categoria: 'basal', descripcion: 'Contar del 0 al 20' }],
  corpusVersionId: 'cv-1',
};

function llmConDescripcion(): LlmPort {
  return {
    async generar(): Promise<SalidaEstructurada<never>> {
      return {
        parsed: { concepto: 'conteo de frutas', descripcion_en: 'ten apples in a basket' } as never,
        stopReason: 'end_turn',
        usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
        modelo: 'fake-sonnet',
      };
    },
  };
}

// Banco en memoria (doble del puerto).
function bancoMemoria(precargado?: Record<string, DibujoCacheado>): BancoImagenesGeneradasPort & { guardados: string[] } {
  const store = new Map<string, DibujoCacheado>(Object.entries(precargado ?? {}));
  const guardados: string[] = [];
  return {
    guardados,
    async buscar(clave) {
      return store.get(clave) ?? null;
    },
    async guardar(clave, png, _meta: MetaDibujo) {
      guardados.push(clave);
      store.set(clave, { png, descripcion: _meta.descripcion, concepto: _meta.concepto });
    },
  };
}

const PNG = Buffer.from([1, 2, 3]);

describe('GenerarMaterialColorearUseCase', () => {
  it('cache MISS: llama Claude + Imagen y cachea el PNG; ensambla la lámina borrador', async () => {
    const imageGen: ImageGenPort = { generarLineArt: vi.fn(async () => PNG) };
    const banco = bancoMemoria();
    const uc = new GenerarMaterialColorearUseCase({
      descripcion: new GenerarDescripcionDibujoUseCase(llmConDescripcion()),
      imageGen,
      banco,
    });

    const { valor } = await uc.ejecutarConMeta(CTX);
    expect(imageGen.generarLineArt).toHaveBeenCalledOnce();
    expect(banco.guardados).toHaveLength(1);
    expect(valor.asignatura).toBe('Matemática');
    expect(valor.curso).toBe('1° básico');
    expect(valor.oa.codigo).toBe('MA01 OA 01');
    expect(valor.consigna).toBe('Pinta el dibujo.');
    expect(valor.titulo).toContain('conteo de frutas');
    expect(valor.imagen_clave).toBeTruthy();
  });

  it('cache HIT: NO llama Claude ni Imagen; reusa concepto/descripción del banco', async () => {
    const imageGen: ImageGenPort = { generarLineArt: vi.fn(async () => PNG) };
    const generarSpy = vi.fn();
    // Pre-carga el banco con la clave que el use case calculará para este OA (concepto vacío).
    const { claveDibujo } = await import('@faro/domain');
    const clave = claveDibujo('MA01 OA 01', undefined);
    const banco = bancoMemoria({ [clave]: { png: PNG, descripcion: 'cached desc', concepto: 'concepto cacheado' } });
    const descripcion = new GenerarDescripcionDibujoUseCase(llmConDescripcion());
    descripcion.ejecutarConMeta = generarSpy as never;

    const uc = new GenerarMaterialColorearUseCase({ descripcion, imageGen, banco });
    const { valor } = await uc.ejecutarConMeta(CTX);
    expect(generarSpy).not.toHaveBeenCalled();
    expect(imageGen.generarLineArt).not.toHaveBeenCalled();
    expect(valor.concepto).toBe('concepto cacheado');
  });

  it('degradado (Imagen devuelve null): no cachea; la lámina sale con imagen_clave pero sin PNG', async () => {
    const imageGen: ImageGenPort = { generarLineArt: vi.fn(async () => null) };
    const banco = bancoMemoria();
    const uc = new GenerarMaterialColorearUseCase({
      descripcion: new GenerarDescripcionDibujoUseCase(llmConDescripcion()),
      imageGen,
      banco,
    });
    const { valor } = await uc.ejecutarConMeta(CTX);
    expect(banco.guardados).toHaveLength(0);
    expect(valor.descripcion_dibujo).toBe('ten apples in a basket');
    expect(valor.imagen_clave).toBeTruthy();
  });

  it('regenerar=true: salta el cache aunque exista', async () => {
    const imageGen: ImageGenPort = { generarLineArt: vi.fn(async () => PNG) };
    const { claveDibujo } = await import('@faro/domain');
    const clave = claveDibujo('MA01 OA 01', undefined);
    const banco = bancoMemoria({ [clave]: { png: PNG, descripcion: 'vieja', concepto: 'vieja' } });
    const uc = new GenerarMaterialColorearUseCase({
      descripcion: new GenerarDescripcionDibujoUseCase(llmConDescripcion()),
      imageGen,
      banco,
    });
    await uc.ejecutarConMeta(CTX, { regenerar: true });
    expect(imageGen.generarLineArt).toHaveBeenCalledOnce();
  });

  it('rechaza grado > 3 (solo 1º-3º)', async () => {
    const uc = new GenerarMaterialColorearUseCase({
      descripcion: new GenerarDescripcionDibujoUseCase(llmConDescripcion()),
      imageGen: { generarLineArt: vi.fn(async () => PNG) },
      banco: bancoMemoria(),
    });
    await expect(uc.ejecutar({ ...CTX, nivel: '5° básico' })).rejects.toThrow(/material_tramo_no_soportado/);
  });
});
