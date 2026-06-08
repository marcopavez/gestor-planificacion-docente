// Unit del generador híbrido (H-2.3, RF-2.5–2.8) — sin red ni infra (INV-1): fakes locales de
// LlmPort/OaRepository/PlantillaRepository. Verifica que la IA solo redacta proposito/experiencias/
// indicadores y marca checkboxes, mientras los OA quedan VERBATIM del corpus (CA-2.3), y los bloqueos
// de input (OA inexistente CA-2.4, plantilla no configurada).

import { describe, expect, it } from 'vitest';
import type {
  BorradorPlanificacionIa,
  CampoPlantillaType,
  CatalogosPlanificacion,
  FormatoPlantillaType,
  LlmPort,
  ObjetivoAprendizaje,
  OaRepository,
  PayloadPlanificacion,
  PlantillaPlanificacion,
  PlantillaRepository,
} from '@faro/domain';
import { SchemaBorradorPlanificacionIa } from '@faro/domain';
import {
  GenerarPlanificacionUseCase,
  OaInexistenteError,
  PlantillaNoConfiguradaError,
} from '../index.js';

const CORPUS_VERSION = 'corpus@2026.1';

// OA reales (Matemática 1º básico) — descripción VERBATIM del corpus; el use case no debe alterarlas.
const OA_CORPUS: ObjetivoAprendizaje[] = [
  oa('MA01 OA 03', 'Leer números del 0 al 20 y representarlos en forma concreta, pictórica y simbólica.'),
  oa('MA01 OA 04', 'Comparar y ordenar números del 0 al 20 de menor a mayor y/o viceversa, utilizando material concreto.'),
  oa('MA01 OA 06', 'Componer y descomponer números del 0 a 20 de manera aditiva, en forma concreta, pictórica y simbólica.'),
];

function oa(codigo: string, descripcion: string): ObjetivoAprendizaje {
  return {
    id: codigo,
    corpusVersionId: CORPUS_VERSION,
    codigo,
    asignatura: 'Matemática',
    nivel: '1º básico',
    descripcion,
    indicadores: [],
    vigenciaDesde: null,
    vigenciaHasta: null,
  };
}

const oasFake: OaRepository = {
  async porAsignaturaNivel() {
    return OA_CORPUS;
  },
  async porAsignaturaCurso() {
    return OA_CORPUS;
  },
  async porIds(ids) {
    return OA_CORPUS.filter((o) => ids.includes(o.codigo));
  },
};

// Catálogos mínimos (todas las claves que referencian los presets de prueba).
const CATALOGOS: CatalogosPlanificacion = {
  habilidades_siglo_xxi: [{ etiqueta: 'Creatividad' }, { etiqueta: 'Colaboración' }],
  metodologias_activas: [{ etiqueta: 'Gamificación' }, { etiqueta: 'Aprendizaje cooperativo' }],
  estrategias_ensenanza: [{ etiqueta: 'Autoexplicación' }],
  micropracticas: [{ etiqueta: 'Rutinas de pensamiento' }],
  estrategias_eval_formativa: [{ etiqueta: 'Pizarritas' }],
  estrategias_eval_sumativa: [{ etiqueta: 'Disertación' }],
  tipo_aprendizaje: [{ etiqueta: 'Conceptual' }, { etiqueta: 'Procedimental' }, { etiqueta: 'Actitudinal' }],
  tipo_evaluacion: [{ etiqueta: 'Diagnóstica' }, { etiqueta: 'Formativa' }, { etiqueta: 'Sumativa' }],
  instrumentos_evaluacion: [{ etiqueta: 'Rúbrica' }, { etiqueta: 'Lista de cotejo' }],
  recursos_espacios: [{ etiqueta: 'Proyector' }, { etiqueta: 'Patio' }],
  principios_dua: [
    { etiqueta: 'Proveer múltiples medios de Representación' },
    { etiqueta: 'Proveer múltiples medios de Acción y Expresión' },
    { etiqueta: 'Proveer múltiples formas de Implicación' },
  ],
};

function campo(c: Partial<CampoPlantillaType> & Pick<CampoPlantillaType, 'clave' | 'tipo' | 'origen'>): CampoPlantillaType {
  return { etiqueta: c.clave, requerido: false, orden: 0, ...c };
}

