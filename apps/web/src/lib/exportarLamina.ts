// apps/web/src/lib/exportarLamina.ts
// Carga común para las descargas .docx/.pdf de una LÁMINA para colorear (Plan 1). Resuelve el documento,
// valida su contenido y compone los datos institucionales (defaults con overrides del caller).

import { SchemaLamina, type Lamina } from '@faro/domain';
import type { DatosInstitucionalesGuia } from '@faro/domain';
import { produccion } from './produccion';

export type PreparacionExportLamina =
  | { readonly ok: true; readonly lamina: Lamina; readonly inst: DatosInstitucionalesGuia }
  | { readonly ok: false; readonly status: number; readonly error: string };

export async function prepararExportLamina(
  id: string,
  override?: Partial<DatosInstitucionalesGuia>,
): Promise<PreparacionExportLamina> {
  const { documentos } = produccion();

  const doc = await documentos.porId(id);
  if (doc === null) return { ok: false, status: 404, error: `Documento '${id}' no encontrado.` };
  if (doc.tipo !== 'material_colorear') {
    return { ok: false, status: 400, error: `El documento '${id}' no es un material para colorear.` };
  }

  const lamina = SchemaLamina.safeParse(doc.contenido);
  if (!lamina.success) {
    return { ok: false, status: 422, error: 'El contenido del documento no es una lámina válida.' };
  }

  const inst: DatosInstitucionalesGuia = {
    nombreColegio: override?.nombreColegio ?? '[Colegio]',
    comuna: override?.comuna ?? '[Comuna]',
    ...(override?.docente !== undefined ? { docente: override.docente } : {}),
  };
  return { ok: true, lamina: lamina.data, inst };
}
