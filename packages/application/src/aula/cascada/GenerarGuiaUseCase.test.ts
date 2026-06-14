// Test de GenerarGuiaUseCase (guía del alumno, Tanda 1): sin red ni API key.
// Un doble de LlmPort sirve una Guia de muestra; verifica que el use case ensambla la guía,
// SOBRESCRIBE los campos fijos del contexto/OA, rechaza el tramo 1-2 y detecta fuga de texto.

import type { LlmPort, Guia } from '@faro/domain';
import { GeneracionError, SchemaGuia } from '@faro/domain';
import { describe, expect, it } from 'vitest';
import { GenerarGuiaUseCase } from './GenerarGuiaUseCase.js';
import type { ContextoCascada } from './tipos.js';

function ctxMuestra(nivel: string): ContextoCascada {
  return {
    establecimiento: 'Colegio Demo',
    asignatura: 'Ciencias Naturales',
    nivel,
    oaSeleccionados: [
      { codigo: 'CN03 OA 01', categoria: 'basal', descripcion: 'Observar y describir los seres vivos.' },
    ],
    corpusVersionId: '00000000-0000-0000-0000-000000000001',
  };
}

// Guía de muestra de la IA: campos fijos "equivocados" a propósito → el use case debe sobrescribirlos.
const guiaMuestra: Guia = {
  asignatura: 'IA-Asignatura',
  curso: 'IA-Curso',
  oa: { codigo: 'IA-OA', descripcion: 'IA-desc' },
  conocimiento: 'IA-conocimiento',
  perfil_nivel: '5-6',
  titulo: 'IA-titulo',
  explicacion: 'Los seres vivos nacen, crecen y se alimentan.',
  ejemplo: 'Un perro nace, crece y come.',
  ejercicios: [
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuál es un ser vivo?',
      alternativas: [
        { texto: 'Una roca', correcta: false },
        { texto: 'Un árbol', correcta: true },
      ],
      retroalimentacion: 'Recuerda qué hacen los seres vivos.',
    },
  ],
};

function llmDe(guia: Guia): LlmPort {
  return {
    async generar(args) {
      const parsed = args.schema.parse(guia); // valida contra SchemaGuia real
      return {
        parsed,
        stopReason: 'end_turn',
        usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        modelo: 'muestras',
      };
    },
  };
}

describe('GenerarGuiaUseCase', () => {
  it('ensambla una guía válida y SOBRESCRIBE los campos fijos del contexto (3º → tramo 3-4)', async () => {
    const uc = new GenerarGuiaUseCase(llmDe(guiaMuestra));
    const guia = await uc.ejecutar(ctxMuestra('3º básico'), 'Características de los seres vivos');

    expect(() => SchemaGuia.parse(guia)).not.toThrow();
    expect(guia.asignatura).toBe('Ciencias Naturales');
    expect(guia.curso).toBe('3º básico');
    expect(guia.oa.codigo).toBe('CN03 OA 01');
    expect(guia.conocimiento).toBe('Características de los seres vivos');
    expect(guia.perfil_nivel).toBe('3-4');
  });

  it('rechaza (GeneracionError) un nivel de tramo 1-2 (no soportado en tanda 1)', async () => {
    const uc = new GenerarGuiaUseCase(llmDe(guiaMuestra));
    await expect(uc.ejecutar(ctxMuestra('1º básico'), 'X')).rejects.toThrow(GeneracionError);
  });

  it('rechaza (GeneracionError) una guía con fuga de razonamiento en explicacion', async () => {
    const conFuga: Guia = { ...guiaMuestra, explicacion: 'Z '.repeat(2000) };
    const uc = new GenerarGuiaUseCase(llmDe(conFuga));
    await expect(uc.ejecutar(ctxMuestra('4º básico'), 'X')).rejects.toThrow(GeneracionError);
  });
});
