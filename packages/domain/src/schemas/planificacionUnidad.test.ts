// Schema superset A+B de la Planificación de Unidad (spec 02-planificacion §4.2, RF-2.4).
import { describe, expect, it } from 'vitest';
import { SchemaCatalogosPlanificacion } from './catalogosPlanificacion.js';
import { SchemaPlanificacionUnidad } from './planificacionUnidad.js';

// Formato A (denso): encabezado completo + OA basal/complementario/transversal + evaluacion + extras.
const formatoA = {
  plantilla: 'A',
  establecimiento: 'Escuela Demo',
  asignatura: 'Matemática',
  nivel: '1º básico',
  unidad: 'Unidad 1',
  proposito: 'Explorar números hasta el 20.',
  duracion_semanas: 7,
  horas_pedagogicas: 42,
  oa: [
    { codigo: 'MA01 OA 03', categoria: 'basal', descripcion: 'Leer números del 0 al 20.', habilidades: ['Representar'] },
    { codigo: 'OAT 9', categoria: 'transversal', descripcion: 'Resolver problemas reflexivamente.' },
  ],
  experiencias: ['Cuentan colecciones de hasta 20 objetos.'],
  indicadores_evaluacion: [{ oa: 'MA01 OA 03', texto: 'Leen números del 0 al 20.', fuente: 'ia_borrador' }],
  evaluacion: { tipo: ['diagnostica', 'formativa', 'sumativa'], instrumentos: ['Lista de cotejo'] },
  extras: { habilidades_siglo_xxi: ['Creatividad'] },
};

// Formato B (DUA): encabezado con periodo + OA priorizado + evaluacion mínima; sin campos de A.
const formatoB = {
  plantilla: 'B',
  establecimiento: 'Escuela Demo',
  asignatura: 'Lenguaje y Comunicación',
  nivel: '3º básico',
  unidad: 'Unidad 1',
  periodo: 'Abril - Mayo',
  oa: [{ codigo: 'LE03 OA 01', categoria: 'priorizado', descripcion: 'Leer en voz alta de manera fluida.', habilidades: ['Comprender'] }],
  experiencias: ['Leen un párrafo breve en voz alta respetando la puntuación.'],
  indicadores_evaluacion: [],
  evaluacion: { tipo: ['formativa'], instrumentos: [] },
  extras: {},
};

describe('SchemaPlanificacionUnidad (superset A+B — RF-2.4)', () => {
  it('valida una planificación Formato A', () => {
    const r = SchemaPlanificacionUnidad.safeParse(formatoA);
    expect(r.success).toBe(true);
  });

  it('valida una planificación Formato B (DUA, OA priorizado, sin campos de A)', () => {
    const r = SchemaPlanificacionUnidad.safeParse(formatoB);
    expect(r.success).toBe(true);
  });

  it('aplica defaults: habilidades por OA, experiencias, evaluacion.tipo/instrumentos, extras', () => {
    const minimo = {
      plantilla: 'B',
      establecimiento: 'E',
      asignatura: 'A',
      nivel: '1º básico',
      unidad: 'U',
      oa: [{ codigo: 'MA01 OA 01', categoria: 'priorizado', descripcion: 'd' }],
      evaluacion: {},
    };
    const r = SchemaPlanificacionUnidad.parse(minimo);
    expect(r.oa[0]?.habilidades).toEqual([]);
    expect(r.experiencias).toEqual([]);
    expect(r.indicadores_evaluacion).toEqual([]);
    expect(r.evaluacion).toEqual({ tipo: [], instrumentos: [] });
    expect(r.extras).toEqual({});
  });

  it('exige plantilla (A|B)', () => {
    const { plantilla: _omit, ...sinPlantilla } = formatoA;
    expect(SchemaPlanificacionUnidad.safeParse(sinPlantilla).success).toBe(false);
    expect(SchemaPlanificacionUnidad.safeParse({ ...formatoA, plantilla: 'C' }).success).toBe(false);
  });

  it('rechaza una categoría de OA fuera del enum', () => {
    const malo = { ...formatoA, oa: [{ codigo: 'X', categoria: 'opcional', descripcion: 'd' }] };
    expect(SchemaPlanificacionUnidad.safeParse(malo).success).toBe(false);
  });

  it('rechaza una fuente de indicador fuera de {oficial, ia_borrador}', () => {
    const malo = { ...formatoA, indicadores_evaluacion: [{ oa: 'MA01 OA 03', texto: 't', fuente: 'programa_estudio' }] };
    expect(SchemaPlanificacionUnidad.safeParse(malo).success).toBe(false);
  });
});

describe('SchemaCatalogosPlanificacion (RF-2.6)', () => {
  it('valida un set de catálogos con opción abierta', () => {
    const catalogos = {
      habilidades_siglo_xxi: [{ etiqueta: 'Creatividad' }],
      metodologias_activas: [{ etiqueta: 'Gamificación' }],
      estrategias_ensenanza: [{ etiqueta: 'Participación de los estudiantes.' }],
      micropracticas: [{ etiqueta: 'Preguntas poderosas' }],
      estrategias_eval_formativa: [{ etiqueta: 'Pizarritas' }],
      estrategias_eval_sumativa: [{ etiqueta: 'Otro', abierto: true }],
      tipo_aprendizaje: [{ etiqueta: 'Conceptual' }],
      tipo_evaluacion: [{ etiqueta: 'Formativa' }],
      instrumentos_evaluacion: [{ etiqueta: 'Rúbrica' }],
      recursos_espacios: [{ etiqueta: 'Proyector' }],
      principios_dua: [{ etiqueta: 'Proveer múltiples medios de Representación' }],
    };
    expect(SchemaCatalogosPlanificacion.safeParse(catalogos).success).toBe(true);
  });

  it('rechaza un catálogo vacío (set cerrado debe tener ≥1 opción)', () => {
    const incompleto = { habilidades_siglo_xxi: [] };
    expect(SchemaCatalogosPlanificacion.safeParse(incompleto).success).toBe(false);
  });
});
