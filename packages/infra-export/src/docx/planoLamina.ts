// packages/infra-export/src/docx/planoLamina.ts
// IR puro y testeable de la LÁMINA para colorear: encabezado + consigna + clave del dibujo.
// Sin disco (INV-1): el adapter resuelve la clave a un PNG. Espejo minimal de planoGuia.ts.

import type { DatosInstitucionalesGuia, Lamina } from '@faro/domain';

export interface EncabezadoLaminaPlano {
  readonly lineaColegio: string;
  readonly docente?: string;
  readonly asignatura: string;
  readonly curso: string;
  readonly titulo: string;
  readonly oa: { readonly codigo: string; readonly descripcion: string };
  readonly identificacion: ReadonlyArray<ReadonlyArray<string>>;
}

export interface LaminaPlano {
  readonly encabezado: EncabezadoLaminaPlano;
  readonly consigna: string;
  readonly imagenClave: string;
  readonly descripcionDibujo: string; // alt-text / texto del placeholder si falta el PNG
}

export function planoLamina(lamina: Lamina, inst: DatosInstitucionalesGuia): LaminaPlano {
  return {
    encabezado: {
      lineaColegio: `${inst.nombreColegio} · ${inst.comuna}`,
      ...(inst.docente !== undefined ? { docente: inst.docente } : {}),
      asignatura: lamina.asignatura,
      curso: lamina.curso,
      titulo: lamina.titulo,
      oa: { codigo: lamina.oa.codigo, descripcion: lamina.oa.descripcion },
      identificacion: [['Nombre:', 'Curso:', 'Fecha:']],
    },
    consigna: lamina.consigna,
    imagenClave: lamina.imagen_clave,
    descripcionDibujo: lamina.descripcion_dibujo,
  };
}
