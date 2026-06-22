// packages/infra-export/src/docx/planoFicha.ts
// IR puro y testeable de la FICHA para colorear: encabezado + ejercicios (variante alumno) + 1 dibujo.
// Reusa itemPlano de planoPrueba (mismo mapeo alumno → sin solución que la guía).

import type { DatosInstitucionalesGuia, Ficha } from '@faro/domain';
import { itemPlano, type ItemPlano } from './planoPrueba.js';

export interface EncabezadoFichaPlano {
  readonly lineaColegio: string;
  readonly docente?: string;
  readonly asignatura: string;
  readonly curso: string;
  readonly titulo: string;
  readonly oa: { readonly codigo: string; readonly descripcion: string };
  readonly identificacion: ReadonlyArray<ReadonlyArray<string>>;
}

export interface FichaPlano {
  readonly encabezado: EncabezadoFichaPlano;
  readonly ejercicios: readonly ItemPlano[];
  readonly consignaDibujo: string;
  readonly imagenClave: string;
  readonly descripcionDibujo: string; // alt-text / texto del placeholder si falta el PNG
}

export function planoFicha(ficha: Ficha, inst: DatosInstitucionalesGuia): FichaPlano {
  // Variante alumno: mostrarSolucion = false (no se revelan respuestas ni retroalimentación).
  const ejercicios = ficha.ejercicios.map((it, i) => itemPlano(it, i + 1, false));

  return {
    encabezado: {
      lineaColegio: `${inst.nombreColegio} · ${inst.comuna}`,
      ...(inst.docente !== undefined ? { docente: inst.docente } : {}),
      asignatura: ficha.asignatura,
      curso: ficha.curso,
      titulo: ficha.titulo,
      oa: { codigo: ficha.oa.codigo, descripcion: ficha.oa.descripcion },
      identificacion: [['Nombre:', 'Curso:', 'Fecha:']],
    },
    ejercicios,
    consignaDibujo: ficha.consigna_dibujo,
    imagenClave: ficha.imagen_clave,
    descripcionDibujo: ficha.descripcion_dibujo,
  };
}