function plantillaA(): PlantillaPlanificacion {
  return {
    id: 'test-a',
    formato: 'A',
    nombre: 'Planificación de Unidad',
    establecimiento: 'Colegio Test',
    version: '1',
    secciones: [
      {
        clave: 'encabezado',
        titulo: 'Planificación de Unidad',
        orden: 0,
        campos: [campo({ clave: 'establecimiento', tipo: 'encabezado', origen: 'fijo', requerido: true })],
      },
      {
        clave: 'proposito',
        titulo: 'Propósito',
        orden: 1,
        campos: [campo({ clave: 'proposito', tipo: 'texto_largo', origen: 'ia' })],
      },
      {
        clave: 'habilidades',
        titulo: 'Habilidades S.XXI',
        orden: 2,
        campos: [campo({ clave: 'habilidades_siglo_xxi', tipo: 'checkbox_set', origen: 'ia', catalogo: 'habilidades_siglo_xxi' })],
      },
      {
        clave: 'objetivos_aprendizaje',
        titulo: 'Objetivos de Aprendizaje',
        orden: 3,
        campos: [campo({ clave: 'objetivos_aprendizaje', tipo: 'tabla_oa', origen: 'fijo', requerido: true })],
      },
      {
        clave: 'experiencias',
        titulo: 'Experiencias',
        orden: 4,
        campos: [campo({ clave: 'experiencias', tipo: 'lista', origen: 'ia' })],
      },
      {
        clave: 'evaluacion',
        titulo: 'Evaluación',
        orden: 5,
        campos: [
          campo({ clave: 'tipo_evaluacion', tipo: 'checkbox_set', origen: 'ia', catalogo: 'tipo_evaluacion' }),
          campo({ clave: 'instrumentos_evaluacion', tipo: 'checkbox_set', origen: 'ia', catalogo: 'instrumentos_evaluacion' }),
        ],
      },
    ],
  };
}

function plantillaB(): PlantillaPlanificacion {
  return {
    id: 'test-b',
    formato: 'B',
    nombre: 'Bloque de Actividades',
    establecimiento: 'Colegio Test',
    version: '1',
    secciones: [
      {
        clave: 'encabezado',
        titulo: 'Bloque de Actividades',
        orden: 0,
        campos: [campo({ clave: 'establecimiento', tipo: 'encabezado', origen: 'fijo', requerido: true })],
      },
      {
        clave: 'principios_dua',
        titulo: 'Principios DUA',
        orden: 1,
        campos: [campo({ clave: 'principios_dua', tipo: 'checkbox_set', origen: 'fijo', requerido: true, catalogo: 'principios_dua' })],
      },
      {
        clave: 'objetivos_aprendizaje',
        titulo: 'Objetivos Priorizados',
        orden: 2,
        campos: [campo({ clave: 'objetivos_aprendizaje', tipo: 'tabla_oa', origen: 'fijo', requerido: true })],
      },
    ],
  };
}

function plantillasFake(...ps: PlantillaPlanificacion[]): PlantillaRepository {
  return {
    async activaPara(establecimiento: string, formato: FormatoPlantillaType) {
      return ps.find((p) => p.establecimiento === establecimiento && p.formato === formato) ?? null;
    },
    async porId(id: string) {
      return ps.find((p) => p.id === id) ?? null;
    },
    async listar() {
      return [...ps];
    },
  };
}

// LlmPort fake: valida la respuesta contra el schema real y registra la llamada.
function llmFake(borrador: BorradorPlanificacionIa, llamadas: string[] = []): LlmPort {
  return {
    async generar(args) {
      llamadas.push(args.tarea);
      const parsed = args.schema.parse(SchemaBorradorPlanificacionIa.parse(borrador));
      return { parsed, stopReason: 'end_turn', usage: { input: 1, output: 2, cacheRead: 0, cacheCreation: 0 }, modelo: 'fake-llm' };
    },
  };
}

const borradorBase: BorradorPlanificacionIa = {
  proposito: 'Que las y los estudiantes lean y comparen números hasta el 20 con material concreto.',
  experiencias: ['Cuentan colecciones de hasta 20 objetos.', 'Comparan dos cantidades y deciden cuál es mayor.'],
  indicadores: [
    { oa: 'MA01 OA 03', texto: 'Leen en voz alta números del 0 al 20.' },
    { oa: 'MA01 OA 04', texto: 'Comparan dos cantidades hasta 20.' },
    { oa: 'MA01 OA 06', texto: 'Componen un número hasta 20 con dos sumandos.' },
  ],
  seleccion_checkboxes: {
    habilidades_siglo_xxi: ['Creatividad'],
    tipo_evaluacion: ['Formativa', 'Sumativa'],
    instrumentos_evaluacion: ['Lista de cotejo'],
  },
};

const payloadA: PayloadPlanificacion = {
  establecimiento: 'Colegio Test',
  docente: 'Prof. Demo',
  asignatura: 'Matemática',
  nivel: '1º básico',
  unidad: 'Unidad 1: Números hasta el 20',
  plantilla: 'A',
  oaCodigos: ['MA01 OA 03', 'MA01 OA 04', 'MA01 OA 06'],
  duracion_semanas: 7,
  horas_pedagogicas: 42,
};

