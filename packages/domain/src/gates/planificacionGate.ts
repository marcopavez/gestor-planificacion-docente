// packages/domain/src/gates/planificacionGate.ts
// RF-2.11: coherencia determinista de la planificación (unidad + clases). Spec 02-aula-cascada §4.6.

import type { PlanificacionClase } from '../schemas/planificacionClase.js';
import type { PlanificacionUnidad } from '../schemas/planificacionUnidad.js';
import { construirResultado, type Hallazgo, type ResultadoGate } from './tipos.js';

// 1 hora pedagógica = 45 min (norma escolar chilena).
const MIN_POR_HORA_PEDAGOGICA = 45;

export function planificacionGate(unidad: PlanificacionUnidad, clase: PlanificacionClase): ResultadoGate {
  const h: Hallazgo[] = [];
  const codigosUnidad = new Set(unidad.oa.map((o) => o.codigo));

  // Cada indicador tributa a un OA presente en la unidad.
  for (const ind of unidad.indicadores_evaluacion) {
    if (!codigosUnidad.has(ind.oa)) {
      h.push({
        gate: 'planificacion',
        regla: 'indicador_tributa_oa',
        severidad: 'bloquea',
        mensaje: `Un indicador tributa a ${ind.oa}, que no está entre los OA de la unidad.`,
        ref: ind.oa,
      });
    }
  }

  // Cada OA basal queda cubierto por ≥1 clase o ≥1 indicador.
  const oaEnClases = new Set(clase.clases.flatMap((c) => c.oa));
  const oaEnIndicadores = new Set(unidad.indicadores_evaluacion.map((i) => i.oa));
  for (const oa of unidad.oa) {
    if (oa.categoria !== 'basal') continue;
    if (!oaEnClases.has(oa.codigo) && !oaEnIndicadores.has(oa.codigo)) {
      h.push({
        gate: 'planificacion',
        regla: 'oa_basal_cubierto',
        severidad: 'bloquea',
        mensaje: `El OA basal ${oa.codigo} no está cubierto por ninguna clase ni indicador.`,
        ref: oa.codigo,
      });
    }
  }

  // Coherencia de duración: advisory (los planes de clase suelen ser iterativos/parciales).
  const minClases = clase.clases.reduce((s, c) => s + c.duracion_min, 0);
  const minUnidad = unidad.horas_pedagogicas * MIN_POR_HORA_PEDAGOGICA;
  if (minUnidad > 0) {
    const pct = Math.round((minClases / minUnidad) * 100);
    if (pct < 90 || pct > 110) {
      h.push({
        gate: 'planificacion',
        regla: 'duracion_coherente',
        severidad: 'marca',
        mensaje: `Las clases planificadas suman ${minClases} min de ~${minUnidad} min de la unidad (${pct}% cubierto).`,
      });
    }
  }

  return construirResultado(h);
}
