// packages/infra-export/src/docx/DocxExportAdapter.ts
// H-2.5 · Renderiza la Planificación de Unidad a .docx (RF-2.9, INV-6). El layout se deriva 1:1 del
// IR (plano.ts), que a su vez calca la `definicion` de la plantilla activa (tablas del PDF real).
// Editable por el docente; el .pdf (H-2.6) reusa este .docx. El adapter es reemplazable tras el puerto.
//
// FIDELIDAD VISUAL (feat/v2-planificacion-fidelidad-docx): el LOOK es data-driven (RF-2.3) — orientación,
// encabezado institucional, sombreados y título vienen del `tema` de la plantilla (no hardcodeado por
// formato). Lo único institucional inevitable (textos/logos del membrete) viaja en plantilla.tema.header.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ArchivoExportado,
  CatalogosPlanificacion,
  PlanificacionUnidad,
  PlantillaPlanificacion,
} from '@faro/domain';
import type { Logger } from '@faro/observability';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
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
import {
  planoDocumento,
  type BloquePlano,
  type DocumentoPlano,
  type SeccionPlano,
  type TemaPlano,
} from './plano.js';

export const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const CHK = '☒';
const UNCHK = '☐';

// Bordes finos y completos (RF — "bordes de tabla finos y completos"). Gris medio, 0.5pt.
const BORDE = { style: BorderStyle.SINGLE, size: 4, color: '808080' } as const;
const NADA = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const BORDES_TABLA = {
  top: BORDE,
  bottom: BORDE,
  left: BORDE,
  right: BORDE,
  insideHorizontal: BORDE,
  insideVertical: BORDE,
};
const SIN_BORDES = {
  top: NADA,
  bottom: NADA,
  left: NADA,
  right: NADA,
  insideHorizontal: NADA,
  insideVertical: NADA,
};

// Contexto de estilo que cada bloque necesita del documento/sección (sombreados, orientación).
interface CtxRender {
  readonly colorEtiqueta?: string; // celdas-etiqueta de la grilla del encabezado y títulos de checkbox (crema)
  readonly colorCategoria?: string; // columna de categoría de la tabla de OA del Formato A (celeste)
  readonly cabeceraColor?: string; // cabeceras de tabla/matriz de la sección (naranja B, celeste matriz A)
  readonly landscape: boolean; // afecta nº de columnas de las grillas/checkbox
}

