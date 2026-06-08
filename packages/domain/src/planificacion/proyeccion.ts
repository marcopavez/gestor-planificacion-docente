// packages/domain/src/planificacion/proyeccion.ts
// Proyección data-driven: resuelve el VALOR de un campo de plantilla desde la PlanificacionUnidad.
// Es la fuente única del mapeo plantilla→plan, compartida por el gate v2 (domain) y el export
// (infra-export) para que validación y render no se desincronicen. TS puro, sin I/O (INV-1).

import type { CampoPlantillaType } from '../schemas/plantilla.js';
import type { OaReferenciadoType, PlanificacionUnidad } from '../schemas/planificacionUnidad.js';

/**
 * Valor escalar de un campo (encabezado/texto/numero/fecha) por su `clave`. Los campos del núcleo
 * mapean a propiedades tipadas del plan; el resto cae a `extras` (campos propios de la plantilla).
 * `curso` mapea a `nivel` (la plantilla rotula "Curso", el schema lo llama "nivel").
 */
export function valorEscalarCampo(
  plan: PlanificacionUnidad,
  clave: string,
): string | number | undefined {
  switch (clave) {
    case 'establecimiento':
      return plan.establecimiento;
    case 'docente':
      return plan.docente;
    case 'curso':
      return plan.nivel;
    case 'asignatura':
      return plan.asignatura;
    case 'unidad':
      return plan.unidad;
    case 'periodo':
      return plan.periodo;
    case 'proposito':
      return plan.proposito;
    case 'duracion_semanas':
      return plan.duracion_semanas;
    case 'horas_pedagogicas':
      return plan.horas_pedagogicas;
    default: {
      const v = plan.extras[clave];
      return typeof v === 'string' || typeof v === 'number' ? v : undefined;
    }
  }
}

/** Etiquetas marcadas de un campo `checkbox_set` (VERBATIM como las eligió la IA o el preset). */
export function seleccionCheckbox(plan: PlanificacionUnidad, campo: CampoPlantillaType): string[] {
  const v = plan.extras[campo.clave];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Ítems de un campo `lista` (experiencias / indicadores / lista propia de la plantilla). */
export function listaCampo(plan: PlanificacionUnidad, campo: CampoPlantillaType): string[] {
  if (campo.clave === 'experiencias') return plan.experiencias;
  if (campo.clave === 'indicadores') return plan.indicadores_evaluacion.map((i) => i.texto);
  const v = plan.extras[campo.clave];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Los OA del campo `tabla_oa` (siempre `plan.oa`, datos fijos del corpus). */
export function oaCampo(plan: PlanificacionUnidad): readonly OaReferenciadoType[] {
  return plan.oa;
}

/** ¿El campo tiene contenido no vacío? Type-aware: lo usa el gate v2 para `requerido` (RF-2.12). */
export function campoTieneContenido(plan: PlanificacionUnidad, campo: CampoPlantillaType): boolean {
  switch (campo.tipo) {
    case 'tabla_oa':
      return plan.oa.length > 0;
    case 'checkbox_set':
      return seleccionCheckbox(plan, campo).length > 0;
    case 'lista':
      return listaCampo(plan, campo).length > 0;
    case 'numero': {
      const v = valorEscalarCampo(plan, campo.clave);
      return typeof v === 'number';
    }
    default: {
      const v = valorEscalarCampo(plan, campo.clave);
      return typeof v === 'string' && v.trim().length > 0;
    }
  }
}
