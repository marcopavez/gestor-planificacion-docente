// packages/infra-export/src/pptx/PptxExportAdapter.ts
// Implementa ExportPort.exportarPptx: renderiza un ClaseDeck del dominio a .pptx (RF-2.8/2.17; INV-6).
// El adapter es reemplazable tras el puerto; la cascada no conoce pptxgenjs.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchivoExportado, ClaseDeck, ExportPort, SlideDeckType } from '@faro/domain';
import type { Logger } from '@faro/observability';
// pptxgenjs es CJS (`module.exports = PptxGenJS`) con tipos `export default`: bajo NodeNext el
// default import liga al namespace, así que tomamos la clase desde `.default` (válido en types y runtime).
import * as PptxGenJSModule from 'pptxgenjs';

const PptxGenJS = PptxGenJSModule.default;
type Pptx = InstanceType<typeof PptxGenJS>;

const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

type SlideMomento = SlideDeckType['momento'];

// Etiqueta + color por momento didáctico (inicio/desarrollo/cierre — guía MINEDUC §6).
const MOMENTO: Record<SlideMomento, { etiqueta: string; color: string }> = {
  inicio: { etiqueta: 'INICIO', color: '2E7D32' },
  desarrollo: { etiqueta: 'DESARROLLO', color: '1565C0' },
  cierre: { etiqueta: 'CIERRE', color: 'C62828' },
};

/** Nombre de archivo seguro a partir del título (sin tildes ni caracteres especiales). */
function slugify(titulo: string): string {
  const slug = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'deck';
}

export class PptxExportAdapter implements ExportPort {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
  ) {}

  async exportarPptx(deck: ClaseDeck): Promise<ArchivoExportado> {
    const pptx = new PptxGenJS();
    pptx.author = 'Faro';
    pptx.company = 'Faro';
    pptx.title = deck.titulo;
    pptx.subject = `${deck.asignatura} · ${deck.nivel}`;

    this.portada(pptx, deck);
    for (const slide of deck.slides) {
      this.slideContenido(pptx, slide);
    }

    // nodebuffer da el Buffer directamente; escribimos nosotros para controlar ruta y contar bytes.
    const data = await pptx.write({ outputType: 'nodebuffer' });
    if (!Buffer.isBuffer(data)) {
      throw new Error('PptxExportAdapter: pptxgenjs no devolvió un Buffer (outputType nodebuffer).');
    }

    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${slugify(deck.titulo)}.pptx`);
    await writeFile(ruta, data);

    this.log.info({ ruta, bytes: data.length, slides: deck.slides.length }, 'export.pptx');
    return { ruta, mime: MIME_PPTX, bytes: data.length };
  }

  /** Portada: título, asignatura/nivel, OA y sello de borrador (HIL — INV-3). */
  private portada(pptx: Pptx, deck: ClaseDeck): void {
    const slide = pptx.addSlide();
    slide.background = { color: 'F4F6F8' };
    slide.addText(deck.titulo, { x: 0.5, y: 1.4, w: 9, h: 1.2, fontSize: 32, bold: true, color: '1A237E' });
    slide.addText(`${deck.asignatura} · ${deck.nivel}`, { x: 0.5, y: 2.6, w: 9, h: 0.6, fontSize: 18, color: '37474F' });
    if (deck.oa.length > 0) {
      slide.addText(`OA: ${deck.oa.join(', ')}`, { x: 0.5, y: 3.3, w: 9, h: 0.6, fontSize: 14, italic: true, color: '546E7A' });
    }
    slide.addText('Borrador generado por Faro · requiere revisión docente', {
      x: 0.5,
      y: 4.9,
      w: 9,
      h: 0.4,
      fontSize: 10,
      color: '90A4AE',
    });
  }

  /** Una lámina por slide: etiqueta de momento, título, viñetas y notas del docente. */
  private slideContenido(pptx: Pptx, s: SlideDeckType): void {
    const slide = pptx.addSlide();
    const m = MOMENTO[s.momento];
    slide.addText(m.etiqueta, { x: 0.5, y: 0.3, w: 3, h: 0.4, fontSize: 12, bold: true, color: m.color });
    slide.addText(s.titulo, { x: 0.5, y: 0.8, w: 9, h: 0.9, fontSize: 26, bold: true, color: '212121' });
    if (s.contenido.length > 0) {
      slide.addText(
        s.contenido.map((t) => ({ text: t, options: { bullet: true } })),
        { x: 0.7, y: 1.9, w: 8.6, h: 3, fontSize: 18, color: '263238', valign: 'top', lineSpacingMultiple: 1.2 },
      );
    }
    // Las sugerencias de imagen van en las notas del orador (no se renderiza la imagen en el demo).
    const notas = s.sugerencia_imagen
      ? `${s.notas_docente}\n\nSugerencia de imagen: ${s.sugerencia_imagen}`
      : s.notas_docente;
    slide.addNotes(notas);
  }
}
