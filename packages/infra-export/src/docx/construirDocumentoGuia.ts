// packages/infra-export/src/docx/construirDocumentoGuia.ts
// Renderiza el IR de la GUÍA del alumno a un `Document` de docx. Reusa los helpers compartidos de
// itemsAlumno.ts (render de ítems variante alumno + primitivas docx), iguales que la ficha (Plan 2).

import { AlignmentType, Document, PageOrientation, Paragraph, Table, TextRun } from 'docx';
import type { GuiaPlano } from './planoGuia.js';
import {
  celda,
  fila,
  notaBorrador,
  parrafosTexto,
  renderItemAlumno,
  separarTablasAdyacentes,
  tabla,
  titSeccion,
} from './itemsAlumno.js';

/** Construye el Document docx de la guía a partir del IR. */
export function construirDocumentoGuia(plano: GuiaPlano): Document {
  const children: Array<Paragraph | Table> = [
    ...encabezadoDocumento(plano),
    ...seccionExplicacion(plano),
    ...seccionEjemplo(plano),
    ...seccionEjercicios(plano),
  ];

  return new Document({
    styles: { default: { document: { run: { font: 'Arial' } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: separarTablasAdyacentes(children),
      },
    ],
  });
}

function encabezadoDocumento(plano: GuiaPlano): Array<Paragraph | Table> {
  const e = plano.encabezado;
  const out: Array<Paragraph | Table> = [];

  out.push(new Paragraph({ children: [new TextRun({ text: e.lineaColegio, bold: true, size: 22 })] }));
  if (e.docente !== undefined) {
    out.push(new Paragraph({ children: [new TextRun({ text: `Profesora: ${e.docente}`, size: 18 })] }));
  }
  out.push(new Paragraph({ children: [new TextRun({ text: `Asignatura: ${e.asignatura}`, size: 18 })] }));

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 0 },
      children: [new TextRun({ text: e.titulo, bold: true, size: 28 })],
    }),
  );
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: e.curso, size: 20 })],
    }),
  );

  out.push(notaBorrador());

  if (e.identificacion.length > 0) {
    out.push(
      tabla(e.identificacion.map((filaCeldas) => fila(filaCeldas.map((texto) => celda(parrafosTexto(texto)))))),
    );
  }

  out.push(
    tabla([
      fila([
        celda([
          new Paragraph({
            children: [
              new TextRun({ text: `${e.oa.codigo}: `, bold: true }),
              new TextRun({ text: e.oa.descripcion }),
            ],
          }),
        ]),
      ]),
    ]),
  );

  out.push(
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text: 'Conocimiento: ', bold: true }), new TextRun({ text: e.conocimiento })],
    }),
  );

  return out;
}

function seccionExplicacion(plano: GuiaPlano): Array<Paragraph | Table> {
  return [
    titSeccion('¿Qué vamos a aprender?'),
    new Paragraph({ spacing: { before: 40, after: 120 }, children: [new TextRun({ text: plano.explicacion })] }),
  ];
}

function seccionEjemplo(plano: GuiaPlano): Array<Paragraph | Table> {
  return [
    titSeccion('Ejemplo'),
    new Paragraph({ spacing: { before: 40, after: 120 }, children: [new TextRun({ text: plano.ejemplo })] }),
  ];
}

function seccionEjercicios(plano: GuiaPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [titSeccion('Ahora practica')];
  for (const item of plano.ejercicios) {
    out.push(...renderItemAlumno(item));
  }
  return out;
}
