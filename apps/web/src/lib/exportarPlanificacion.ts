// apps/web/src/lib/exportarPlanificacion.ts
// Carga común para las descargas .docx/.pdf de una planificación: resuelve el documento, valida que
// su contenido sea una PlanificacionUnidad y resuelve la plantilla activa + catálogos. Devuelve un
// resultado discriminado para que cada route handler mapee a su código de estado sin duplicar lógica.

import {
  SchemaPlanificacionUnidad,
  type CatalogosPlanificacion,
  type PlanificacionUnidad,
  type PlantillaPlanificacion,
} from '@faro/domain';
import { produccion } from './produccion';

export type PreparacionExport =
  | {
      readonly ok: true;
      readonly plan: PlanificacionUnidad;
      readonly plantilla: PlantillaPlanificacion;
      readonly catalogos: CatalogosPlanificacion;
    }
  | { readonly ok: false; readonly status: number; readonly error: string };

/** Resuelve {plan, plantilla, catálogos} desde el id del documento, listo para exportar. */
export async function prepararExportPlanificacion(id: string): Promise<PreparacionExport> {
  const { documentos, plantillas, catalogoRepo } = produccion();

  const doc = await documentos.porId(id);
  if (doc === null) return { ok: false, status: 404, error: `Documento '${id}' no encontrado.` };
  if (doc.tipo !== 'planificacion_unidad') {
    return { ok: false, status: 400, error: `El documento '${id}' no es una planificación de unidad.` };
  }

  const parsed = SchemaPlanificacionUnidad.safeParse(doc.contenido);
  if (!parsed.success) {
    return { ok: false, status: 422, error: 'El contenido del documento no es una planificación válida.' };
  }
  const plan = parsed.data;

  const plantilla = await plantillas.activaPara(plan.establecimiento, plan.plantilla);
  if (plantilla === null) {
    return { ok: false, status: 422, error: `No hay plantilla de Formato ${plan.plantilla} para '${plan.establecimiento}'.` };
  }

  const catalogos = await catalogoRepo.catalogos();
  return { ok: true, plan, plantilla, catalogos };
}
