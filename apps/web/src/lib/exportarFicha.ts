// apps/web/src/lib/exportarFicha.ts
// Carga común para las descargas .docx/.pdf de una FICHA para colorear (Plan 2). Resuelve el documento,
// valida su contenido y compone los datos institucionales (defaults con overrides del caller). Espejo de exportarLamina.

import { SchemaFicha, type Ficha } from '@faro/domain';
import type { DatosInstitucionalesGuia } from '@faro/domain';
import { produccion } from './produccion';

export type PreparacionExportFicha =
  | { readonly ok: true; readonly ficha: Ficha; readonly inst: DatosInstitucionalesGuia }
  | { readonly ok: false; readonly status: number; readonly error: string };

export async function prepararExportFicha(
  id: string,
  override?: Partial<DatosInstitucionalesGuia>,
): Promise<PreparacionExportFicha> {
  const { documentos } = produccion();

  const doc = await documentos.porId(id);
  if (doc === null) return { ok: false, status: 404, error: `Documento '${id}' no encontrado.` };
  if (doc.tipo !== 'ficha_colorear') {
    return { ok: false, status: 400, error: `El documento '${id}' no es una ficha para colorear.` };
  }

  const ficha = SchemaFicha.safeParse(doc.contenido);
  if (!ficha.success) {
    return { ok: false, status: 422, error: 'El contenido del documento no es una ficha válida.' };
  }

  const inst: DatosInstitucionalesGuia = {
    nombreColegio: override?.nombreColegio ?? '[Colegio]',
    comuna: override?.comuna ?? '[Comuna]',
    ...(override?.docente !== undefined ? { docente: override.docente } : {}),
  };
  return { ok: true, ficha: ficha.data, inst };
}
