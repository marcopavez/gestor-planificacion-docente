// e2e de la cascada sin red ni API key (INV-6): un doble de LlmPort sirve muestras por schema.
// Contexto NO-Matemática (Tecnología 2º básico) para probar que la cascada es materia-agnóstica.

import type { LlmPort } from '@faro/domain';
import {
  ReglaDominioError,
  SchemaClaseDeck,
  SchemaPlanificacionClase,
  SchemaPlanificacionUnidad,
  SchemaPrueba,
} from '@faro/domain';
import { describe, expect, it } from 'vitest';
import { CascadaAulaUseCase } from './CascadaAulaUseCase.js';
import type { ContextoCascada } from './tipos.js';

const ctx: ContextoCascada = {
  establecimiento: 'Colegio Demo',
  asignatura: 'Tecnología',
  nivel: '2º básico',
  unidadTitulo: 'Unidad 1: Objetos tecnológicos de mi entorno',
  corpusVersionId: 'demo-tecnologia-2b@1',
  oaSeleccionados: [
    { codigo: 'TE02 OA 01', categoria: 'basal', descripcion: 'Crear diseños de objetos tecnológicos.' },
    { codigo: 'TE02 OA 03', categoria: 'basal', descripcion: 'Elaborar un objeto tecnológico para resolver una necesidad.' },
  ],
};

const unidadMuestra = {
  establecimiento: 'Colegio Demo',
  asignatura: 'Tecnología',
  nivel: '2º básico',
  unidad: 'Unidad 1: Objetos tecnológicos de mi entorno',
  proposito: 'Explorar objetos tecnológicos cotidianos y diseñar soluciones simples.',
  duracion_semanas: 5,
  horas_pedagogicas: 10,
  oa: [
    { codigo: 'TE02 OA 01', categoria: 'basal', descripcion: 'Crear diseños de objetos tecnológicos.' },
    { codigo: 'TE02 OA 03', categoria: 'basal', descripcion: 'Elaborar un objeto tecnológico para resolver una necesidad.' },
  ],
  habilidades: ['Crear', 'Comunicar'],
  indicadores_evaluacion: [
    { oa: 'TE02 OA 01', texto: 'Dibujan un objeto que resuelve una necesidad.', fuente: 'ia_borrador' },
    { oa: 'TE02 OA 03', texto: 'Elaboran un objeto tecnológico simple.', fuente: 'ia_borrador' },
  ],
  contenidos: { conceptuales: ['Objetos tecnológicos'], procedimentales: ['Dibujo de diseño'], actitudinales: ['Trabajo en equipo'] },
  actividades: ['Identifican objetos tecnológicos de la sala.'],
  instrumentos_evaluacion: ['Lista de cotejo'],
  tipo_evaluacion: ['diagnostica', 'formativa', 'sumativa'],
  extras: {},
};

const claseMuestra = {
  unidad_ref: 'Unidad 1: Objetos tecnológicos de mi entorno',
  clases: [
    {
      numero: 1,
      oa: ['TE02 OA 01'],
      objetivo_clase: 'Identificar objetos tecnológicos del entorno.',
      inicio: 'Observación de objetos de la sala.',
      desarrollo: 'Clasificación de objetos tecnológicos en grupos.',
      cierre: 'Puesta en común y registro.',
      recursos: ['Imágenes', 'Cuaderno'],
      evaluacion_formativa: 'Lista de cotejo.',
      indicadores: ['Identifican objetos tecnológicos.'],
      duracion_min: 45,
    },
  ],
};

const pruebaMuestra = {
  asignatura: 'Tecnología',
  curso: '2º básico',
  perfil_nivel: '2B',
  tabla_especificaciones: [{ oa: 'TE02 OA 01', n_items: 1, puntaje: 2 }],
  items: [
    {
      oa: 'TE02 OA 01',
      habilidad: 'comprender',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuál es un objeto tecnológico?',
      alternativas: [
        { texto: 'Una piedra', correcta: false },
        { texto: 'Un lápiz', correcta: true },
      ],
      puntaje: 2,
    },
  ],
  pauta_correccion: 'Cada ítem vale 2 puntos.',
  alineada_reglamento: false,
  version_nee_dua: false,
};

const deckMuestra = {
  titulo: 'Clase 1 · Objetos tecnológicos de mi entorno',
  asignatura: 'Tecnología',
  nivel: '2º básico',
  oa: ['TE02 OA 01'],
  slides: [
    { momento: 'inicio', titulo: '¿Qué es tecnología?', contenido: ['Observemos objetos de la sala.'], notas_docente: 'Activar conocimientos previos.' },
    { momento: 'desarrollo', titulo: 'Objetos que nos ayudan', contenido: ['Clasifiquemos objetos.'], notas_docente: 'Trabajo en grupos.' },
    { momento: 'cierre', titulo: 'Lo que aprendimos', contenido: ['Compartimos ejemplos.'], notas_docente: 'Cierre metacognitivo.' },
  ],
};

/** Doble de LlmPort: despacha por identidad de schema (mismo objeto que importan los use cases). */
function llmDeMuestras(llamadas: string[]): LlmPort {
  const porSchema = new Map<unknown, unknown>([
    [SchemaPlanificacionUnidad, unidadMuestra],
    [SchemaPlanificacionClase, claseMuestra],
    [SchemaPrueba, pruebaMuestra],
    [SchemaClaseDeck, deckMuestra],
  ]);
  return {
    async generar(args) {
      llamadas.push(args.tarea);
      if (!porSchema.has(args.schema)) {
        throw new Error(`Sin muestra para el schema (tarea=${args.tarea}).`);
      }
      // Valida la muestra contra el schema real: un test no puede colar datos inválidos.
      const parsed = args.schema.parse(porSchema.get(args.schema));
      return { parsed, stopReason: 'end_turn', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, modelo: 'muestras' };
    },
  };
}

describe('CascadaAulaUseCase (RF-2.5–2.8, e2e sin API key)', () => {
  it('genera los 4 artefactos para cualquier materia (Tecnología 2º básico)', async () => {
    const llamadas: string[] = [];
    const cascada = new CascadaAulaUseCase(llmDeMuestras(llamadas));

    const r = await cascada.ejecutar(ctx);

    // Materia-agnóstico: el resultado refleja el contexto, no Matemática.
    expect(r.unidad.asignatura).toBe('Tecnología');
    expect(r.unidad.nivel).toBe('2º básico');
    expect(r.clase.clases.length).toBeGreaterThanOrEqual(1);
    expect(r.prueba.perfil_nivel).toBe('2B');
    expect(r.deck.slides).toHaveLength(3);
    // 4 llamadas al LLM (unidad, clase, prueba, deck), todas de redacción.
    expect(llamadas).toEqual(['redaccion', 'redaccion', 'redaccion', 'redaccion']);
    // Los gates deterministas corren sobre los artefactos y no bloquean este caso válido.
    expect(r.gates.ok).toBe(true);
  });

  it('bloquea si no hay OA en el contexto (ReglaDominioError)', async () => {
    const cascada = new CascadaAulaUseCase(llmDeMuestras([]));
    await expect(cascada.ejecutar({ ...ctx, oaSeleccionados: [] })).rejects.toBeInstanceOf(ReglaDominioError);
  });
});
