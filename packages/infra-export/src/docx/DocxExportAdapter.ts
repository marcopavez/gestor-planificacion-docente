// packages/infra-export/src/docx/DocxExportAdapter.ts
// H-2.5 · Renderiza la Planificación de Unidad a .docx (RF-2.9, INV-6). El layout se deriva 1:1 del
// IR (plano.ts), que a su vez calca la `definicion` de la plantilla activa (tablas del PDF real).
// Editable por el docente; el .pdf (H-2.6) reusa este .docx. El adapter es reemplazable tras el puerto.

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
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { planoDocumento, type BloquePlano, type DocumentoPlano } from './plano.js';

export const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const CHK = '☒';
const UNCHK = '☐';

const BORDE = { style: BorderStyle.SINGLE, size: 1, color: '999999' } as const;
const BORDES_TABLA = {
  top: BORDE,
  bottom: BORDE,
  left: BORDE,
  right: BORDE,
  insideHorizontal: BORDE,
  insideVertical: BORDE,
};

export class DocxExportAdapter {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
  ) {}

  async aDocx(
    plan: PlanificacionUnidad,
    plantilla: PlantillaPlanificacion,
    catalogos: CatalogosPlanificacion,
  ): Promise<ArchivoExportado> {
    const plano = planoDocumento(plan, plantilla, catalogos);
    const doc = construirDocumento(plano);

    const data = await Packer.toBuffer(doc);
    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${nombreArchivo(plan)}.docx`);
    await writeFile(ruta, data);

    this.log.info({ ruta, bytes: data.length, secciones: plano.secciones.length }, 'export.docx');
    return { ruta, mime: MIME_DOCX, bytes: data.length };
  }
}

/** Construye el documento `docx` a partir del IR. Exportado para tests de estructura. */
export function construirDocumento(plano: DocumentoPlano): Document {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: plano.titulo, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Borrador generado por Faro · requiere revisión docente (HIL)',
          italics: true,
          color: '888888',
        }),
      ],
    }),
  ];

  for (const seccion of plano.secciones) {
    children.push(new Paragraph({ text: seccion.titulo, heading: HeadingLevel.HEADING_1 }));
    for (const bloque of seccion.bloques) {
      children.push(...renderBloque(bloque));
    }
  }

  return new Document({ sections: [{ children }] });
}

function renderBloque(b: BloquePlano): Array<Paragraph | Table> {
  switch (b.tipo) {
    case 'campos':
      return [
        tabla(
          b.filas.map((f) => fila([celda(parrafosTexto(f.etiqueta, true)), celda(parrafosTexto(f.valor))])),
        ),
      ];
    case 'parrafo':
      return [new Paragraph({ children: [new TextRun(b.texto.length > 0 ? b.texto : '—')] })];
    case 'lista':
      return b.items.length > 0
        ? b.items.map((t) => new Paragraph({ text: t, bullet: { level: 0 } }))
        : [new Paragraph({ children: [new TextRun('—')] })];
    case 'checkbox':
      return [
        new Paragraph({ children: [new TextRun({ text: b.titulo, bold: true })] }),
        ...b.opciones.map((o) => parrafoOpcion(o.etiqueta, o.marcado)),
      ];
    case 'checkbox_matriz':
      return [
        tabla([
          fila(b.columnas.map((c) => celda(parrafosTexto(c.titulo, true)))),
          fila(b.columnas.map((c) => celda(c.opciones.map((o) => parrafoOpcion(o.etiqueta, o.marcado))))),
        ]),
      ];
    case 'tabla_oa_a':
      return [
        tabla([
          fila([celda(parrafosTexto('Categoría', true)), celda(parrafosTexto('Código', true)), celda(parrafosTexto('Objetivo de Aprendizaje', true))]),
          ...b.filas.map((f) =>
            fila([celda(parrafosTexto(f.categoria)), celda(parrafosTexto(f.codigo)), celda(parrafosTexto(f.descripcion))]),
          ),
        ]),
      ];
    case 'tabla_oa_b':
      return [
        tabla([
          fila([
            celda(parrafosTexto('Objetivo de Aprendizaje Priorizado', true)),
            celda(parrafosTexto('Habilidades', true)),
            celda(parrafosTexto('Experiencias de Aprendizaje/Actividades', true)),
            celda(parrafosTexto('Evaluación', true)),
          ]),
          ...b.filas.map((f) =>
            fila([
              celda(parrafosTexto(f.oa)),
              celda(parrafosTexto(f.habilidades)),
              celda(parrafosLista(f.experiencias)),
              celda(parrafosLista(f.evaluacion)),
            ]),
          ),
        ]),
      ];
  }
}

// --- helpers de docx ---

function parrafoOpcion(etiqueta: string, marcado: boolean): Paragraph {
  return new Paragraph({ children: [new TextRun(`${marcado ? CHK : UNCHK} ${etiqueta}`)] });
}

function parrafosTexto(texto: string, bold = false): Paragraph[] {
  return [new Paragraph({ children: [new TextRun({ text: texto, bold })] })];
}

function parrafosLista(items: readonly string[]): Paragraph[] {
  if (items.length === 0) return [new Paragraph({ children: [new TextRun('—')] })];
  return items.map((t) => new Paragraph({ text: t, bullet: { level: 0 } }));
}

function celda(children: Paragraph[]): TableCell {
  return new TableCell({ children });
}

function fila(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells });
}

function tabla(rows: TableRow[]): Table {
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDES_TABLA, alignment: AlignmentType.CENTER });
}

/** Nombre de archivo seguro a partir de asignatura/nivel/formato (sin tildes ni símbolos). */
function nombreArchivo(plan: PlanificacionUnidad): string {
  const base = `planificacion-${plan.asignatura}-${plan.nivel}-formato-${plan.plantilla}`;
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'planificacion';
}
