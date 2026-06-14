// apps/web/src/lib/exportarGuia.ts
// Carga común para las descargas .docx/.pdf de una GUÍA del alumno (Tanda 1). Resuelve el documento de
// guía, valida su contenido, y compone los datos institucionales (config "pasada al exportar"): defaults
// inocuos con overrides opcionales del caller. Devuelve un resultado discriminado para que el route
// handler mapee su estado.

import { SchemaGuia, type Guia } from '@faro/domain';
import type { DatosInstitucionalesGuia } from '@faro/domain';
import { produccion } from './produccion';

export type PreparacionExportGuia =
  | { readonly ok: true; readonly guia: Guia; readonly inst: DatosInstitucionalesGuia }
  | { readonly ok: false; readonly status: number; readonly error: string };

/**
 * Resuelve {guia, inst} desde el id del documento de guía, listo para exportar.
 * `override` permite pasar datos institucionales (nombreColegio/comuna/docente) desde el caller;
 * lo no provisto cae a defaults derivados del contenido de la guía.
 */
export async function prepararExportGuia(
  id: string,
  override?: Partial<DatosInstitucionalesGuia>,
): Promise<PreparacionExportGuia> {
  const { documentos } = produccion();

  const doc = await documentos.porId(id);
  if (doc === null) return { ok: false, status: 404, error: `Documento '${id}' no encontrado.` };
  if (doc.tipo !== 'guia') {
    return { ok: false, status: 400, error: `El documento '${id}' no es una guía.` };
  }

  const guia = SchemaGuia.safeParse(doc.contenido);
  if (!guia.success) {
    return { ok: false, status: 422, error: 'El contenido del documento no es una guía válida.' };
  }

  // Datos institucionales: config "pasada al exportar". La guía standalone no tiene establecimiento
  // real, así que sin override caen a placeholders explícitos (el caller los pasa por query).
  const inst: DatosInstitucionalesGuia = {
    nombreColegio: override?.nombreColegio ?? '[Colegio]',
    comuna: override?.comuna ?? '[Comuna]',
    ...(override?.docente !== undefined ? { docente: override.docente } : {}),
  };
  return { ok: true, guia: guia.data, inst };
}
