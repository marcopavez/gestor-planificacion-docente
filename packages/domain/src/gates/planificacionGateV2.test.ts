// Unit del gate v2 (H-2.4, RF-2.12, INV-1) — determinista, sin red. Verifica los 3 bloqueos
// (requerido ausente, OA inexistente, cobertura) y la advertencia (checkbox fuera de catálogo).

import { describe, expect, it } from 'vitest';
import type {
  CampoPlantillaType,
  CatalogosPlanificacion,
  PlanificacionUnidad,
  PlantillaPlanificacion,
} from '../index.js';
import { planificacionGateV2 } from '../index.js';

function catalogosFull(): CatalogosPlanificacion {
  const uno = [{ etiqueta: 'opcion' }];
  return {
    habilidades_siglo_xxi: [{ etiqueta: 'Creatividad' }, { etiqueta: 'Colaboración' }],
    metodologias_activas: uno,
    estrategias_ensenanza: uno,
    micropracticas: uno,
    estrategias_eval_formativa: uno,
    estrategias_eval_sumativa: uno,
    tipo_aprendizaje: uno,
    tipo_evaluacion: uno,
    instrumentos_evaluacion: uno,
    recursos_espacios: uno,
    principios_dua: uno,
  };
}

function campo(c: Partial<CampoPlantillaType> & Pick<CampoPlantillaType, 'clave' | 'tipo'>): CampoPlantillaType {
  return { etiqueta: c.clave, requerido: false, origen: 'fijo', orden: 0, ...c };
}

function plantilla(): PlantillaPlanificacion {
  return {
    id: 'p',
    formato: 'A',
    nombre: 'P',
    establecimiento: 'Colegio Test',
    version: '1',
    secciones: [
      { clave: 's0', titulo: 'Encabezado', orden: 0, campos: [campo({ clave: 'establecimiento', tipo: 'encabezado', requerido: true })] },
      { clave: 's1', titulo: 'Habilidades', orden: 1, campos: [campo({ clave: 'habilidades_siglo_xxi', tipo: 'checkbox_set', origen: 'ia', catalogo: 'habilidades_siglo_xxi' })] },
      { clave: 's2', titulo: 'OA', orden: 2, campos: [campo({ clave: 'objetivos_aprendizaje', tipo: 'tabla_oa', requerido: true })] },
      { clave: 's3', titulo: 'Experiencias', orden: 3, campos: [campo({ clave: 'experiencias', tipo: 'lista', origen: 'ia' })] },
    ],
  };
}

function plan(over: Partial<PlanificacionUnidad> = {}): PlanificacionUnidad {
  return {
    plantilla: 'A',
    establecimiento: 'Colegio Test',
    asignatura: 'Matemática',
    nivel: '1º básico',
    unidad: 'Unidad 1',
    oa: [{ codigo: 'MA01 OA 03', categoria: 'basal', descripcion: 'Leer números hasta el 20.', habilidades: [] }],
    experiencias: ['Cuentan colecciones de objetos.'],
    indicadores_evaluacion: [{ oa: 'MA01 OA 03', texto: 'Leen números del 0 al 20.', fuente: 'ia_borrador' }],
    evaluacion: { tipo: [], instrumentos: [] },
    extras: { habilidades_siglo_xxi: ['Creatividad'] },
    ...over,
  };
}

const CORPUS = ['MA01 OA 03', 'MA01 OA 04'];

describe('planificacionGateV2 (H-2.4)', () => {
  it('un plan completo y consistente pasa sin hallazgos', () => {
    const r = planificacionGateV2({ plan: plan(), plantilla: plantilla(), oaCodigosCorpus: CORPUS, catalogos: catalogosFull() });
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toHaveLength(0);
  });

  it('(a) bloquea si falta un campo requerido de la plantilla', () => {
    // establecimiento vacío → el campo requerido 'establecimiento' no tiene contenido.
    const r = planificacionGateV2({ plan: plan({ establecimiento: '' }), plantilla: plantilla(), oaCodigosCorpus: CORPUS, catalogos: catalogosFull() });
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'campo_requerido' && h.ref === 'establecimiento')).toBe(true);
  });

  it('(b) bloquea si un OA referenciado no existe en el corpus (CA-2.4)', () => {
    const r = planificacionGateV2({
      plan: plan({ oa: [{ codigo: 'MA01 OA 99', categoria: 'basal', descripcion: 'inexistente', habilidades: [] }] }),
      plantilla: plantilla(),
      oaCodigosCorpus: CORPUS,
      catalogos: catalogosFull(),
    });
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'oa_inexistente' && h.ref === 'MA01 OA 99')).toBe(true);
  });

  it('(c) bloquea si un OA basal no tiene indicador, o si no hay experiencias', () => {
    const sinIndicador = planificacionGateV2({ plan: plan({ indicadores_evaluacion: [] }), plantilla: plantilla(), oaCodigosCorpus: CORPUS, catalogos: catalogosFull() });
    expect(sinIndicador.ok).toBe(false);
    expect(sinIndicador.hallazgos.some((h) => h.regla === 'oa_sin_indicador' && h.ref === 'MA01 OA 03')).toBe(true);

    const sinExperiencias = planificacionGateV2({ plan: plan({ experiencias: [] }), plantilla: plantilla(), oaCodigosCorpus: CORPUS, catalogos: catalogosFull() });
    expect(sinExperiencias.ok).toBe(false);
    expect(sinExperiencias.hallazgos.some((h) => h.regla === 'sin_experiencias')).toBe(true);
  });

  it('(d) MARCA (no bloquea) una selección de checkbox fuera del catálogo', () => {
    const r = planificacionGateV2({
      plan: plan({ extras: { habilidades_siglo_xxi: ['Creatividad', 'Telepatía'] } }),
      plantilla: plantilla(),
      oaCodigosCorpus: CORPUS,
      catalogos: catalogosFull(),
    });
    // Advisory: ok se mantiene true; el hallazgo es 'marca'.
    expect(r.ok).toBe(true);
    const fuera = r.hallazgos.find((h) => h.regla === 'checkbox_fuera_catalogo');
    expect(fuera?.severidad).toBe('marca');
    expect(fuera?.ref).toBe('habilidades_siglo_xxi:Telepatía');
  });
});
