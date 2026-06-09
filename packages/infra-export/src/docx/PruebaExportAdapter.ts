// packages/infra-export/src/docx/PruebaExportAdapter.ts
// Fase 4 · Renderiza la PRUEBA FORMATIVA a .docx (variante alumno o pauta) y a .pdf (INV-6). Implementa
// ExportPruebaPort de @faro/domain. El layout se deriva 1:1 del IR (planoPrueba.ts). A diferencia de la
// planificación (dos clases), aquí el puerto es UNO (aDocx + aPdf) y el dueño pidió "PruebaExportAdapter".
//
// Decisiones del dueño: A4 VERTICAL, fuente del sistema (Arial), imágenes = PLACEHOLDER visible
// "IMAGEN: …" (nunca asset real), pauta = DOCUMENTO SEPARADO (con respuesta + retroalimentación por ítem
// + tabla de especificaciones). `.pdf` = el .docx renderizado por LibreOffice (cero divergencia).

import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import type { ArchivoExportado, EncabezadoPrueba, Prueba, VariantePrueba } from '@faro/domain';
import type { Logger } from '@faro/observability';
import {
  AlignmentType,
  BorderStyle,
  Document,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { MIME_DOCX } from './DocxExportAdapter.js';
import {
  MIME_PDF,
  MotorPdfNoDisponibleError,
  construirComandoSoffice,
  resolverSofficeBin,
  rutaPdfEsperada,
} from './PdfExportAdapter.js';
import { planoPrueba, type EncabezadoPlano, type ItemPlano, type PruebaPlano, type SeccionPruebaPlano } from './planoPrueba.js';

const execFileP = promisify(execFile);

const CHK = '☐';
const MARCADO = '☒';

// Bordes finos y completos (calca el LOOK del documento real: líneas negras, no grises). Copiados de
// DocxExportAdapter (NO se importan funciones privadas; se replican los helpers que se necesitan).
const BORDE = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const BORDES_TABLA = {
  top: BORDE,
  bottom: BORDE,
  left: BORDE,
  right: BORDE,
  insideHorizontal: BORDE,
  insideVertical: BORDE,
};

export class PruebaExportAdapter {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
  ) {}

  async aDocx(
    prueba: Prueba,
    encabezado: EncabezadoPrueba,
    variante: VariantePrueba,
    idDocumento?: string,
  ): Promise<ArchivoExportado> {
    const plano = planoPrueba(prueba, encabezado, variante);
    const doc = construirDocumentoPrueba(plano);

    const data = await Packer.toBuffer(doc);
    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${nombreArchivoPrueba(prueba, variante, idDocumento)}.docx`);
    await writeFile(ruta, data);

    this.log.info({ ruta, bytes: data.length, variante, secciones: plano.secciones.length }, 'export.prueba.docx');
    return { ruta, mime: MIME_DOCX, bytes: data.length };
  }

  async aPdf(
    prueba: Prueba,
    encabezado: EncabezadoPrueba,
    variante: VariantePrueba,
    idDocumento?: string,
  ): Promise<ArchivoExportado> {
    const bin = resolverSofficeBin();
    if (bin === null) throw new MotorPdfNoDisponibleError();

    // El .pdf es el .docx renderizado: generamos el .docx primero (cero divergencia).
    const docx = await this.aDocx(prueba, encabezado, variante, idDocumento);

    // Perfil de usuario aislado por invocación → conversiones concurrentes no chocan por el lock.
    const profileDir = await mkdtemp(join(tmpdir(), 'faro-soffice-'));
    try {
      const { args } = construirComandoSoffice(bin, docx.ruta, this.dirSalida, profileDir);
      await execFileP(bin, args, { timeout: 120_000 });

      const ruta = rutaPdfEsperada(this.dirSalida, docx.ruta);
      if (!existsSync(ruta)) {
        throw new Error(`LibreOffice no produjo el PDF esperado en ${ruta}.`);
      }
      const { size } = await stat(ruta);
      this.log.info({ ruta, bytes: size, variante }, 'export.prueba.pdf');
      return { ruta, mime: MIME_PDF, bytes: size };
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}

/** Construye el documento `docx` de la prueba a partir del IR. Exportado para tests por XML. */
export function construirDocumentoPrueba(plano: PruebaPlano): Document {
  const children: Array<Paragraph | Table> = [...encabezadoDocumento(plano)];

  for (const seccion of plano.secciones) {
    children.push(...renderSeccion(seccion, plano.mostrarSolucion));
  }

  // En la pauta, al final: PAUTA DE CORRECCIÓN + resumen de la tabla de especificaciones.
  if (plano.mostrarSolucion) {
    children.push(...pautaFinal(plano));
  }

  return new Document({
    // Fuente por defecto SANS (Arial): sin esto Word cae a Times New Roman (serif). Aplica a todo el doc.
    styles: { default: { document: { run: { font: 'Arial' } } } },
    sections: [
      {
        properties: {
          page: {
            // VERTICAL: la prueba se imprime en A4 vertical (no se pasa width/height — docx parte de A4).
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        // Word fusiona dos tablas adyacentes (sin párrafo entre medio): intercalamos un párrafo mínimo.
        children: separarTablasAdyacentes(children),
      },
    ],
  });
}

// --- encabezado institucional ---

/**
 * Encabezado del documento (en el cuerpo, no en page-header): escudo placeholder + línea de colegio +
 * Profesora + Asignatura; título centrado en negrita (con sufijo " — Pauta" si es la pauta) + curso;
 * tabla de identificación 2×2; y la(s) fila(s) de OA full-width.
 */
function encabezadoDocumento(plano: PruebaPlano): Array<Paragraph | Table> {
  const e: EncabezadoPlano = plano.encabezado;
  const out: Array<Paragraph | Table> = [];

  if (e.escudo !== undefined) {
    out.push(cajaPlaceholder(e.escudo));
  }
  out.push(new Paragraph({ children: [new TextRun({ text: e.lineaColegio, bold: true, size: 22 })] }));
  if (e.docente !== undefined) {
    out.push(new Paragraph({ children: [new TextRun({ text: `Profesora: ${e.docente}`, size: 18 })] }));
  }
  out.push(new Paragraph({ children: [new TextRun({ text: `Asignatura: ${e.asignatura}`, size: 18 })] }));

  // Banner OBVIO de PAUTA + título.
  if (plano.mostrarSolucion) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 0 },
        children: [new TextRun({ text: 'PAUTA DE CORRECCIÓN (uso docente)', bold: true, color: 'C00000', size: 20 })],
      }),
    );
  }
  const titulo = plano.mostrarSolucion ? `${e.titulo} — Pauta` : e.titulo;
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: plano.mostrarSolucion ? 0 : 80, after: 0 },
      children: [new TextRun({ text: titulo, bold: true, size: 28 })],
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

  // Tabla de identificación 2×2 (filas de ancho variable; calca la prueba real).
  if (e.identificacion.length > 0) {
    out.push(
      tabla(
        e.identificacion.map((filaCeldas) =>
          fila(filaCeldas.map((texto) => celda(parrafosTexto(texto)))),
        ),
      ),
    );
  }

  // Fila(s) OA: cada OA en una celda full-width "OAx: descripción".
  if (e.oaFilas.length > 0) {
    out.push(
      tabla(
        e.oaFilas.map((oa) =>
          fila([
            celda([
              new Paragraph({
                children: [new TextRun({ text: `${oa.codigo}: `, bold: true }), new TextRun({ text: oa.descripcion })],
              }),
            ]),
          ]),
        ),
      ),
    );
  }

  return out;
}

// --- secciones e ítems ---

function renderSeccion(seccion: SeccionPruebaPlano, mostrarSolucion: boolean): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  const cab =
    seccion.puntaje !== undefined
      ? `${seccion.romano}. ${seccion.instruccion} (${seccion.puntaje} pts)`
      : `${seccion.romano}. ${seccion.instruccion}`;
  out.push(
    new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: cab, bold: true, size: 22 })],
    }),
  );
  for (const item of seccion.items) out.push(...renderItem(item, mostrarSolucion));
  return out;
}

function renderItem(item: ItemPlano, mostrarSolucion: boolean): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];

  switch (item.tipo) {
    case 'seleccion_multiple': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      for (const alt of item.alternativas) {
        const marca = mostrarSolucion && alt.correcta ? MARCADO : CHK;
        const sufijo = mostrarSolucion && alt.correcta ? ' ✔' : '';
        out.push(
          new Paragraph({
            indent: { left: 360 },
            children: [new TextRun({ text: `${marca} ${alt.etiqueta}) ${alt.texto}${sufijo}` })],
          }),
        );
      }
      break;
    }
    case 'verdadero_falso': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      const marcaV = mostrarSolucion && item.correcta === 'V' ? MARCADO : CHK;
      const marcaF = mostrarSolucion && item.correcta === 'F' ? MARCADO : CHK;
      out.push(
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: `${marcaV} V     ${marcaF} F` })],
        }),
      );
      break;
    }
    case 'completacion': {
      // Enunciado + línea para escribir, en el mismo párrafo.
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
      out.push(cajaPlaceholder(item.imagenPlaceholder));
      break;
    }
  }

  // En la pauta, debajo de cada ítem: Respuesta + Retroalimentación (color tenue/cursiva).
  if (mostrarSolucion) {
    if (item.solucion !== undefined) out.push(parrafoSolucion('Respuesta', item.solucion));
    if (item.retro !== undefined) out.push(parrafoSolucion('Retroalimentación', item.retro));
  }

  return out;
}

/** Enunciado numerado "N. texto" (+ " (n pts)" si hay puntaje). */
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

function parrafoSolucion(rotulo: string, texto: string): Paragraph {
  return new Paragraph({
    indent: { left: 360 },
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${rotulo}: `, bold: true, italics: true, color: '2E7D32', size: 18 }),
      new TextRun({ text: texto, italics: true, color: '2E7D32', size: 18 }),
    ],
  });
}

