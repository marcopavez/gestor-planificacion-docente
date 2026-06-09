// packages/application/src/aula/cascada/encabezadoPrueba.ts
// Builder PURO del encabezado institucional de la prueba (Fase 4). Compone lo FIJO (config del colegio,
// que aporta el caller) con lo DINÁMICO (de la unidad: docente, título, OA con su texto). Vive en
// application porque es ensamblaje, no contenido de IA: el EncabezadoPrueba se pasa al exportar
// (decisión del dueño 2026-06-09 "config pasada al exportar", sin corpus). Puro y testeable (INV-1).

import type { EncabezadoPrueba, PlanificacionUnidad } from '@faro/domain';
import { SchemaEncabezadoPrueba } from '@faro/domain';

/** Lo FIJO del establecimiento que aporta el caller (no sale de la unidad ni de la IA). */
export interface DatosInstitucionales {
  nombreColegio: string;
  comuna: string;
  escudo?: string;
  docente?: string;
  porcentajeExigencia?: number;
}

/**
 * Compone el EncabezadoPrueba a partir de los datos institucionales (caller) y la unidad: título =
 * "Prueba de <asignatura>"; las filas OA = los OA basales de la unidad con su texto verbatim (los que la
 * prueba evalúa). El docente cae al de la unidad si el caller no lo especifica. Si ningún OA es basal,
 * deja oa: [] (no inventa). Devuelve validado contra el contrato del dominio.
 */
export function construirEncabezadoPrueba(
  unidad: PlanificacionUnidad,
  inst: DatosInstitucionales,
): EncabezadoPrueba {
  // El docente del caller manda; si no lo da, el de la unidad (puede no haber ninguno).
  const docente = inst.docente ?? unidad.docente;

  // exactOptionalPropertyTypes: las props opcionales se añaden por spread condicional (nunca prop: undefined).
  const encabezado: EncabezadoPrueba = {
    nombreColegio: inst.nombreColegio,
    comuna: inst.comuna,
    ...(inst.escudo !== undefined ? { escudo: inst.escudo } : {}),
    ...(inst.porcentajeExigencia !== undefined ? { porcentajeExigencia: inst.porcentajeExigencia } : {}),
    ...(docente !== undefined ? { docente } : {}),
    titulo: `Prueba de ${unidad.asignatura}`,
    oa: unidad.oa
      .filter((o) => o.categoria === 'basal')
      .map((o) => ({ codigo: o.codigo, descripcion: o.descripcion })),
  };

  return SchemaEncabezadoPrueba.parse(encabezado);
}
