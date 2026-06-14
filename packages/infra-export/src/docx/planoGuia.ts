// packages/infra-export/src/docx/planoGuia.ts
// IR puro y testeable de la GUÍA del alumno: encabezado + explicación + ejemplo + ejercicios.
// Reusa itemPlano de planoPrueba para mapear cada ejercicio (variante alumno → sin solución).

import type { DatosInstitucionalesGuia, Guia, ItemPruebaType } from '@faro/domain';
import { itemPlano, type ItemPlano } from './planoPrueba.js';

export interface EncabezadoGuiaPlano {
  readonly lineaColegio: string;
  readonly docente?: string;
  readonly asignatura: string;
  readonly curso: string;
  readonly titulo: string;
  readonly conocimiento: string;
  readonly oa: { readonly codigo: string; readonly descripcion: string };
  readonly identificacion: ReadonlyArray<ReadonlyArray<string>>;
}

export interface GuiaPlano {
  readonly encabezado: EncabezadoGuiaPlano;
  readonly explicacion: string;
  readonly ejemplo: string;
  readonly ejercicios: readonly ItemPlano[];
}

export function planoGuia(guia: Guia, inst: DatosInstitucionalesGuia): GuiaPlano {
  const items: ItemPruebaType[] = [...guia.ejercicios, ...(guia.desafio !== undefined ? [guia.desafio] : [])];
  // Variante alumno: mostrarSolucion = false (no se revelan respuestas ni retroalimentación).
  const ejercicios = items.map((it, i) => itemPlano(it, i + 1, false));

  return {
    encabezado: {
      lineaColegio: `${inst.nombreColegio} · ${inst.comuna}`,
      ...(inst.docente !== undefined ? { docente: inst.docente } : {}),
      asignatura: guia.asignatura,
      curso: guia.curso,
      titulo: guia.titulo,
      conocimiento: guia.conocimiento,
      oa: { codigo: guia.oa.codigo, descripcion: guia.oa.descripcion },
      identificacion: [['Nombre:', 'Curso:', 'Fecha:']],
    },
    explicacion: guia.explicacion,
    ejemplo: guia.ejemplo,
    ejercicios,
  };
}
