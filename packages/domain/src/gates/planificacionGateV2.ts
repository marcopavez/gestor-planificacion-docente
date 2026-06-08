// packages/domain/src/gates/planificacionGateV2.ts
// H-2.4 · Validaciones deterministas de la Planificación de Unidad híbrida (spec 02-planificacion
// RF-2.12, INV-1). SIN normativa, sin red: solo schema + corpus + plantilla. Un gate nunca lanza:
// devuelve hallazgos clasificados ('bloquea' impide aprobar; 'marca' es advertencia para el HIL).
//
// Bloquea:
//  (a) un campo `requerido` de la plantilla activa está ausente/vacío,
//  (b) un OA referenciado no existe en (asignatura, nivel)/corpus_version,
//  (c) un OA basal/priorizado no tiene cobertura (ningún indicador; o el plan no tiene experiencias).
// Marca (advisory, no bloquea):
//  (d) una selección de checkbox que no pertenece al catálogo del campo.

import type { CatalogosPlanificacion, ClaveCatalogo } from '../schemas/catalogosPlanificacion.js';
import type { PlanificacionUnidad } from '../schemas/planificacionUnidad.js';
import type { PlantillaPlanificacion } from '../schemas/plantilla.js';
import { campoTieneContenido, seleccionCheckbox } from '../planificacion/proyeccion.js';
import { construirResultado, type Hallazgo, type ResultadoGate } from './tipos.js';

const GATE = 'planificacion_v2';

export interface EntradaPlanificacionGateV2 {
  readonly plan: PlanificacionUnidad;
  /** Plantilla activa del colegio: gobierna qué campos son `requerido` y qué catálogo usa cada checkbox. */
  readonly plantilla: PlantillaPlanificacion;
  /** Todos los códigos de OA disponibles en (asignatura, nivel) — la verdad del corpus (INV-4). */
  readonly oaCodigosCorpus: readonly string[];
  /** Catálogos de referencia para marcar selecciones fuera de catálogo (advisory). */
  readonly catalogos: CatalogosPlanificacion;
}

/** Categorías de OA que exigen cobertura (clase/indicador). Formato A: basal; Formato B: priorizado. */
const CATEGORIAS_NUCLEO = new Set(['basal', 'priorizado']);

export function planificacionGateV2(e: EntradaPlanificacionGateV2): ResultadoGate {
  const h: Hallazgo[] = [];

  // (a) Campos `requerido` de la plantilla activa presentes (RF-2.8/2.12).
  for (const seccion of e.plantilla.secciones) {
    for (const campo of seccion.campos) {
      if (campo.requerido && !campoTieneContenido(e.plan, campo)) {
        h.push({
          gate: GATE,
          regla: 'campo_requerido',
          severidad: 'bloquea',
          mensaje: `El campo requerido '${campo.etiqueta}' (${campo.clave}) de la plantilla está vacío.`,
          ref: campo.clave,
        });
      }
    }
  }

  // (b) Cada OA del documento existe en el corpus para (asignatura, nivel) — CA-2.4.
  const codigosCorpus = new Set(e.oaCodigosCorpus);
  for (const oa of e.plan.oa) {
    if (!codigosCorpus.has(oa.codigo)) {
      h.push({
        gate: GATE,
        regla: 'oa_inexistente',
        severidad: 'bloquea',
        mensaje: `El OA ${oa.codigo} no existe en el corpus de la asignatura/nivel.`,
        ref: oa.codigo,
      });
    }
  }

  // (c) Cobertura de los OA núcleo (basal/priorizado).
  const oaNucleo = e.plan.oa.filter((o) => CATEGORIAS_NUCLEO.has(o.categoria));
  if (oaNucleo.length > 0 && e.plan.experiencias.length === 0) {
    h.push({
      gate: GATE,
      regla: 'sin_experiencias',
      severidad: 'bloquea',
      mensaje: 'La planificación no tiene ninguna experiencia de aprendizaje para sus OA basales.',
    });
  }
  const oaConIndicador = new Set(e.plan.indicadores_evaluacion.map((i) => i.oa));
  for (const oa of oaNucleo) {
    if (!oaConIndicador.has(oa.codigo)) {
      h.push({
        gate: GATE,
        regla: 'oa_sin_indicador',
        severidad: 'bloquea',
        mensaje: `El OA ${oa.codigo} no tiene ningún indicador de evaluación que tribute a él.`,
        ref: oa.codigo,
      });
    }
  }

  // (d) Selecciones de checkbox fuera del catálogo del campo: advertencia (no bloquea) — la IA pudo
  //     proponer una etiqueta inexistente; el docente la corrige en la revisión.
  for (const seccion of e.plantilla.secciones) {
    for (const campo of seccion.campos) {
      if (campo.tipo !== 'checkbox_set' || campo.catalogo === undefined) continue;
      const validas = new Set(e.catalogos[campo.catalogo as ClaveCatalogo].map((o) => o.etiqueta));
      for (const etiqueta of seleccionCheckbox(e.plan, campo)) {
        if (!validas.has(etiqueta)) {
          h.push({
            gate: GATE,
            regla: 'checkbox_fuera_catalogo',
            severidad: 'marca',
            mensaje: `La opción '${etiqueta}' marcada en '${campo.etiqueta}' no pertenece a su catálogo.`,
            ref: `${campo.clave}:${etiqueta}`,
          });
        }
      }
    }
  }

  return construirResultado(h);
}
