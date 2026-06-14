// Test de la prueba formativa (Fase 4) sin red ni API key: un doble de LlmPort sirve una Prueba de muestra.
// Verifica que el use case ensambla una Prueba que valida SchemaPrueba, fija perfil_nivel por tramo y
// tipo_evaluacion='formativa', y SOBRESCRIBE los campos que no se inventan (asignatura/curso) con los de
// la unidad. La muestra es internamente coherente y DEBE pasar pedagogicalGate (INV-1, sin red).

import type { LlmPort, PlanificacionUnidad, Prueba } from '@faro/domain';
import { GeneracionError, pedagogicalGate, SchemaPrueba, tramoDeNivel } from '@faro/domain';
import { describe, expect, it } from 'vitest';
import { GenerarPruebaFormativaUseCase } from './GenerarPruebaFormativaUseCase.js';

/** Unidad mínima válida (Formato A) para un nivel dado; suficiente para anclar OA y propósito. */
function unidadMuestra(nivel: string): PlanificacionUnidad {
  return {
    plantilla: 'A',
    establecimiento: 'Colegio Demo',
    asignatura: 'Ciencias Naturales',
    nivel,
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
}

// Prueba de muestra de la IA: cubre varios tipos de ítem (SM, V/F, ordenar, pareados, completación,
// pictórico) y pasa pedagogicalGate. Sin puntajes → formativa sin ponderación (no dispara puntajes_cuadran).
// asignatura/curso/tipo_evaluacion/perfil_nivel traen valores "equivocados" a propósito → el use case
// debe sobreescribirlos con los de la unidad.
const pruebaMuestra: Prueba = {
  asignatura: 'IA-Asignatura',
  curso: 'IA-Curso',
  tabla_especificaciones: [{ oa: 'CN01 OA 01', n_items: 6 }],
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
        { texto: 'Una mesa', correcta: false },
      ],
      retroalimentacion: 'Observa cuáles pueden crecer y alimentarse.',
    },
    {
      oa: 'CN01 OA 01',
      habilidad: 'aplicar',
      tipo: 'ordenar',
      enunciado: 'Ordena las etapas de la vida de una planta.',
      secuencia_correcta: ['Semilla', 'Brote', 'Planta adulta'],
      retroalimentacion: 'Piensa en cómo crece una planta desde la semilla.',
    },
    {
      oa: 'CN01 OA 01',
      habilidad: 'analizar',
      tipo: 'terminos_pareados',
      enunciado: 'Une cada ser vivo con lo que necesita.',
      pares: [
        { columnaA: 'Planta', columnaB: 'Luz del sol' },
        { columnaA: 'Pez', columnaB: 'Agua' },
      ],
      retroalimentacion: 'Relaciona cada ser con su necesidad principal.',
    },
    {
      oa: 'CN01 OA 01',
      habilidad: 'comprender',
      tipo: 'completacion',
      enunciado: 'Los seres vivos nacen, crecen y se ____.',
      respuesta_correcta: 'alimentan',
      retroalimentacion: 'Recuerda las tres características de los seres vivos.',
    },
    {
      oa: 'CN01 OA 01',
      habilidad: 'recordar',
      tipo: 'pictorico',
      enunciado: 'Observa la imagen y marca el ser vivo.',
      imagen: 'Un dibujo con un gato y una piedra.',
      respuesta_correcta: 'El gato.',
      retroalimentacion: 'Identifica cuál puede moverse y alimentarse.',
    },
  ],
  pauta_correccion: 'Revisa cada ítem con la retroalimentación; refuerza las características de los seres vivos.',
  tipo_evaluacion: 'diagnostica',
  perfil_nivel: 'generico',
};

/** Doble de LlmPort: despacha por identidad del schema (mismo objeto que importa el use case). */
function llmDeMuestras(llamadas: string[]): LlmPort {
  // Map<unknown, unknown> evita que el genérico ZodType<T> se estreche a `never` al comparar (ver
  // CascadaAulaUseCase.test.ts): la clave es la identidad del schema, el valor su muestra.
  const porSchema = new Map<unknown, unknown>([[SchemaPrueba, pruebaMuestra]]);
  return {
    async generar(args) {
      llamadas.push(args.tarea);
      if (!porSchema.has(args.schema)) {
        throw new Error(`Sin muestra para el schema (tarea=${args.tarea}).`);
      }
      // Valida la muestra contra el schema real: el test no puede colar una prueba inválida.
      const parsed = args.schema.parse(porSchema.get(args.schema));
      return {
        parsed,
        stopReason: 'end_turn',
        usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        modelo: 'muestras',
      };
    },
  };
}

