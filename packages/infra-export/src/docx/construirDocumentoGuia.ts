// packages/infra-export/src/docx/construirDocumentoGuia.ts
// Renderiza el IR de la GUÍA del alumno a un `Document` de docx.
// Replicamos los helpers docx de PruebaExportAdapter (no se importan sus funciones privadas
// — idéntica decisión que tomó PruebaExportAdapter con DocxExportAdapter). Sin solucion/retro
// porque la guía siempre se genera con mostrarSolucion=false.

import {
  AlignmentType,
  BorderStyle,
  Document,
  PageOrientation,
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
import type { GuiaPlano } from './planoGuia.js';

// Bordes finos negros (mismo LOOK que la prueba y la planificación).
const BORDE = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const BORDES_TABLA = {
  top: BORDE,
  bottom: BORDE,
  left: BORDE,
  right: BORDE,
  insideHorizontal: BORDE,
  insideVertical: BORDE,
};

const CHK = '☐';

/** Construye el Document docx de la guía a partir del IR. */
export function construirDocumentoGuia(plano: GuiaPlano): Document {
  const children: Array<Paragraph | Table> = [
    ...encabezadoDocumento(plano),
    ...seccionExplicacion(plano),
    ...seccionEjemplo(plano),
    ...seccionEjercicios(plano),
  ];

  return new Document({
    // Fuente SANS por defecto (Arial): evita que Word caiga a Times New Roman.
    styles: { default: { document: { run: { font: 'Arial' } } } },
    sections: [
      {
        properties: {
          page: {
            // VERTICAL A4 (igual que la prueba formativa).
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: separarTablasAdyacentes(children),
      },
    ],
  });
}

// --- Encabezado institucional ---

function encabezadoDocumento(plano: GuiaPlano): Array<Paragraph | Table> {
  const e = plano.encabezado;
  const out: Array<Paragraph | Table> = [];

  // Línea de colegio en negrita, igual que en la prueba.
  out.push(new Paragraph({ children: [new TextRun({ text: e.lineaColegio, bold: true, size: 22 })] }));
  if (e.docente !== undefined) {
    out.push(new Paragraph({ children: [new TextRun({ text: `Profesora: ${e.docente}`, size: 18 })] }));
  }
  out.push(new Paragraph({ children: [new TextRun({ text: `Asignatura: ${e.asignatura}`, size: 18 })] }));

  // Título centrado en negrita.
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

  // Tabla de identificación (Nombre / Curso / Fecha).
  if (e.identificacion.length > 0) {
    out.push(
      tabla(
        e.identificacion.map((filaCeldas) =>
          fila(filaCeldas.map((texto) => celda(parrafosTexto(texto)))),
        ),
      ),
    );
  }

  // Fila OA: código + descripción.
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

  // Conocimiento del OA (debajo del OA, fuera de tabla).
  out.push(
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({ text: 'Conocimiento: ', bold: true }),
        new TextRun({ text: e.conocimiento }),
      ],
    }),
  );

  return out;
}

// --- Sección "¿Qué vamos a aprender?" ---

function seccionExplicacion(plano: GuiaPlano): Array<Paragraph | Table> {
  return [
    titSeccion('¿Qué vamos a aprender?'),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [new TextRun({ text: plano.explicacion })],
    }),
  ];
}

// --- Sección "Ejemplo" ---

function seccionEjemplo(plano: GuiaPlano): Array<Paragraph | Table> {
  return [
    titSeccion('Ejemplo'),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [new TextRun({ text: plano.ejemplo })],
    }),
  ];
}

// --- Sección "Ahora practica" ---

function seccionEjercicios(plano: GuiaPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [titSeccion('Ahora practica')];
  for (const item of plano.ejercicios) {
    out.push(...renderItemGuia(item));
  }
  return out;
}

/**
 * Renderiza un ítem de la guía (variante alumno — sin solución ni retroalimentación).
 * Replica el switch de renderItem de PruebaExportAdapter con mostrarSolucion=false fijo;
 * no se importan las funciones privadas de ese módulo (misma decisión que PruebaExportAdapter
 * tomó con DocxExportAdapter).
 */
function renderItemGuia(item: ItemPlano): Array<Paragraph | Table> {
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
      // Enunciado + línea para escribir en el mismo párrafo.
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
      // 3 líneas en blanco para responder.
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
      // Placeholder visible "IMAGEN: …" — nunca un asset real (misma filosofía que la prueba).
      out.push(cajaPlaceholder(item.imagenPlaceholder));
      break;
    }
  }

  return out;
}

// --- Helpers de docx (replicados de PruebaExportAdapter; no se importan sus funciones privadas) ---

function titSeccion(texto: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: texto, bold: true, size: 22 })],
  });
}

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

function enunciadoParrafo(numero: number, enunciado: string, puntaje?: number): Paragraph {
  const sufijo = puntaje !== undefined ? `  (${puntaje} pts)` : '';
  return new Paragraph({
    spacing: { before: 60 },
    children: [new TextRun({ text: `${numero}. ${enunciado}${sufijo}` })],
  });
}

function lineaRespuesta(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 1 } },
    spacing: { before: 120 },
    children: [new TextRun({ text: '' })],
  });
}

/** Caja con borde para un placeholder visible "IMAGEN: …" (ítem pictórico), como en la prueba. */
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

function parrafosTexto(texto: string, bold = false): Paragraph[] {
  return [new Paragraph({ children: [new TextRun({ text: texto, bold })] })];
}

function celda(children: Array<Paragraph | Table>, opc: { fill?: string; ancho?: number } = {}): TableCell {
  return new TableCell({
    children,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    ...(opc.fill !== undefined ? { shading: { fill: opc.fill, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    ...(opc.ancho !== undefined ? { width: { size: opc.ancho, type: WidthType.PERCENTAGE } } : {}),
  });
}

function fila(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells });
}

/** Tabla full-width con bordes negros finos. Guardia: 0 filas → degrada a un párrafo "—". */
function tabla(rows: TableRow[]): Table {
  const filas = rows.length > 0 ? rows : [fila([celda([new Paragraph({ children: [new TextRun('—')] })])])];
  return new Table({ rows: filas, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDES_TABLA });
}

/** Letra minúscula (a, b, c…) para la columna B de términos pareados. */
function letra(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}

/** Inserta un párrafo mínimo entre tablas adyacentes (evita fusión en Word). */
function separarTablasAdyacentes(hijos: ReadonlyArray<Paragraph | Table>): Array<Paragraph | Table> {
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
