// Test de la prueba de la cascada (full-context) sin red ni API key: un doble de LlmPort sirve una
// Prueba de muestra por identidad de schema. Verifica PARIDAD con GenerarPruebaFormativaUseCase: la
// cascada también rechaza (GeneracionError) fuga de texto y enunciados duplicados (INV-2: basura nunca
// se persiste/exporta). El happy-path confirma que una prueba sana pasa y trae la traza_ia.

import type { ContextoCascada } from './tipos.js';
import type { LlmPort, PlanificacionUnidad, Prueba } from '@faro/domain';
import { GeneracionError, SchemaPrueba } from '@faro/domain';
import { describe, expect, it } from 'vitest';
import { GenerarPruebaCascadaUseCase } from './GenerarPruebaCascadaUseCase.js';

const ctx: ContextoCascada = {
  establecimiento: 'Colegio Demo',
  asignatura: 'Ciencias Naturales',
  nivel: '1º básico',
  unidadTitulo: 'Unidad 1: Los seres vivos',
  corpusVersionId: 'demo-cn-1b@1',
  oaSeleccionados: [
    { codigo: 'CN01 OA 01', categoria: 'basal', descripcion: 'Reconocer y observar seres vivos y no vivos del entorno.' },
  ],
};

/** Unidad mínima válida (Formato A) — suficiente para anclar OA y propósito. */
const unidadMuestra: PlanificacionUnidad = {
  plantilla: 'A',
  establecimiento: 'Colegio Demo',
  asignatura: 'Ciencias Naturales',
  nivel: '1º básico',
  unidad: 'Unidad 1: Los seres vivos',
  proposito: 'Reconocer características de los seres vivos del entorno.',
  duracion_semanas: 4,
  horas_pedagogicas: 8,
  oa: [
    {
      codigo: 'CN01 OA 01',
      categoria: 'basal',
      descripcion: 'Reconocer y observar seres vivos y no vivos del entorno.',
      detalle: [],
      habilidades: ['Observar'],
    },
  ],
  experiencias: ['Salida al patio a observar seres vivos.'],
  indicadores_evaluacion: [
    { oa: 'CN01 OA 01', texto: 'Distinguen seres vivos de objetos.', fuente: 'ia_borrador' },
  ],
  evaluacion: { tipo: ['formativa'], instrumentos: ['Lista de cotejo'] },
  extras: {},
};

/** Prueba de muestra sana (sin duplicados ni fuga): pasa los guards y se devuelve tal cual. */
const pruebaMuestra: Prueba = {
  asignatura: 'Ciencias Naturales',
  curso: '1º básico',
  tipo_evaluacion: 'formativa',
  perfil_nivel: '1-2',
  tabla_especificaciones: [{ oa: 'CN01 OA 01', n_items: 2 }],
  items: [
    {
      oa: 'CN01 OA 01',
      habilidad: 'recordar',
      tipo: 'verdadero_falso',
      enunciado: 'Un perro es un ser vivo.',
      alternativas: [
        { texto: 'Verdadero', correcta: true },
        { texto: 'Falso', correcta: false },
      ],
      retroalimentacion: 'Recuerda que los seres vivos nacen, crecen y se alimentan.',
    },
    {
      oa: 'CN01 OA 01',
      habilidad: 'comprender',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuál de estos es un ser vivo?',
      alternativas: [
        { texto: 'Una roca', correcta: false },
        { texto: 'Un árbol', correcta: true },
      ],
      retroalimentacion: 'Observa cuáles pueden crecer y alimentarse.',
    },
  ],
  pauta_correccion: 'Revisa cada ítem con su retroalimentación.',
};

/** Doble de LlmPort: sirve `prueba` para SchemaPrueba (identidad), valida la muestra contra el schema. */
function llmConPrueba(prueba: Prueba, llamadas: string[] = []): LlmPort {
  return {
    async generar(args) {
      llamadas.push(args.tarea);
      const parsed = args.schema.parse(prueba);
      return {
        parsed,
        stopReason: 'end_turn',
        usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        modelo: 'muestras',
      };
    },
  };
}

describe('GenerarPruebaCascadaUseCase (full-context, sin API key)', () => {
  it('devuelve una prueba sana con su traza_ia (happy-path)', async () => {
    const llamadas: string[] = [];
    const uc = new GenerarPruebaCascadaUseCase(llmConPrueba(pruebaMuestra, llamadas));

    const { valor, meta } = await uc.ejecutarConMeta(ctx, unidadMuestra);

    expect(() => SchemaPrueba.parse(valor)).not.toThrow();
    expect(valor.items).toHaveLength(2);
    expect(meta.modelo).toBe('muestras');
    expect(meta.stopReason).toBe('end_turn');
    expect(llamadas).toEqual(['redaccion']);
  });

  it('rechaza (GeneracionError) una prueba con dos ítems de enunciado idéntico (paridad con la formativa)', async () => {
    const itm: Prueba['items'][number] = {
      oa: 'CN01 OA 01',
      habilidad: 'recordar',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuál de estos es un ser vivo?',
      alternativas: [
        { texto: 'Una roca', correcta: false },
        { texto: 'Un árbol', correcta: true },
      ],
      retroalimentacion: 'Observa cuál puede crecer.',
    };
    const pruebaDup: Prueba = {
      ...pruebaMuestra,
      tabla_especificaciones: [{ oa: 'CN01 OA 01', n_items: 2 }],
      items: [itm, { ...itm }],
    };
    const uc = new GenerarPruebaCascadaUseCase(llmConPrueba(pruebaDup));

    await expect(uc.ejecutar(ctx, unidadMuestra)).rejects.toThrow(GeneracionError);
  });

  it('rechaza (GeneracionError) una prueba con fuga de razonamiento en un campo de texto (paridad)', async () => {
    const fuga = 'Cuatro tarjetas. ' + 'NOTE: let me write the clean JSON now. '.repeat(300);
    const pruebaConFuga: Prueba = {
      ...pruebaMuestra,
      items: pruebaMuestra.items.map((it, i) => (i === 0 ? { ...it, enunciado: fuga } : it)),
    };
    const uc = new GenerarPruebaCascadaUseCase(llmConPrueba(pruebaConFuga));

    await expect(uc.ejecutar(ctx, unidadMuestra)).rejects.toThrow(GeneracionError);
  });
});
