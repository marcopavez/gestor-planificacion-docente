// packages/infra-export/src/docx/construirDocumentoLamina.ts
// Renderiza el IR de la LÁMINA a un Document docx: encabezado + consigna + un dibujo grande a página.
// Si hay PNG (Buffer) → ImageRun; si no → caja placeholder "DIBUJO: …" (misma filosofía que la guía).
// Helpers replicados de construirDocumentoGuia (no se importan funciones privadas — misma decisión del repo).

import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { LaminaPlano } from './planoLamina.js';

const BORDE = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const BORDES_TABLA = {
  top: BORDE,
  bottom: BORDE,
  left: BORDE,
  right: BORDE,
  insideHorizontal: BORDE,
  insideVertical: BORDE,
};

// Dibujo grande a página (vertical A4 ≈ 6.3" útiles de ancho; alto proporcional a 3:4).
const IMG_ANCHO_PX = 600;
const IMG_ALTO_PX = 800;

export function construirDocumentoLamina(plano: LaminaPlano, imagenPng: Buffer | null): Document {
  const children: Array<Paragraph | Table> = [
    ...encabezado(plano),
    consignaParrafo(plano.consigna),
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
        children,
      },
    ],
  });
}

function encabezado(plano: LaminaPlano): Array<Paragraph | Table> {
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

function consignaParrafo(consigna: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new TextRun({ text: consigna, bold: true, size: 24 })],
  });
}

/** El dibujo a página: ImageRun si hay PNG; si no, caja placeholder "DIBUJO: …". */
function dibujo(plano: LaminaPlano, imagenPng: Buffer | null): Paragraph | Table {
  if (imagenPng === null) {
    return cajaPlaceholder(`DIBUJO: ${plano.descripcionDibujo}`);
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

// --- Helpers docx (replicados de construirDocumentoGuia; no se importan funciones privadas) ---

function notaBorrador(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: 'Borrador generado por Faro · requiere revisión docente (HIL)',
        italics: true,
        color: '888888',
        size: 16,
      }),
    ],
  });
}

function cajaPlaceholder(texto: string): Table {
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

function parrafosTexto(texto: string): Paragraph[] {
  return [new Paragraph({ children: [new TextRun({ text: texto })] })];
}

function celda(children: Array<Paragraph | Table>): TableCell {
  return new TableCell({
    children,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function fila(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells });
}

function tabla(rows: TableRow[]): Table {
  const filas = rows.length > 0 ? rows : [fila([celda([new Paragraph({ children: [new TextRun('—')] })])])];
  return new Table({ rows: filas, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDES_TABLA });
}