describe('GenerarPruebaFormativaUseCase (Fase 4, prueba formativa sin API key)', () => {
  it('ensambla una Prueba válida que pasa pedagogicalGate (1º básico → tramo 1-2)', async () => {
    const llamadas: string[] = [];
    const uc = new GenerarPruebaFormativaUseCase(llmDeMuestras(llamadas));

    const prueba = await uc.ejecutar(unidadMuestra('1º básico'));

    // Valida contra el contrato del dominio (no romper backward-compat del schema).
    expect(() => SchemaPrueba.parse(prueba)).not.toThrow();

    // La prueba ensamblada es pedagógicamente coherente (item→tabla, una correcta, ordenar/pareados ok).
    const gate = pedagogicalGate(prueba);
    expect(gate.ok).toBe(true);
    expect(gate.hallazgos).toEqual([]);

    // Campos fijos SOBRESCRITOS con los de la unidad (la IA no los decide).
    expect(prueba.asignatura).toBe('Ciencias Naturales');
    expect(prueba.curso).toBe('1º básico');
    expect(prueba.tipo_evaluacion).toBe('formativa');
    expect(prueba.perfil_nivel).toBe('1-2');
    expect(prueba.perfil_nivel).toBe(tramoDeNivel('1º básico'));

    // Trae los ítems de la IA (anclados al OA de la unidad).
    expect(prueba.items).toHaveLength(6);
    expect(prueba.items.every((it) => it.oa === 'CN01 OA 01')).toBe(true);

    // Una sola llamada al LLM, de redacción.
    expect(llamadas).toEqual(['redaccion']);
  });

  it('fija perfil_nivel por tramo según el nivel (5º básico → tramo 5-6)', async () => {
    const uc = new GenerarPruebaFormativaUseCase(llmDeMuestras([]));

    const prueba = await uc.ejecutar(unidadMuestra('5º básico'));

    expect(prueba.perfil_nivel).toBe('5-6');
    expect(prueba.tipo_evaluacion).toBe('formativa');
  });

  it('rechaza (GeneracionError) una prueba con fuga de razonamiento en un campo de texto', async () => {
    // Reproduce el bug real (prueba_error_generado.docx): la IA volcó su borrador/"pensar en voz alta"
    // dentro del campo 'imagen' del ítem pictórico. Como 'imagen' es z.string() sin cota, la fuga pasa
    // el schema; el guardia anti-fuga del use case debe rechazarla para que el worker reintente.
    const fuga = 'Cuatro tarjetas. ' + 'NOTE: let me write the clean JSON now. '.repeat(300);
    const pruebaConFuga: Prueba = {
      ...pruebaMuestra,
      items: pruebaMuestra.items.map((it) => (it.tipo === 'pictorico' ? { ...it, imagen: fuga } : it)),
    };
    const llm: LlmPort = {
      async generar(args) {
        // La fuga PASA el schema (z.string() no acota largo) → lo prueba el .parse de abajo.
        const parsed = args.schema.parse(pruebaConFuga);
        return {
          parsed,
          stopReason: 'end_turn',
          usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
          modelo: 'muestras',
        };
      },
    };
    const uc = new GenerarPruebaFormativaUseCase(llm);

    await expect(uc.ejecutar(unidadMuestra('1º básico'))).rejects.toThrow(GeneracionError);
  });

  it('ejecutarConMeta expone los metadatos de la llamada (traza_ia)', async () => {
    const uc = new GenerarPruebaFormativaUseCase(llmDeMuestras([]));

    const { valor, meta } = await uc.ejecutarConMeta(unidadMuestra('3º básico'));

    expect(valor.perfil_nivel).toBe('3-4');
    expect(meta.modelo).toBe('muestras');
    expect(meta.stopReason).toBe('end_turn');
    expect(meta.usage).toEqual({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
  });
});