/** Sección final de la pauta: el texto de pauta_correccion + resumen de la tabla de especificaciones. */
function pautaFinal(plano: PruebaPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  out.push(
    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [new TextRun({ text: 'PAUTA DE CORRECCIÓN', bold: true, size: 24 })],
    }),
  );
  if (plano.pautaCorreccion !== undefined && plano.pautaCorreccion.length > 0) {
    out.push(new Paragraph({ children: [new TextRun({ text: plano.pautaCorreccion })] }));
  }

  const tablaEspec = plano.tablaEspecificaciones ?? [];
  if (tablaEspec.length > 0) {
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [new TextRun({ text: 'Tabla de especificaciones', bold: true })],
      }),
    );
    out.push(
      tabla([
        fila([
          celda(parrafosTexto('OA', true)),
          celda(parrafosTexto('N.º de ítems', true)),
          celda(parrafosTexto('Puntaje', true)),
        ]),
        ...tablaEspec.map((t) =>
          fila([
            celda(parrafosTexto(t.codigo)),
            celda(parrafosTexto(String(t.nItems))),
            celda(parrafosTexto(t.puntaje !== undefined ? String(t.puntaje) : '—')),
          ]),
        ),
      ]),
    );
  }
  return out;
}

// --- helpers de docx (replicados de DocxExportAdapter; NO se importan sus funciones privadas) ---

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

/** Caja con borde para un placeholder visible "IMAGEN: …" (escudo o ítem pictórico), como en el PPT. */
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

/** Inserta un párrafo mínimo entre cualquier par de tablas consecutivas (evita que Word las fusione). */
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
  // Una tabla docx con 0 filas hace que la lib lance RangeError; aseguramos al menos una fila.
  const filas = rows.length > 0 ? rows : [fila([celda([new Paragraph({ children: [new TextRun('—')] })])])];
  return new Table({ rows: filas, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDES_TABLA });
}

/** Letra minúscula (a, b, c…) para la columna B de términos pareados. */
function letra(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}

/**
 * Nombre de archivo seguro a partir de asignatura/curso/variante (sin tildes ni símbolos). `idDocumento`
 * lo hace único en disco (evita colisiones al exportar a la carpeta compartida). Mismo saneo NFD que
 * `nombreArchivo` de DocxExportAdapter.
 */
function nombreArchivoPrueba(prueba: Prueba, variante: VariantePrueba, idDocumento?: string): string {
  const sufijo = idDocumento !== undefined ? `-${idDocumento}` : '';
  const base = `prueba-${prueba.asignatura}-${prueba.curso}-${variante}${sufijo}`;
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'prueba';
}
