// apps/web/src/lib/exportarPrueba.ts
// Carga común para las descargas .docx/.pdf de una PRUEBA FORMATIVA (Fase 4). Resuelve el documento de
// prueba, valida su contenido, navega a la planificación de origen (origen_id) para construir el
// EncabezadoPrueba (título + filas OA con su texto, docente), y compone los datos institucionales
// (config "pasada al exportar" — decisión del dueño): defaults derivados de la unidad, con overrides
// opcionales del caller. Devuelve un resultado discriminado para que el route handler mapee su estado.

import {
  SchemaPlanificacionUnidad,
  SchemaPrueba,
  type EncabezadoPrueba,
  type Prueba,
} from '@faro/domain';
import { construirEncabezadoPrueba, type DatosInstitucionales } from '@faro/application';
import { produccion } from './produccion';

export type PreparacionExportPrueba =
  | { readonly ok: true; readonly prueba: Prueba; readonly encabezado: EncabezadoPrueba }
  | { readonly ok: false; readonly status: number; readonly error: string };

/**
 * Resuelve {prueba, encabezado} desde el id del documento de prueba, listo para exportar.
 * `override` permite pasar datos institucionales (nombreColegio/comuna/docente/...) desde el caller;
 * lo no provisto cae a defaults derivados de la unidad de origen.
 */
export async function prepararExportPrueba(
  id: string,
  override?: Partial<DatosInstitucionales>,
): Promise<PreparacionExportPrueba> {
  const { documentos } = produccion();

  const doc = await documentos.porId(id);
  if (doc === null) return { ok: false, status: 404, error: `Documento '${id}' no encontrado.` };
  if (doc.tipo !== 'prueba') {
    return { ok: false, status: 400, error: `El documento '${id}' no es una prueba.` };
  }

  const prueba = SchemaPrueba.safeParse(doc.contenido);
  if (!prueba.success) {
    return { ok: false, status: 422, error: 'El contenido del documento no es una prueba válida.' };
  }

  // La prueba cuelga de su planificación de unidad por origen_id: de ahí salen las filas OA (con su
  // texto) y el docente del encabezado.
  if (doc.origenId === null || doc.origenId === undefined) {
    return { ok: false, status: 422, error: 'La prueba no referencia una planificación de origen.' };
  }
  const planDoc = await documentos.porId(doc.origenId);
  if (planDoc === null) {
    return { ok: false, status: 422, error: 'No se encontró la planificación de origen de la prueba.' };
  }
  const unidad = SchemaPlanificacionUnidad.safeParse(planDoc.contenido);
  if (!unidad.success) {
    return { ok: false, status: 422, error: 'La planificación de origen no es válida.' };
  }

  // Datos institucionales: config "pasada al exportar". Defaults desde la unidad; overrides del caller.
  // exactOptionalPropertyTypes: las props opcionales se añaden por spread condicional.
  const inst: DatosInstitucionales = {
    nombreColegio: override?.nombreColegio ?? unidad.data.establecimiento,
    comuna: override?.comuna ?? '[Comuna]',
    ...(override?.escudo !== undefined ? { escudo: override.escudo } : {}),
    ...(override?.docente !== undefined ? { docente: override.docente } : {}),
    ...(override?.porcentajeExigencia !== undefined
      ? { porcentajeExigencia: override.porcentajeExigencia }
      : {}),
  };

  const encabezado = construirEncabezadoPrueba(unidad.data, inst);
  return { ok: true, prueba: prueba.data, encabezado };
}
