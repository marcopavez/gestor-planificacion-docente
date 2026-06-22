// packages/infra-export/src/pptx/PptxExportAdapter.ts
// Implementa ExportPort.exportarPptx: renderiza un ClaseDeck del dominio a .pptx (RF-2.8/2.17; INV-6).
// El adapter es reemplazable tras el puerto; la cascada no conoce pptxgenjs.

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ArchivoExportado,
  ClaseDeck,
  ExportPort,
  SlideDeckType,
  TemaDeckInfantilType,
} from '@faro/domain';
// Valores (no tipos): resuelven el tópico de imagen del banco a una entrada del catálogo (INV-6).
import { resolverImagen, tramoDeNivel } from '@faro/domain';
import type { Logger } from '@faro/observability';
// pptxgenjs es CJS (`module.exports = PptxGenJS`) con tipos `export default`: bajo NodeNext el
// default import liga al namespace, así que tomamos la clase desde `.default` (válido en types y runtime).
import * as PptxGenJSModule from 'pptxgenjs';

const PptxGenJS = PptxGenJSModule.default;
type Pptx = InstanceType<typeof PptxGenJS>;

export const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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
    // Dir raíz de los PNG del banco de imágenes. Default: assets del propio paquete infra-export.
    // En producción (código compilado en dist/) los roots pasan la ruta explícita (ver spec/plan).
    private readonly dirAssets: string = fileURLToPath(new URL('../../assets/imagenes', import.meta.url)),
  ) {}

  async exportarPptx(deck: ClaseDeck): Promise<ArchivoExportado> {
    const pptx = new PptxGenJS();
    pptx.author = 'Faro';
    pptx.company = 'Faro';
    pptx.title = deck.titulo;
    pptx.subject = `${deck.asignatura} · ${deck.nivel}`;

    // Theming data-driven (Fase 3): con `tema` → render infantil con su paleta/fuente/tamaño y por
    // tipo de slide; sin `tema` → render institucional intacto (la cascada/worker no cambian).
    if (deck.tema) {
      this.portadaInfantil(pptx, deck, deck.tema);
      for (const slide of deck.slides) {
        this.slideInfantil(pptx, slide, deck.tema, deck);
      }
    } else {
      this.portada(pptx, deck);
      for (const slide of deck.slides) {
        this.slideContenido(pptx, slide);
      }
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
    slide.addNotes(this.notas(s));
  }

  /** Notas del orador: notas docente + sugerencia de imagen si la hay. */
  private notas(s: SlideDeckType): string {
    return s.sugerencia_imagen
      ? `${s.notas_docente}\n\nSugerencia de imagen: ${s.sugerencia_imagen}`
      : s.notas_docente;
  }

  /**
   * Placeholder de imagen VISIBLE (Fase 3, solo render infantil): cuando el slide trae
   * `sugerencia_imagen`, se dibuja una caja con borde punteado (color acento del tema) rotulada
   * "IMAGEN: <sugerencia>". No se inserta una imagen real; es una guía para el docente en la lámina.
   * La sugerencia sigue además en las notas del orador (this.notas).
   */
  private placeholderImagen(
    slide: ReturnType<Pptx['addSlide']>,
    s: SlideDeckType,
    tema: TemaDeckInfantilType,
    deck: ClaseDeck,
  ): void {
    // 1) Imagen real del banco: la IA eligió un topico_imagen del catálogo → lo resolvemos (color).
    // Seed = título del deck → selección determinista y reproducible para ese documento.
    if (s.topico_imagen) {
      const entrada = resolverImagen(s.topico_imagen, deck.asignatura, tramoDeNivel(deck.nivel), 'color', deck.titulo);
      const ruta = entrada ? join(this.dirAssets, entrada.archivo) : null;
      // existsSync: el catálogo puede anunciar un tópico cuyo PNG aún no está en disco (set sin curar);
      // degradamos al placeholder en vez de romper el export (pptxgenjs falla si el path no existe).
      if (ruta && existsSync(ruta)) {
        // pptxgenjs lee el archivo al escribir; le pasamos la ruta absoluta (dirAssets + relativo).
        slide.addImage({ path: ruta, x: 3.0, y: 2.0, w: 4.0, h: 2.6, sizing: { type: 'contain', w: 4.0, h: 2.6 } });
        return;
      }
    }
    // 2) Fallback: el placeholder punteado de siempre (sin tópico, o el tópico no resuelve a imagen).
    const sugerencia = s.sugerencia_imagen?.trim();
    if (!sugerencia) return;
    // y+h debe caber en el layout 16:9 (10" x 5.625"): y:4.3 + h:1.0 = 5.3" (antes 5.0+1.2=6.2 se salía).
    slide.addText(`IMAGEN: ${sugerencia}`, {
      x: 1.0,
      y: 4.3,
      w: 8,
      h: 1.0,
      fontSize: 14,
      fontFace: tema.fuente.cuerpo,
      align: 'center',
      valign: 'middle',
      color: tema.paleta.acento,
      // Borde punteado en color acento para que la caja se vea como un recuadro de "falta imagen".
      line: { color: tema.paleta.acento, width: 1.5, dashType: 'dash' },
    });
  }

  // --- Render infantil data-driven (Fase 3): la paleta/fuente/tamaño salen del `tema` del deck ---

  /**
   * Fondo del slide infantil. Con `tema.paleta.borde` (tramo 5-6, refs MINEDUC) pinta un MARCO a sangre:
   * fondo del color del borde + una tarjeta interior del color `fondo` sobre la que va el contenido (look
   * color-por-asignatura). Sin `borde` (1-2/3-4) deja el fondo plano — backward-compatible. Llamar ANTES
   * de añadir texto para que el contenido quede por encima de la tarjeta. Margen 0.22" en el lienzo 10×5.625".
   */
  private fondoInfantil(pptx: Pptx, slide: ReturnType<Pptx['addSlide']>, tema: TemaDeckInfantilType): void {
    const borde = tema.paleta.borde;
    if (!borde) {
      slide.background = { color: tema.paleta.fondo };
      return;
    }
    slide.background = { color: borde };
    // ShapeType vive en la INSTANCIA de pptxgenjs (no en la clase default-exportada).
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.22,
      y: 0.22,
      w: 9.56,
      h: 5.185,
      fill: { color: tema.paleta.fondo },
      line: { type: 'none' },
    });
  }

  /** Portada infantil: usa la paleta y fuente del tema; mantiene el sello de borrador (HIL — INV-3). */
  private portadaInfantil(pptx: Pptx, deck: ClaseDeck, tema: TemaDeckInfantilType): void {
    const slide = pptx.addSlide();
    this.fondoInfantil(pptx, slide, tema);
    slide.addText(deck.titulo, {
      x: 0.5,
      y: 1.4,
      w: 9,
      h: 1.6,
      fontSize: tema.tamano.titulo,
      fontFace: tema.fuente.titulo,
      bold: true,
      align: 'center',
      color: tema.paleta.primario,
    });
    slide.addText(`${deck.asignatura} · ${deck.nivel}`, {
      x: 0.5,
      y: 3.1,
      w: 9,
      h: 0.6,
      fontSize: tema.tamano.cuerpo,
      fontFace: tema.fuente.cuerpo,
      align: 'center',
      color: tema.paleta.texto,
    });
    if (deck.oa.length > 0) {
      slide.addText(`OA: ${deck.oa.join(', ')}`, {
        x: 0.5,
        y: 3.9,
        w: 9,
        h: 0.6,
        fontSize: 14,
        fontFace: tema.fuente.cuerpo,
        italic: true,
        align: 'center',
        color: tema.paleta.secundario,
      });
    }
    slide.addText('Borrador generado por Faro · requiere revisión docente', {
      x: 0.5,
      y: 4.9,
      w: 9,
      h: 0.4,
      fontSize: 10,
      fontFace: tema.fuente.cuerpo,
      align: 'center',
      color: tema.paleta.texto,
    });
  }

  /** Despacha por tipo de slide (Fase 3); la respuesta correcta nunca se revela en la lámina del alumno. */
  private slideInfantil(pptx: Pptx, s: SlideDeckType, tema: TemaDeckInfantilType, deck: ClaseDeck): void {
    switch (s.tipo) {
      case 'pregunta':
      case 'elige':
        this.slideInteraccion(pptx, s, tema, deck);
        break;
      case 'que_sigue':
        this.slideQueSigue(pptx, s, tema, deck);
        break;
      default:
        this.slideContenidoInfantil(pptx, s, tema, deck);
    }
  }

  /** Lámina con la banda de momento teñida por el tema; reutilizada por contenido/¿qué sigue?. */
  private slideBaseInfantil(pptx: Pptx, s: SlideDeckType, tema: TemaDeckInfantilType): ReturnType<Pptx['addSlide']> {
    const slide = pptx.addSlide();
    this.fondoInfantil(pptx, slide, tema);
    const m = MOMENTO[s.momento];
    // La banda de momento se tiñe con el acento del tema (no inventamos secciones nuevas).
    slide.addText(m.etiqueta, {
      x: 0.5,
      y: 0.3,
      w: 3,
      h: 0.4,
      fontSize: 14,
      fontFace: tema.fuente.cuerpo,
      bold: true,
      color: tema.paleta.acento,
    });
    return slide;
  }

  /** 'contenido': título grande + viñetas grandes con la paleta/fuente/tamaño del tema. */
  private slideContenidoInfantil(pptx: Pptx, s: SlideDeckType, tema: TemaDeckInfantilType, deck: ClaseDeck): void {
    const slide = this.slideBaseInfantil(pptx, s, tema);
    slide.addText(s.titulo, {
      x: 0.5,
      y: 0.8,
      w: 9,
      h: 1.1,
      fontSize: tema.tamano.titulo,
      fontFace: tema.fuente.titulo,
      bold: true,
      color: tema.paleta.primario,
    });
    if (s.contenido.length > 0) {
      slide.addText(
        s.contenido.map((t) => ({ text: t, options: { bullet: true } })),
        {
          x: 0.7,
          y: 2.1,
          w: 8.6,
          h: 3,
          fontSize: tema.tamano.cuerpo,
          fontFace: tema.fuente.cuerpo,
          color: tema.paleta.texto,
          valign: 'top',
          lineSpacingMultiple: 1.3,
        },
      );
    }
    this.placeholderImagen(slide, s, tema, deck);
    slide.addNotes(this.notas(s));
  }

  /** '¿Qué sigue?': título grande centrado + el contenido como pistas grandes y centradas. */
  private slideQueSigue(pptx: Pptx, s: SlideDeckType, tema: TemaDeckInfantilType, deck: ClaseDeck): void {
    const slide = this.slideBaseInfantil(pptx, s, tema);
    slide.addText(s.titulo, {
      x: 0.5,
      y: 1.0,
      w: 9,
      h: 1.4,
      fontSize: tema.tamano.titulo,
      fontFace: tema.fuente.titulo,
      bold: true,
      align: 'center',
      color: tema.paleta.primario,
    });
    if (s.contenido.length > 0) {
      slide.addText(s.contenido.join('\n'), {
        x: 0.7,
        y: 2.6,
        w: 8.6,
        h: 2.4,
        fontSize: tema.tamano.cuerpo,
        fontFace: tema.fuente.cuerpo,
        align: 'center',
        color: tema.paleta.texto,
        valign: 'top',
        lineSpacingMultiple: 1.3,
      });
    }
    this.placeholderImagen(slide, s, tema, deck);
    slide.addNotes(this.notas(s));
  }

  /** 'pregunta'/'elige': la pregunta GRANDE centrada + opciones; la correcta SOLO en notas_docente. */
  private slideInteraccion(pptx: Pptx, s: SlideDeckType, tema: TemaDeckInfantilType, deck: ClaseDeck): void {
    const slide = pptx.addSlide();
    this.fondoInfantil(pptx, slide, tema);
    // El ENUNCIADO de la pregunta va en color consigna (rojo) como en los PPT reales del colegio.
    slide.addText(s.titulo, {
      x: 0.5,
      y: 0.9,
      w: 9,
      h: 1.6,
      fontSize: tema.tamano.titulo,
      fontFace: tema.fuente.titulo,
      bold: true,
      align: 'center',
      color: tema.paleta.consigna,
    });
    if (s.opciones.length > 0) {
      // Solo el texto de cada opción: NO se revela la correcta en la lámina del alumno (va en notas).
      slide.addText(
        s.opciones.map((o) => ({ text: o.texto, options: { bullet: true } })),
        {
          x: 1.0,
          y: 2.7,
          w: 8,
          h: 2.4,
          fontSize: tema.tamano.cuerpo,
          fontFace: tema.fuente.cuerpo,
          color: tema.paleta.texto,
          valign: 'top',
          lineSpacingMultiple: 1.4,
        },
      );
    }
    this.placeholderImagen(slide, s, tema, deck);
    // La respuesta correcta y las notas docentes van en el orador (HIL); nunca en la slide del alumno.
    const correctas = s.opciones.filter((o) => o.correcta).map((o) => o.texto);
    const lineaCorrecta = correctas.length > 0 ? `Respuesta correcta: ${correctas.join(', ')}` : '';
    const notas = [this.notas(s), lineaCorrecta].filter((linea) => linea.length > 0).join('\n\n');
    slide.addNotes(notas);
  }
}
