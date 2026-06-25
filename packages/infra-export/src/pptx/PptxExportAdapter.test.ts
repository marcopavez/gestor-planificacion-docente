import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { SchemaClaseDeck, TEMAS_DECK_INFANTIL, temaDeckInfantil, type ClaseDeck } from '@faro/domain';
import { logger } from '@faro/observability';
import { describe, expect, it } from 'vitest';
import { PptxExportAdapter } from './PptxExportAdapter.js';

// Sample real generado por Claude (modo demo): samples/aula-matematica-1b/clase-deck.json.
const SAMPLE = fileURLToPath(new URL('../../../../samples/aula-matematica-1b/clase-deck.json', import.meta.url));

/**
 * Extrae una parte de un .pptx (zip OOXML) SIN dependencias externas (jszip/fflate no están en el
 * árbol del paquete). Lee el directorio central del zip y descomprime (deflate) la entrada pedida.
 * Mismo enfoque que el test de DocxExportAdapter — aquí leemos las slides XML para asertar el LOOK.
 */
function partePptx(buf: Buffer, parte: string): string {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip sin EOCD');
  let off = buf.readUInt32LE(eocd + 16);
  const total = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < total; n++) {
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const nombre = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (nombre === parte) {
      const lhNameLen = buf.readUInt16LE(localOff + 26);
      const lhExtraLen = buf.readUInt16LE(localOff + 28);
      const ini = localOff + 30 + lhNameLen + lhExtraLen;
      const comp = buf.subarray(ini, ini + compSize);
      return (method === 0 ? comp : inflateRawSync(comp)).toString('utf8');
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${parte} no encontrado`);
}

/** Lista los nombres de las entradas del zip (para descubrir cuántas slides/notas hay). */
function entradasPptx(buf: Buffer): string[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip sin EOCD');
  let off = buf.readUInt32LE(eocd + 16);
  const total = buf.readUInt16LE(eocd + 10);
  const nombres: string[] = [];
  for (let n = 0; n < total; n++) {
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    nombres.push(buf.toString('utf8', off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return nombres;
}

/** Concatena todas las slides XML del .pptx (ppt/slides/slideN.xml) en un solo string. */
function todasLasSlides(buf: Buffer): string {
  return entradasPptx(buf)
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .map((e) => partePptx(buf, e))
    .join('\n');
}

/** Concatena todas las notas del orador (ppt/notesSlides/notesSlideN.xml). */
function todasLasNotas(buf: Buffer): string {
  return entradasPptx(buf)
    .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))
    .map((e) => partePptx(buf, e))
    .join('\n');
}

describe('PptxExportAdapter (RF-2.8, CA-2.12)', () => {
  it('renderiza un ClaseDeck válido a un .pptx abrible', async () => {
    const deck = SchemaClaseDeck.parse(JSON.parse(await readFile(SAMPLE, 'utf8')));
    const dir = join(tmpdir(), 'faro-pptx-test');
    const adapter = new PptxExportAdapter(dir, logger);

    const archivo = await adapter.exportarPptx(deck);

    expect(archivo.mime).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(archivo.bytes).toBeGreaterThan(0);
    expect(archivo.ruta.endsWith('.pptx')).toBe(true);

    const bytes = await readFile(archivo.ruta);
    expect(bytes.length).toBe(archivo.bytes);
    // Un .pptx es un contenedor ZIP (OOXML): debe comenzar con la firma 'PK'.
    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
  });

  // BACKWARD-COMPAT: un deck SIN `tema` sigue saliendo con el look institucional (la cascada/worker no
  // cambian). Aseveramos que NO aparece ninguna paleta infantil en las slides.
  it('sin tema: mantiene el render institucional (sin colores de paleta infantil)', async () => {
    const deck = SchemaClaseDeck.parse(JSON.parse(await readFile(SAMPLE, 'utf8')));
    const dir = join(tmpdir(), 'faro-pptx-test');
    const adapter = new PptxExportAdapter(dir, logger);

    const archivo = await adapter.exportarPptx(deck);
    const xml = todasLasSlides(await readFile(archivo.ruta));

    // El azul institucional de la portada sigue presente; ningún color de los temas infantiles aparece.
    expect(xml).toContain('1A237E'); // azul institucional del título de portada
    for (const tramo of ['1-2', '3-4', '5-6'] as const) {
      expect(xml).not.toContain(TEMAS_DECK_INFANTIL[tramo].paleta.primario);
    }
  });

  // Deck CON tema infantil: las slides salen con la paleta/fuente del tema y los slides de interacción
  // ('pregunta'/'elige') NO revelan la correcta (va a notas del orador).
  it('con tema infantil: aplica paleta/fuente del tema y oculta la respuesta correcta en la slide', async () => {
    const tema = TEMAS_DECK_INFANTIL['1-2'];
    const deck: ClaseDeck = SchemaClaseDeck.parse({
      titulo: 'Clase 1 · Los números',
      asignatura: 'Matemática',
      nivel: '1º básico',
      oa: ['MA01 OA 03'],
      tramo_edad: '1-2',
      tema,
      slides: [
        {
          momento: 'inicio',
          tipo: 'contenido',
          titulo: '¿Cuántos hay?',
          contenido: ['Contemos juntos del 0 al 10.'],
          notas_docente: 'Rutina de conteo.',
        },
        {
          momento: 'desarrollo',
          tipo: 'pregunta',
          titulo: '¿Qué número es mayor?',
          contenido: [],
          opciones: [
            { texto: 'El 3', correcta: false },
            { texto: 'El 7', correcta: true },
          ],
          notas_docente: 'Levantar la mano y elegir.',
          imagen: 'dos grupos de fichas, uno con 3 y otro con 7',
        },
        {
          momento: 'desarrollo',
          tipo: 'elige',
          titulo: 'Elige la representación correcta del 5',
          contenido: [],
          opciones: [
            { texto: 'Cinco círculos', correcta: true },
            { texto: 'Tres círculos', correcta: false },
          ],
          notas_docente: 'Discutir en parejas.',
        },
        {
          momento: 'cierre',
          tipo: 'que_sigue',
          titulo: '¿Qué sigue?',
          contenido: ['La próxima clase contamos hasta el 20.'],
          notas_docente: 'Anticipar la siguiente clase.',
        },
      ],
    });
    const dir = join(tmpdir(), 'faro-pptx-test');
    const adapter = new PptxExportAdapter(dir, logger);

    const archivo = await adapter.exportarPptx(deck);
    const buf = await readFile(archivo.ruta);
    const slidesXml = todasLasSlides(buf);
    const notasXml = todasLasNotas(buf);

    // El LOOK viene del tema: aparecen su color primario (títulos), el fondo y la fuente.
    expect(slidesXml).toContain(tema.paleta.primario); // 1F6F8B (azul cálido del tramo 1-2)
    expect(slidesXml).toContain(tema.paleta.fondo); // FDF6E3
    expect(slidesXml).toContain('Comic Sans MS'); // fuente del tema 1-2
    // El azul institucional ya NO aparece (es render infantil, no el de la cascada).
    expect(slidesXml).not.toContain('1A237E');

    // F3-3(a): el ENUNCIADO de 'pregunta'/'elige' va en el color consigna (rojo) de los PPT reales.
    expect(slidesXml).toContain(tema.paleta.consigna); // E2231A

    // Los slides de interacción listan las opciones en la slide del alumno…
    expect(slidesXml).toContain('El 7');
    expect(slidesXml).toContain('Cinco círculos');
    // …pero la palabra clave "Respuesta correcta" NUNCA va en la slide (solo en notas del orador).
    expect(slidesXml).not.toContain('Respuesta correcta');
    expect(notasXml).toContain('Respuesta correcta: El 7');
    expect(notasXml).toContain('Respuesta correcta: Cinco círculos');

    // F3-3(b): cuando el slide trae `imagen` (descripción) sin PNG resuelto, la slide muestra el
    // placeholder VISIBLE "IMAGEN: …" como guía. Las notas del orador YA NO llevan la sugerencia (#7).
    expect(slidesXml).toContain('IMAGEN: dos grupos de fichas, uno con 3 y otro con 7');
    expect(notasXml).not.toContain('Sugerencia de imagen');
  });

  // Deck 5-6 (tema con `borde`): el render pinta el MARCO a sangre con el color de la asignatura
  // (color-por-asignatura MINEDUC) sobre una tarjeta interior blanca. El acento neutro por defecto del
  // tramo (06ABD8) NO debe aparecer: prueba que el acento se tiñó por asignatura (Matemática → E92B91).
  it('con tema 5-6 (borde): pinta el marco a sangre del color de la asignatura sobre tarjeta blanca', async () => {
    const tema = temaDeckInfantil('5º básico', 'Matemática');
    expect(tema.paleta.borde).toBe('E92B91'); // sanity: acento+marco de Matemática
    const deck: ClaseDeck = SchemaClaseDeck.parse({
      titulo: 'Clase 5° · Valor posicional',
      asignatura: 'Matemática',
      nivel: '5º básico',
      oa: ['MA05 OA 01'],
      tramo_edad: '5-6',
      tema,
      slides: [
        {
          momento: 'inicio',
          tipo: 'contenido',
          titulo: 'Valor posicional',
          contenido: ['Repasemos los números hasta los millones.'],
          notas_docente: 'Activar conocimientos previos.',
        },
      ],
    });
    const dir = join(tmpdir(), 'faro-pptx-test');
    const adapter = new PptxExportAdapter(dir, logger);

    const archivo = await adapter.exportarPptx(deck);
    const xml = todasLasSlides(await readFile(archivo.ruta));

    // Marco a sangre del color de la asignatura + tarjeta interior blanca.
    expect(xml).toContain('E92B91'); // magenta de Matemática (fondo del marco / acento)
    expect(xml).toContain('FFFFFF'); // tarjeta interior blanca
    // El acento neutro por defecto del tramo 5-6 NO aparece → el acento se tiñó por asignatura.
    expect(xml).not.toContain('06ABD8');
  });

  // BACKWARD-COMPAT del placeholder: el camino institucional (deck SIN `tema`) NO dibuja el recuadro
  // "IMAGEN: …" en la slide y, tras #7, tampoco manda ninguna sugerencia a las notas del orador.
  it('sin tema: ignora la imagen (sin caja "IMAGEN:") y no la lleva a las notas', async () => {
    const deck: ClaseDeck = SchemaClaseDeck.parse({
      titulo: 'Clase institucional',
      asignatura: 'Matemática',
      nivel: '1º básico',
      oa: ['MA01 OA 03'],
      slides: [
        {
          momento: 'inicio',
          tipo: 'contenido',
          titulo: 'Conteo',
          contenido: ['Contemos del 0 al 10.'],
          notas_docente: 'Rutina de conteo.',
          imagen: 'una recta numérica del 0 al 10',
        },
      ],
    });
    const dir = join(tmpdir(), 'faro-pptx-test');
    const adapter = new PptxExportAdapter(dir, logger);

    const archivo = await adapter.exportarPptx(deck);
    const buf = await readFile(archivo.ruta);

    expect(todasLasSlides(buf)).not.toContain('IMAGEN:');
    expect(todasLasNotas(buf)).not.toContain('Sugerencia de imagen');
  });
});

describe('PptxExportAdapter — imágenes reales del banco', () => {
  // PNG 1×1 válido (no se inspecciona el contenido; solo que addImage lo embeba sin fallar).
  const PNG_DUMMY = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  it('embebe el PNG real del banco cuando el slide trae imagen_clave y el PNG existe', async () => {
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-pptx-banco-'));
    await writeFile(join(dirBanco, 'cafe1234.png'), PNG_DUMMY);

    const deck: ClaseDeck = SchemaClaseDeck.parse({
      titulo: 'Clase con imagen',
      asignatura: 'Matemática',
      nivel: '1º básico',
      oa: ['MA01 OA 03'],
      tramo_edad: '1-2',
      tema: TEMAS_DECK_INFANTIL['1-2'],
      slides: [
        {
          momento: 'inicio',
          tipo: 'contenido',
          titulo: 'Contemos',
          contenido: ['¿Cuántas ves?'],
          notas_docente: 'La respuesta se lee de la imagen.',
          imagen: 'siete estrellas',
          imagen_clave: 'cafe1234',
        },
      ],
    });
    const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
    const adapter = new PptxExportAdapter(dir, logger, dirBanco);
    const archivo = await adapter.exportarPptx(deck);

    const media = entradasPptx(await readFile(archivo.ruta)).filter((e) => /^ppt\/media\/.+/.test(e));
    expect(media.length).toBeGreaterThan(0); // el PNG real quedó embebido
  });

  it('cae al placeholder visible cuando hay imagen pero no imagen_clave (degradación sin API key)', async () => {
    const deck: ClaseDeck = SchemaClaseDeck.parse({
      titulo: 'Clase fallback',
      asignatura: 'Matemática',
      nivel: '1º básico',
      oa: ['MA01 OA 03'],
      tramo_edad: '1-2',
      tema: TEMAS_DECK_INFANTIL['1-2'],
      slides: [
        {
          momento: 'inicio',
          tipo: 'contenido',
          titulo: 'X',
          contenido: ['y'],
          notas_docente: 'n',
          imagen: 'una recta numérica',
        },
      ],
    });
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-pptx-banco-'));
    const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
    const adapter = new PptxExportAdapter(dir, logger, dirBanco);
    const buf = await readFile((await adapter.exportarPptx(deck)).ruta);

    expect(entradasPptx(buf).filter((e) => /^ppt\/media\/.+/.test(e))).toEqual([]); // no embebió
    expect(todasLasSlides(buf)).toContain('IMAGEN: una recta numérica'); // placeholder visible
  });

  it('cae al placeholder si imagen_clave apunta a un PNG que no está en disco', async () => {
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-pptx-banco-')); // vacío
    const deck: ClaseDeck = SchemaClaseDeck.parse({
      titulo: 'Clase sin archivo',
      asignatura: 'Matemática',
      nivel: '1º básico',
      oa: ['MA01 OA 03'],
      tramo_edad: '1-2',
      tema: TEMAS_DECK_INFANTIL['1-2'],
      slides: [
        {
          momento: 'inicio',
          tipo: 'contenido',
          titulo: 'X',
          contenido: ['y'],
          notas_docente: 'n',
          imagen: 'apoyo visual',
          imagen_clave: 'noexiste',
        },
      ],
    });
    const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
    const adapter = new PptxExportAdapter(dir, logger, dirBanco);
    const buf = await readFile((await adapter.exportarPptx(deck)).ruta);

    expect(entradasPptx(buf).filter((e) => /^ppt\/media\/.+/.test(e))).toEqual([]);
    expect(todasLasSlides(buf)).toContain('IMAGEN: apoyo visual'); // degradó al placeholder
  });

  it('las notas del orador NO incluyen "Sugerencia de imagen" (#7)', async () => {
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-pptx-banco-'));
    const deck: ClaseDeck = SchemaClaseDeck.parse({
      titulo: 'Clase notas',
      asignatura: 'Matemática',
      nivel: '1º básico',
      oa: ['MA01 OA 03'],
      tramo_edad: '1-2',
      tema: TEMAS_DECK_INFANTIL['1-2'],
      slides: [
        { momento: 'inicio', tipo: 'contenido', titulo: 'X', contenido: ['y'], notas_docente: 'Guía esto.', imagen: 'una escena' },
      ],
    });
    const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
    const adapter = new PptxExportAdapter(dir, logger, dirBanco);
    const buf = await readFile((await adapter.exportarPptx(deck)).ruta);
    expect(todasLasNotas(buf)).not.toContain('Sugerencia de imagen');
  });
});
