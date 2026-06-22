// packages/infra-export/src/docx/itemsAlumno.ts
// Helpers docx compartidos para documentos del ALUMNO (guía + ficha): render de un ItemPlano (variante
// alumno, sin solución) + primitivas de tabla/encabezado. Extraído de construirDocumentoGuia para que la
// FICHA (Plan 2) reúse el MISMO render de ejercicios sin duplicar ~80 líneas de switch.

import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { ItemPlano } from './planoPrueba.js';

const BORDE = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
export const BORDES_TABLA = {
  top: BORDE,
  bottom: BORDE,
  left: BORDE,
  right: BORDE,
  insideHorizontal: BORDE,
  insideVertical: BORDE,
};

export const CHK = '☐';

/**
 * Renderiza un ítem de trabajo del alumno (variante alumno — sin solución ni retroalimentación).
 * Replica el switch de renderItem de PruebaExportAdapter con mostrarSolucion=false fijo.
 */
export function renderItemAlumno(item: ItemPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];

  switch (item.tipo) {
    case 'seleccion_multiple': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      for (const alt of item.alternativas) {
        out.push(
          new Paragraph({
            indent: { left: 360 },
            children: [new TextRun({ text: `${CHK} ${alt.etiqueta}) ${alt.texto}` })],
          }),
        );
      }
      break;
    }
    case 'verdadero_falso': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      out.push(
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: `${CHK} V     ${CHK} F` })],
        }),
      );
      break;
    }
    case 'completacion': {
      out.push(
        new Paragraph({
          spacing: { before: 60 },
          children: [new TextRun({ text: `${item.numero}. ${item.enunciado} ` }), new TextRun({ text: '____________' })],
        }),
      );
      break;
    }
    case 'desarrollo': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      for (let i = 0; i < 3; i++) out.push(lineaRespuesta());
      break;
    }
    case 'ordenar': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      for (const el of item.elementos) {
        out.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: `____ ${el}` })] }));
      }
      break;
    }
    case 'terminos_pareados': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      const n = Math.max(item.columnaA.length, item.columnaB.length);
      if (n === 0) {
        out.push(new Paragraph({ children: [new TextRun('—')] }));
        break;
      }
      const filas: TableRow[] = [
        fila([celda(parrafosTexto('Columna A', true)), celda(parrafosTexto('Columna B', true))]),
      ];
      for (let i = 0; i < n; i++) {
        const a = item.columnaA[i];
        const b = item.columnaB[i];
        filas.push(
          fila([
            celda(parrafosTexto(a !== undefined ? `${i + 1}. ${a}` : '')),
            celda(parrafosTexto(b !== undefined ? `${letra(i)}. ${b}   ____` : '')),
          ]),
        );
      }
      out.push(tabla(filas));
      break;
    }
    case 'pictorico': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      out.push(cajaPlaceholder(item.imagenPlaceholder));
      break;
    }
  }

  return out;
}

export function titSeccion(texto: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: texto, bold: true, size: 22 })],
  });
}

export function notaBorrador(): Paragraph {
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

export function enunciadoParrafo(numero: number, enunciado: string, puntaje?: number): Paragraph {
  const sufijo = puntaje !== undefined ? `  (${puntaje} pts)` : '';
  return new Paragraph({
    spacing: { before: 60 },
    children: [new TextRun({ text: `${numero}. ${enunciado}${sufijo}` })],
  });
}

export function lineaRespuesta(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 1 } },
    spacing: { before: 120 },
    children: [new TextRun({ text: '' })],
  });
}

/** Caja con borde para un placeholder visible "IMAGEN: …" (ítem pictórico), como en la prueba. */
export function cajaPlaceholder(texto: string): Table {
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

export function parrafosTexto(texto: string, bold = false): Paragraph[] {
  return [new Paragraph({ children: [new TextRun({ text: texto, bold })] })];
}

export function celda(children: Array<Paragraph | Table>, opc: { fill?: string; ancho?: number } = {}): TableCell {
  return new TableCell({
    children,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    ...(opc.fill !== undefined ? { shading: { fill: opc.fill, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    ...(opc.ancho !== undefined ? { width: { size: opc.ancho, type: WidthType.PERCENTAGE } } : {}),
  });
}

export function fila(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells });
}

/** Tabla full-width con bordes negros finos. Guardia: 0 filas → degrada a un párrafo "—". */
export function tabla(rows: TableRow[]): Table {
  const filas = rows.length > 0 ? rows : [fila([celda([new Paragraph({ children: [new TextRun('—')] })])])];
  return new Table({ rows: filas, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDES_TABLA });
}

/** Letra minúscula (a, b, c…) para la columna B de términos pareados. */
export function letra(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}

/** Inserta un párrafo mínimo entre tablas adyacentes (evita fusión en Word). */
export function separarTablasAdyacentes(hijos: ReadonlyArray<Paragraph | Table>): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  hijos.forEach((h, i) => {
    const previo = hijos[i - 1];
    if (i > 0 && previo instanceof Table && h instanceof Table) {
      out.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: '', size: 2 })] }));
    }
    out.push(h);
  });
  return out;
}
