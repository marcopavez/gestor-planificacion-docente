// packages/infra-export/src/docx/construirDocumentoFicha.ts
// Renderiza el IR de la FICHA a un Document docx: encabezado + actividades (ejercicios) + 1 dibujo para
// colorear (ImageRun si hay PNG; si no, caja placeholder "DIBUJO: …"). Reusa los helpers compartidos de
// itemsAlumno.ts (mismos que la guía) y el patrón de imagen de la lámina.

import {
  AlignmentType,
  Document,
  ImageRun,
  PageOrientation,
  Paragraph,
  Table,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { FichaPlano } from './planoFicha.js';
import {
  BORDES_TABLA,
  celda,
  fila,
  notaBorrador,
  parrafosTexto,
  renderItemAlumno,
  separarTablasAdyacentes,
  tabla,
  titSeccion,
} from './itemsAlumno.js';

// Dibujo más chico que la lámina (comparte página con los ejercicios). Proporción 3:4.
const IMG_ANCHO_PX = 360;
const IMG_ALTO_PX = 480;

export function construirDocumentoFicha(plano: FichaPlano, imagenPng: Buffer | null): Document {
  const children: Array<Paragraph | Table> = [
    ...encabezado(plano),
    titSeccion('Actividades'),
    ...ejerciciosSeccion(plano),
    titSeccion('Colorea'),
    consignaParrafo(plano.consignaDibujo),
    dibujo(plano, imagenPng),
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

function encabezado(plano: FichaPlano): Array<Paragraph | Table> {
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
    out.push(tabla(e.identificacion.map((f) => fila(f.map((t) => celda(parrafosTexto(t)))))));
  }
  out.push(
    tabla([
      fila([
        celda([
          new Paragraph({
            children: [new TextRun({ text: `${e.oa.codigo}: `, bold: true }), new TextRun({ text: e.oa.descripcion })],
          }),
        ]),
      ]),
    ]),
  );
  return out;
}

function ejerciciosSeccion(plano: FichaPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const item of plano.ejercicios) out.push(...renderItemAlumno(item));
  return out;
}

function consignaParrafo(consigna: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: consigna, bold: true, size: 24 })],
  });
}

/** El dibujo para colorear: ImageRun si hay PNG; si no, caja placeholder "DIBUJO: …". */
function dibujo(plano: FichaPlano, imagenPng: Buffer | null): Paragraph | Table {
  if (imagenPng === null) {
    return cajaPlaceholderDibujo(`DIBUJO: ${plano.descripcionDibujo}`);
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: 'png',
        data: imagenPng,
        transformation: { width: IMG_ANCHO_PX, height: IMG_ALTO_PX },
        altText: { name: 'dibujo', title: 'Dibujo para colorear', description: plano.descripcionDibujo },
      }),
    ],
  });
}

/** Caja con borde para el placeholder del dibujo (cuando falta el PNG). */
function cajaPlaceholderDibujo(texto: string): Table {
  const cell = celda([
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: texto, italics: true, color: '555555' })],
    }),
  ]);
  return new Table({
    rows: [new TableRow({ children: [cell] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES_TABLA,
  });
}