export class DocxExportAdapter {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
  ) {}

  async aDocx(
    plan: PlanificacionUnidad,
    plantilla: PlantillaPlanificacion,
    catalogos: CatalogosPlanificacion,
    idDocumento?: string,
  ): Promise<ArchivoExportado> {
    const plano = planoDocumento(plan, plantilla, catalogos);
    const doc = construirDocumento(plano);

    const data = await Packer.toBuffer(doc);
    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${nombreArchivo(plan, idDocumento)}.docx`);
    await writeFile(ruta, data);

    this.log.info({ ruta, bytes: data.length, secciones: plano.secciones.length }, 'export.docx');
    return { ruta, mime: MIME_DOCX, bytes: data.length };
  }
}

/** Construye el documento `docx` a partir del IR. Exportado para tests de estructura. */
export function construirDocumento(plano: DocumentoPlano): Document {
  const tema = plano.tema;
  const landscape = tema.orientacion === 'horizontal';

  const children: Array<Paragraph | Table> = [
    ...tituloDocumento(tema.titulo, tema.tituloBanda),
    notaBorrador(),
  ];
  for (const seccion of plano.secciones) {
    children.push(...renderSeccion(seccion, tema));
  }

  // El membrete institucional (si lo hay) va en el header de página: se repite en cada hoja del PDF.
  const conHeader = tema.header !== undefined;
  const headers = conHeader ? { default: new Header({ children: headerInstitucional(tema.header!) }) } : undefined;

  return new Document({
    sections: [
      {
        properties: {
          page: {
            // Solo la orientación: `docx` parte del A4 por defecto y permuta ancho/alto en landscape.
            // (No pasar width/height: hacerlo provoca una doble permutación y el .docx sale vertical.)
            size: { orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            // Margen superior holgado cuando hay membrete (4 líneas) para que no pise el cuerpo.
            margin: { top: conHeader ? 1700 : 720, bottom: 720, left: 720, right: 720, header: 360 },
          },
        },
        ...(headers !== undefined ? { headers } : {}),
        // Word fusiona dos tablas adyacentes (sin párrafo entre medio) y recalcula sus anchos,
        // rompiendo la fidelidad: intercalamos un párrafo mínimo entre tablas consecutivas.
        children: separarTablasAdyacentes(children),
      },
    ],
  });
}

// --- bloques de alto nivel ---

/**
 * Título del documento: líneas centradas en negrita. Si `banda` está definida, van dentro de una celda
 * full-width sombreada (el "PLANIFICACIÓN: UNIDAD …" del Formato A va sobre una banda celeste).
 */
function tituloDocumento(lineas: readonly string[], banda?: string): Array<Paragraph | Table> {
  const parrafos = lineas.map(
    (t, idx) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: idx === 0 ? 60 : 0, after: idx === lineas.length - 1 ? 60 : 0 },
        children: [new TextRun({ text: t, bold: true, size: 28 })], // 14pt
      }),
  );
  if (banda === undefined) return parrafos;
  return [
    new Table({
      rows: [new TableRow({ children: [celda(parrafos, { fill: banda })] })],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDES_TABLA,
    }),
  ];
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

/**
 * Membrete institucional (3 bloques: izquierda / centro / derecha) + banda decorativa. Hoy va como
 * TEXTO; el escudo del colegio (izq.) y el logo SLEP "Los Libertadores" (der.) se enchufan luego como
 * `ImageRun` en sus celdas, sin tocar el resto (no se recortan logos de los screenshots).
 */
function headerInstitucional(h: NonNullable<TemaPlano['header']>): Array<Paragraph | Table> {
  const bloque = (lineas: readonly string[], alignment: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph[] =>
    lineas.length > 0
      ? lineas.map((l, idx) => new Paragraph({ alignment, children: [new TextRun({ text: l, bold: idx === 0, size: 16 })] }))
      : [vacio()];

  // Membrete de un solo bloque (Formato B: el nombre del colegio centrado a todo el ancho): si no hay
  // bloques laterales, se evita la tabla de 3 columnas (que estrecharía el texto y lo haría partir feo).
  if (h.izquierda.length === 0 && h.derecha.length === 0) {
    return [...bloque(h.centro, AlignmentType.CENTER), bandaDecorativa(h.bandaColor)];
  }

  const fila3 = new TableRow({
    children: [
      celda(bloque(h.izquierda, AlignmentType.LEFT), { ancho: 40 }),
      celda(bloque(h.centro, AlignmentType.CENTER), { ancho: 34 }),
      celda(bloque(h.derecha, AlignmentType.RIGHT), { ancho: 26 }),
    ],
  });
  const tabla = new Table({ rows: [fila3], width: { size: 100, type: WidthType.PERCENTAGE }, borders: SIN_BORDES });
  return [tabla, bandaDecorativa(h.bandaColor)];
}

/** Banda decorativa bajo el membrete: doble regla del color institucional (granate en el Formato B). */
function bandaDecorativa(color?: string): Paragraph {
  return new Paragraph({
    spacing: { before: 20, after: 40 },
    border: { bottom: { style: BorderStyle.DOUBLE, size: 12, color: color ?? '000000', space: 1 } },
    children: [new TextRun({ text: '', size: 4 })],
  });
}

function renderSeccion(seccion: SeccionPlano, tema: TemaPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  if (seccion.mostrarTitulo) out.push(tituloSeccion(seccion));
  const ctx: CtxRender = {
    ...(tema.colorEtiqueta !== undefined ? { colorEtiqueta: tema.colorEtiqueta } : {}),
    ...(tema.colorCategoria !== undefined ? { colorCategoria: tema.colorCategoria } : {}),
    ...(seccion.cabeceraColor !== undefined ? { cabeceraColor: seccion.cabeceraColor } : {}),
    landscape: tema.orientacion === 'horizontal',
  };
  for (const bloque of seccion.bloques) out.push(...renderBloque(bloque, ctx));
  return out;
}

/** Título de sección: banda sombreada full-width si la sección la declara; si no, encabezado simple. */
function tituloSeccion(seccion: SeccionPlano): Paragraph | Table {
  if (seccion.bandaColor !== undefined) {
    const cell = celda(
      [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: seccion.titulo.toUpperCase(), bold: true })] })],
      { fill: seccion.bandaColor },
    );
    return new Table({
      rows: [new TableRow({ children: [cell] })],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDES_TABLA,
    });
  }
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: seccion.titulo, bold: true, size: 24 })], // 12pt
  });
}

// --- bloques de contenido ---

function renderBloque(b: BloquePlano, ctx: CtxRender): Array<Paragraph | Table> {
  switch (b.tipo) {
    case 'campos':
      return [grillaCampos(b.filas, ctx)];
    case 'parrafo':
      return [new Paragraph({ children: [new TextRun(b.texto.length > 0 ? b.texto : '—')] })];
    case 'lista':
      return b.items.length > 0
        ? b.items.map((t) => new Paragraph({ text: t, bullet: { level: 0 } }))
        : [new Paragraph({ children: [new TextRun('—')] })];
    case 'lista_en_linea':
      return [listaEnLinea(b.items)];
    case 'checkbox':
      return [
        // Título-etiqueta sombreado (crema), como las celdas-rótulo de la Evaluación en el PDF real.
        new Paragraph({
          spacing: { before: 60, after: 20 },
          ...(ctx.colorEtiqueta !== undefined ? { shading: { type: ShadingType.CLEAR, fill: ctx.colorEtiqueta, color: 'auto' } } : {}),
          children: [new TextRun({ text: b.titulo, bold: true })],
        }),
        grillaOpciones(b.opciones, ctx.landscape ? 4 : 3),
      ];
    case 'checkbox_matriz': {
      const ancho = Math.floor(100 / b.columnas.length);
      return [
        tabla([
          fila(b.columnas.map((c) => celda(parrafosTexto(c.titulo, true, AlignmentType.CENTER), { fill: ctx.cabeceraColor, ancho }))),
          fila(b.columnas.map((c) => celda(c.opciones.map((o) => parrafoOpcion(o.etiqueta, o.marcado)), { ancho }))),
        ]),
      ];
    }
    case 'tabla_oa_a':
      // Guardia: una tabla docx con 0 filas hace que la lib lance RangeError; degradar a placeholder.
      if (b.grupos.length === 0) return [new Paragraph({ children: [new TextRun('—')] })];
      return [
        // Sin fila de cabecera: el PDF real va directo categoría|OA bajo la banda "OBJETIVOS DE APRENDIZAJES".
        tabla(
          b.grupos.map((g) =>
            fila([
              celda(parrafosTexto(g.categoria, true), { fill: ctx.colorCategoria, ancho: 18 }),
              celda(
                g.oas.map(
                  (oa) =>
                    new Paragraph({
                      spacing: { after: 80 },
                      children: [new TextRun({ text: `${oa.codigo}: `, bold: true }), new TextRun({ text: oa.descripcion })],
                    }),
                ),
                { ancho: 82 },
              ),
            ]),
          ),
        ),
      ];
    case 'tabla_oa_b':
      return [
        tabla([
          fila([
            celda(parrafosTexto('OBJETIVO DE APRENDIZAJE PRIORIZADO', true, AlignmentType.CENTER), { fill: ctx.cabeceraColor, ancho: 26 }),
            celda(parrafosTexto('HABILIDADES', true, AlignmentType.CENTER), { fill: ctx.cabeceraColor, ancho: 14 }),
            celda(parrafosTexto('EXPERIENCIAS DE APRENDIZAJE / ACTIVIDADES', true, AlignmentType.CENTER), { fill: ctx.cabeceraColor, ancho: 46 }),
            celda(parrafosTexto('EVALUACIÓN', true, AlignmentType.CENTER), { fill: ctx.cabeceraColor, ancho: 14 }),
          ]),
          ...b.filas.map((f) =>
            fila([
              celda(
                [new Paragraph({ children: [new TextRun({ text: `${f.codigo} `, bold: true }), new TextRun({ text: f.descripcion })] })],
                { ancho: 26 },
              ),
              celda(parrafosDash(f.habilidades), { ancho: 14 }),
              // Experiencias a nivel de bloque: van en la 1ª fila; el resto en blanco (no '—').
              celda(parrafosLista(f.experiencias, ''), { ancho: 46 }),
              celda(parrafosLista(f.evaluacion, ''), { ancho: 14 }),
            ]),
          ),
        ]),
      ];
  }
}

// --- helpers de docx ---

/** Grilla de pares etiqueta/valor (el encabezado): `pares` por fila (3 horizontal, 2 vertical). */
function grillaCampos(filas: ReadonlyArray<{ etiqueta: string; valor: string }>, ctx: CtxRender): Table {
  const pares = ctx.landscape ? 3 : 2;
  const anchoEtq = ctx.landscape ? 11 : 16;
  const anchoVal = ctx.landscape ? 22 : 34;
  const rows: TableRow[] = [];
  for (let i = 0; i < filas.length; i += pares) {
    const grupo = filas.slice(i, i + pares);
    const cells: TableCell[] = [];
    for (const f of grupo) {
      cells.push(celda(parrafosTexto(f.etiqueta, true), { fill: ctx.colorEtiqueta, ancho: anchoEtq }));
      cells.push(celda(parrafosTexto(f.valor.length > 0 ? f.valor : '—'), { ancho: anchoVal }));
    }
    // Rellena la última fila para que las columnas cuadren.
    while (cells.length < pares * 2) {
      const esEtiqueta = cells.length % 2 === 0;
      cells.push(celda([vacio()], { ancho: esEtiqueta ? anchoEtq : anchoVal }));
    }
    rows.push(fila(cells));
  }
  return tabla(rows);
}

/** Opciones de checkbox en una grilla SIN bordes de `cols` columnas (compacta — p. ej. Recursos). */
function grillaOpciones(opciones: ReadonlyArray<{ etiqueta: string; marcado: boolean }>, cols: number): Table {
  const ancho = Math.floor(100 / cols);
  const rows: TableRow[] = [];
  for (let i = 0; i < opciones.length; i += cols) {
    const grupo = opciones.slice(i, i + cols);
    const cells = grupo.map((o) => celda([parrafoOpcion(o.etiqueta, o.marcado)], { ancho }));
    while (cells.length < cols) cells.push(celda([vacio()], { ancho }));
    rows.push(fila(cells));
  }
  if (rows.length === 0) rows.push(fila([celda([new Paragraph({ children: [new TextRun('—')] })])]));
  return tablaSinBordes(rows);
}

/** Lista numerada en una sola línea: "1 Item   2 Item   3 Item" (Principios DUA del Formato B). */
function listaEnLinea(items: readonly string[]): Paragraph {
  if (items.length === 0) return new Paragraph({ children: [new TextRun('—')] });
  const runs: TextRun[] = [];
  items.forEach((it, idx) => {
    if (idx > 0) runs.push(new TextRun({ text: '\t' }));
    runs.push(new TextRun({ text: `${idx + 1} `, bold: true }));
    runs.push(new TextRun({ text: it }));
  });
  return new Paragraph({ spacing: { after: 80 }, children: runs });
}

function parrafoOpcion(etiqueta: string, marcado: boolean): Paragraph {
  return new Paragraph({ children: [new TextRun(`${marcado ? CHK : UNCHK} ${etiqueta}`)] });
}

function parrafosTexto(
  texto: string,
  bold = false,
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType],
): Paragraph[] {
  return [new Paragraph({ ...(alignment !== undefined ? { alignment } : {}), children: [new TextRun({ text: texto, bold })] })];
}

/** Lista vertical con guiones (las Habilidades del Formato B: "-Comprender / -Aplicar / …"). */
function parrafosDash(items: readonly string[]): Paragraph[] {
  if (items.length === 0) return [vacio()];
  return items.map((t) => new Paragraph({ children: [new TextRun(`-${t}`)] }));
}

function parrafosLista(items: readonly string[], placeholderVacio = '—'): Paragraph[] {
  if (items.length === 0) return [new Paragraph({ children: [new TextRun(placeholderVacio)] })];
  return items.map((t) => new Paragraph({ text: t, bullet: { level: 0 } }));
}

function vacio(): Paragraph {
  return new Paragraph({ children: [new TextRun('')] });
}

function celda(children: Paragraph[], opc: { fill?: string; ancho?: number; colSpan?: number } = {}): TableCell {
  return new TableCell({
    children,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    ...(opc.fill !== undefined ? { shading: { fill: opc.fill, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    ...(opc.ancho !== undefined ? { width: { size: opc.ancho, type: WidthType.PERCENTAGE } } : {}),
    ...(opc.colSpan !== undefined ? { columnSpan: opc.colSpan } : {}),
  });
}

function fila(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells });
}

function tabla(rows: TableRow[]): Table {
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDES_TABLA });
}

function tablaSinBordes(rows: TableRow[]): Table {
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: SIN_BORDES });
}

/**
 * Nombre de archivo seguro a partir de asignatura/nivel/formato (sin tildes ni símbolos). Se le
 * adjunta `idDocumento` para que dos documentos distintos con la misma asignatura/nivel/formato no
 * compartan ruta en la carpeta de salida y se pisen al exportar concurrentemente.
 */
function nombreArchivo(plan: PlanificacionUnidad, idDocumento?: string): string {
  const sufijo = idDocumento !== undefined ? `-${idDocumento}` : '';
  const base = `planificacion-${plan.asignatura}-${plan.nivel}-formato-${plan.plantilla}${sufijo}`;
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'planificacion';
}