describe('GenerarPlanificacionUseCase (híbrido datos+IA, H-2.3)', () => {
  it('CA-2.3: los OA salen VERBATIM del corpus; la IA solo redacta proposito/experiencias/indicadores y marca checkboxes', async () => {
    const llamadas: string[] = [];
    const uc = new GenerarPlanificacionUseCase({
      oas: oasFake,
      plantillas: plantillasFake(plantillaA()),
      llm: llmFake(borradorBase, llamadas),
      catalogos: CATALOGOS,
    });

    const { plan, meta, corpusVersionId } = await uc.ejecutar(payloadA);

    // Los OA del documento son idénticos a los del corpus (código + descripción).
    expect(plan.oa.map((o) => o.codigo)).toEqual(payloadA.oaCodigos);
    for (const ref of plan.oa) {
      const fuente = OA_CORPUS.find((o) => o.codigo === ref.codigo);
      expect(ref.descripcion).toBe(fuente?.descripcion); // VERBATIM, sin redacción de IA
      expect(ref.categoria).toBe('basal'); // Formato A → basal por defecto
    }
    // La IA redactó el contenido pedagógico.
    expect(plan.proposito).toBe(borradorBase.proposito);
    expect(plan.experiencias).toEqual(borradorBase.experiencias);
    // Todos los indicadores nacen como borrador de IA (RF-2.7).
    expect(plan.indicadores_evaluacion.every((i) => i.fuente === 'ia_borrador')).toBe(true);
    expect(plan.indicadores_evaluacion.map((i) => i.oa)).toEqual(['MA01 OA 03', 'MA01 OA 04', 'MA01 OA 06']);
    // Las selecciones de checkbox van a extras VERBATIM; tipo/instrumentos se derivan a evaluacion.
    expect(plan.extras['habilidades_siglo_xxi']).toEqual(['Creatividad']);
    expect(plan.evaluacion.tipo).toEqual(['formativa', 'sumativa']);
    expect(plan.evaluacion.instrumentos).toEqual(['Lista de cotejo']);
    // Traza: una sola llamada de redacción + metadatos para la traza_ia.
    expect(llamadas).toEqual(['redaccion']);
    expect(meta.modelo).toBe('fake-llm');
    expect(meta.camposGenerados).toContain('proposito');
    expect(meta.camposGenerados).toContain('habilidades_siglo_xxi');
    expect(corpusVersionId).toBe(CORPUS_VERSION);
  });

  it('cubre cada OA basal con ≥1 indicador (insumo del gate de cobertura)', async () => {
    const uc = new GenerarPlanificacionUseCase({
      oas: oasFake,
      plantillas: plantillasFake(plantillaA()),
      llm: llmFake(borradorBase),
      catalogos: CATALOGOS,
    });
    const { plan } = await uc.ejecutar(payloadA);
    for (const ref of plan.oa) {
      expect(plan.indicadores_evaluacion.some((i) => i.oa === ref.codigo)).toBe(true);
    }
  });

  it('Formato B: OA quedan como priorizado y los Principios DUA (fijo) se llenan con todo el catálogo', async () => {
    const uc = new GenerarPlanificacionUseCase({
      oas: oasFake,
      plantillas: plantillasFake(plantillaB()),
      llm: llmFake({ ...borradorBase, seleccion_checkboxes: {} }),
      catalogos: CATALOGOS,
    });
    const { plan } = await uc.ejecutar({ ...payloadA, plantilla: 'B', periodo: '1er semestre' });
    expect(plan.oa.every((o) => o.categoria === 'priorizado')).toBe(true);
    expect(plan.extras['principios_dua']).toHaveLength(3); // los 3 principios, datos fijos
    expect(plan.periodo).toBe('1er semestre');
  });

  it('CA-2.4: un OA inexistente en el corpus bloquea con error claro (sin llamar a la IA)', async () => {
    const llamadas: string[] = [];
    const uc = new GenerarPlanificacionUseCase({
      oas: oasFake,
      plantillas: plantillasFake(plantillaA()),
      llm: llmFake(borradorBase, llamadas),
      catalogos: CATALOGOS,
    });
    await expect(
      uc.ejecutar({ ...payloadA, oaCodigos: ['MA01 OA 03', 'MA01 OA 99'] }),
    ).rejects.toBeInstanceOf(OaInexistenteError);
    expect(llamadas).toEqual([]); // no se gasta la IA en input inválido
  });

  it('bloquea si no hay plantilla activa configurada para (establecimiento, formato)', async () => {
    const uc = new GenerarPlanificacionUseCase({
      oas: oasFake,
      plantillas: plantillasFake(), // ninguna configurada
      llm: llmFake(borradorBase),
      catalogos: CATALOGOS,
    });
    await expect(uc.ejecutar(payloadA)).rejects.toBeInstanceOf(PlantillaNoConfiguradaError);
  });
});
