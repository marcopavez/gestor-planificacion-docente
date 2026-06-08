// Unit de export .docx (H-2.5, CA-2.1/CA-2.2, RF-2.11) + FIDELIDAD VISUAL — sin red. Aserta sobre el
// IR (estructura/secciones/LOOK) construido desde los PRESETS REALES de corpus/, no descomprimiendo el
// .docx; y verifica que el .docx generado pesa > 0. La fidelidad clave: las secciones del documento son
// EXACTAMENTE las de la plantilla (no se inventan); el Formato A es horizontal con membrete, matriz de
// 5 columnas y tabla de OA por categoría; el Formato B es vertical con membrete granate, Principios DUA
// en línea y tabla de 4 columnas por OA; ambos muestran los códigos de OA en forma corta.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SchemaArchivoCatalogos,
  SchemaPlantillaPlanificacion,
  type CatalogosPlanificacion,
  type PlanificacionUnidad,
  type PlantillaPlanificacion,
} from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { Packer } from 'docx';
import { DocxExportAdapter, construirDocumento } from './DocxExportAdapter.js';
import { codigoCorto, planoDocumento } from './plano.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(__dirname, '../../../../corpus');
const log = crearLoggerHijo('infra-export-test');

function leerPlantilla(archivo: string): PlantillaPlanificacion {
  return SchemaPlantillaPlanificacion.parse(JSON.parse(readFileSync(join(CORPUS_DIR, 'plantillas', archivo), 'utf8')));
}
function leerCatalogos(): CatalogosPlanificacion {
  return SchemaArchivoCatalogos.parse(JSON.parse(readFileSync(join(CORPUS_DIR, 'catalogos', 'planificacion.json'), 'utf8'))).catalogos;
}

const catalogos = leerCatalogos();
const plantillaA = leerPlantilla('bernales-formato-a.json');
const plantillaB = leerPlantilla('bernales-formato-b.json');

const planA: PlanificacionUnidad = {
  plantilla: 'A',
  establecimiento: 'Escuela General José Alejandro Bernales D-114',
  docente: 'Prof. Demo',
  asignatura: 'Matemática',
  nivel: '1º básico',
  unidad: 'Unidad 1: Números hasta el 20',
  proposito: 'Leer y comparar números hasta el 20 con material concreto.',
  duracion_semanas: 7,
  horas_pedagogicas: 42,
  oa: [
    { codigo: 'MA01 OA 03', categoria: 'basal', descripcion: 'Leer números del 0 al 20.', habilidades: ['Representar'] },
    { codigo: 'MA01 OA 01', categoria: 'complementario', descripcion: 'Contar números del 0 al 100.', habilidades: [] },
    { codigo: 'OAT 9', categoria: 'transversal', descripcion: 'Resolver problemas de manera reflexiva.', habilidades: [] },
  ],
  experiencias: ['Cuentan colecciones de hasta 20 objetos.', 'Comparan dos cantidades.'],
  indicadores_evaluacion: [{ oa: 'MA01 OA 03', texto: 'Leen números del 0 al 20.', fuente: 'ia_borrador' }],
  evaluacion: { tipo: ['formativa'], instrumentos: ['Lista de cotejo'] },
  extras: {
    habilidades_siglo_xxi: ['Creatividad', 'Colaboración'],
    metodologias_activas: ['Gamificación'],
    tipo_evaluacion: ['Formativa'],
    instrumentos_evaluacion: ['Lista de cotejo'],
  },
};

const planB: PlanificacionUnidad = {
  plantilla: 'B',
  establecimiento: 'Escuela General José Alejandro Bernales D-114',
  docente: 'Prof. Demo',
  asignatura: 'Lenguaje y Comunicación',
  nivel: '3º básico',
  unidad: 'Bloque 1',
  periodo: '1er semestre',
  oa: [
    { codigo: 'LE03 OA 05', categoria: 'priorizado', descripcion: 'Leer y comprender textos breves.', habilidades: ['Comprender'] },
    { codigo: 'LE03 OA 06', categoria: 'priorizado', descripcion: 'Leer independientemente textos no literarios.', habilidades: [] },
  ],
  experiencias: ['Leen un cuento en voz alta.'],
  indicadores_evaluacion: [
    { oa: 'LE03 OA 05', texto: 'Responden preguntas sobre el texto.', fuente: 'ia_borrador' },
    { oa: 'LE03 OA 06', texto: 'Identifican el propósito del texto.', fuente: 'ia_borrador' },
  ],
  evaluacion: { tipo: ['formativa', 'sumativa'], instrumentos: [] },
  extras: { principios_dua: catalogos.principios_dua.map((o) => o.etiqueta) },
};

const tmp = mkdtempSync(join(tmpdir(), 'faro-docx-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/**
 * Extrae word/document.xml de un .docx (zip) SIN dependencias externas (jszip/fflate no están en el
 * árbol). Lee el directorio central del zip y descomprime (deflate) la entrada del documento.
 */
function documentXml(buf: Buffer): string {
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
    if (nombre === 'word/document.xml') {
      const lhNameLen = buf.readUInt16LE(localOff + 26);
      const lhExtraLen = buf.readUInt16LE(localOff + 28);
      const ini = localOff + 30 + lhNameLen + lhExtraLen;
      const comp = buf.subarray(ini, ini + compSize);
      return (method === 0 ? comp : inflateRawSync(comp)).toString('utf8');
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('word/document.xml no encontrado');
}

describe('codigoCorto (display de códigos de OA — solo display)', () => {
  it('quita el prefijo de asignatura y los ceros a la izquierda', () => {
    expect(codigoCorto('MA01 OA 03')).toBe('OA3');
    expect(codigoCorto('LE03 OA 05')).toBe('OA5');
    expect(codigoCorto('MA01OA11')).toBe('OA11');
  });
  it('los OAT conservan su prefijo', () => {
    expect(codigoCorto('OAT 9')).toBe('OAT9');
    expect(codigoCorto('OAT25')).toBe('OAT25');
  });
});

describe('DocxExportAdapter / planoDocumento (H-2.5)', () => {
  it('CA-2.1 (Formato A): las secciones del documento son EXACTAMENTE las del preset (sin inventar)', () => {
    const plano = planoDocumento(planA, plantillaA, catalogos);
    expect(plano.titulo).toBe(plantillaA.nombre);
    // Mismo conjunto y MISMO orden de secciones que la plantilla (RF-2.11: no se inventan secciones).
    const titulosPlantilla = [...plantillaA.secciones].sort((a, b) => a.orden - b.orden).map((s) => s.titulo);
    expect(plano.secciones.map((s) => s.titulo)).toEqual(titulosPlantilla);
  });

  it('CA-2.1 (Formato A): trae la matriz de 5 columnas (Diversificación) y la tabla de OA por categoría', () => {
    const plano = planoDocumento(planA, plantillaA, catalogos);
    const matriz = plano.secciones
      .flatMap((s) => s.bloques)
      .find((b) => b.tipo === 'checkbox_matriz');
    expect(matriz?.tipo).toBe('checkbox_matriz');
    if (matriz?.tipo === 'checkbox_matriz') {
      expect(matriz.columnas).toHaveLength(5); // 5 columnas de la Diversificación de la Enseñanza
      // La selección de la IA queda marcada en su columna.
      const metod = matriz.columnas.find((c) => c.opciones.some((o) => o.etiqueta === 'Gamificación'));
      expect(metod?.opciones.find((o) => o.etiqueta === 'Gamificación')?.marcado).toBe(true);
    }
    const tablaOa = plano.secciones.flatMap((s) => s.bloques).find((b) => b.tipo === 'tabla_oa_a');
    expect(tablaOa?.tipo).toBe('tabla_oa_a');
    if (tablaOa?.tipo === 'tabla_oa_a') {
      // Un grupo por categoría presente (basal · complementario · transversal), en ese orden.
      expect(tablaOa.grupos.map((g) => g.categoria)).toEqual(['OA Basal', 'OA Complementarios', 'OA Transversales']);
      const basal = tablaOa.grupos[0];
      expect(basal?.oas[0]?.codigo).toBe('OA3'); // código en forma CORTA (display)
      expect(basal?.oas[0]?.descripcion).toBe('Leer números del 0 al 20.'); // descripción VERBATIM
      expect(tablaOa.grupos[2]?.oas[0]?.codigo).toBe('OAT9'); // transversal conserva el prefijo
    }
  });

  it('Formato A: es horizontal, con membrete, grilla crema, categoría OA celeste y banda de título', () => {
    const plano = planoDocumento(planA, plantillaA, catalogos);
    expect(plano.tema.orientacion).toBe('horizontal');
    // Calca el doc real: grilla del encabezado en crema; columna de categoría de OA en celeste.
    expect(plano.tema.colorEtiqueta).toBe('FFFFCC');
    expect(plano.tema.colorCategoria).toBe('DAE9F7');
    expect(plano.tema.tituloBanda).toBe('C1E3F5'); // el título va sobre banda celeste
    expect(plano.tema.header?.izquierda).toContain('Escuela José Alejandro Bernales D-114');
    expect(plano.tema.header?.centro).toContain('Giannina Guzmán Guevara');
    // Diversificación: BANDA de título crema + cabeceras de columna celeste (distintos colores, como el real).
    const div = plano.secciones.find((s) => s.clave === 'diversificacion');
    expect(div?.bandaColor).toBe('FFFFCC');
    expect(div?.cabeceraColor).toBe('DAE9F7');
    // Objetivos: banda "OBJETIVOS DE APRENDIZAJES" crema.
    const oa = plano.secciones.find((s) => s.clave === 'objetivos_aprendizaje');
    expect(oa?.bandaColor).toBe('FFFFCC');
    // La sección de encabezado NO repite el título del documento sobre la grilla.
    expect(plano.secciones.find((s) => s.clave === 'encabezado')?.mostrarTitulo).toBe(false);
  });

  it('RF-2.11 (Formato A): la Evaluación APILA sus checkbox_set (no inventa una matriz por adyacencia)', () => {
    const plano = planoDocumento(planA, plantillaA, catalogos);
    const evaluacion = plano.secciones.find((s) => s.clave === 'evaluacion');
    expect(evaluacion).toBeDefined();
    // La Evaluación tiene varios checkbox_set, pero el PDF real los apila (no lado a lado).
    expect(evaluacion?.bloques.some((b) => b.tipo === 'checkbox_matriz')).toBe(false);
    expect(evaluacion?.bloques.some((b) => b.tipo === 'checkbox')).toBe(true);
    // En todo el documento hay UNA sola matriz: la Diversificación (la única con layout 'matriz').
    const matrices = plano.secciones.flatMap((s) => s.bloques).filter((b) => b.tipo === 'checkbox_matriz');
    expect(matrices).toHaveLength(1);
  });

  it('CA-2.2 (Formato B): tabla de 4 columnas, una fila por OA, con código corto y tipo de evaluación', () => {
    const plano = planoDocumento(planB, plantillaB, catalogos);
    const tablaOa = plano.secciones.flatMap((s) => s.bloques).find((b) => b.tipo === 'tabla_oa_b');
    expect(tablaOa?.tipo).toBe('tabla_oa_b');
    if (tablaOa?.tipo === 'tabla_oa_b') {
      expect(tablaOa.filas).toHaveLength(2); // una fila por OA priorizado
      const f0 = tablaOa.filas[0];
      expect(f0?.codigo).toBe('OA5'); // código corto
      expect(f0?.descripcion).toBe('Leer y comprender textos breves.');
      expect(f0?.habilidades).toContain('Comprender');
      expect(f0?.experiencias).toContain('Leen un cuento en voz alta.');
      // La columna Evaluación muestra el TIPO de evaluación (no los indicadores — el PDF B no los tiene).
      expect(f0?.evaluacion).toEqual(['Evaluación Formativa', 'Evaluación Sumativa']);
    }
  });

  it('Formato B: es vertical, con membrete granate, Principios DUA EN LÍNEA (no checkboxes) y cabecera naranja', () => {
    const plano = planoDocumento(planB, plantillaB, catalogos);
    expect(plano.tema.orientacion).toBe('vertical');
    expect(plano.tema.colorEtiqueta).toBeUndefined(); // las etiquetas de la grilla B no van sombreadas
    expect(plano.tema.titulo).toEqual(['PLANIFICACIÓN', 'BLOQUE DE ACTIVIDADES']);
    expect(plano.tema.header?.bandaColor).toBe('612322'); // banda decorativa granate
    expect(plano.tema.header?.centro).toContain('ESCUELA GENERAL JOSÉ ALEJANDRO BERNALES D- 114');
    // Principios DUA: lista en línea numerada con los 3 principios; NUNCA checkboxes en B.
    const dua = plano.secciones.find((s) => s.clave === 'principios_dua');
    const enLinea = dua?.bloques.find((b) => b.tipo === 'lista_en_linea');
    expect(enLinea?.tipo).toBe('lista_en_linea');
    if (enLinea?.tipo === 'lista_en_linea') expect(enLinea.items).toHaveLength(3);
    expect(dua?.bloques.some((b) => b.tipo === 'checkbox')).toBe(false);
    // La tabla de 4 columnas lleva cabecera naranja; B no tiene ninguna matriz de 5 columnas.
    const oa = plano.secciones.find((s) => s.clave === 'objetivos_aprendizaje');
    expect(oa?.cabeceraColor).toBe('F8CBAD');
    expect(plano.secciones.flatMap((s) => s.bloques).some((b) => b.tipo === 'checkbox_matriz')).toBe(false);
  });

  it('genera un .docx no vacío para ambos formatos', async () => {
    const adapter = new DocxExportAdapter(tmp, log);
    const a = await adapter.aDocx(planA, plantillaA, catalogos);
    const b = await adapter.aDocx(planB, plantillaB, catalogos);
    expect(a.mime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(a.bytes).toBeGreaterThan(0);
    expect(b.bytes).toBeGreaterThan(0);
    expect(a.ruta.endsWith('.docx')).toBe(true);
  });

  // Cobertura del mapeo IR→.docx (no solo el IR): Packer.toString devuelve word/document.xml, donde se
  // verifica el LOOK renderizado (orientación, sombreados, códigos cortos, DUA) y que NO haya tablas
  // adyacentes (Word las fusionaría y rompería los anchos).
  it('render .docx (Formato A): landscape, sombreados crema/celeste, códigos cortos y sin tablas pegadas', async () => {
    const xml = documentXml(await Packer.toBuffer(construirDocumento(planoDocumento(planA, plantillaA, catalogos))));
    expect(xml).toContain('w:orient="landscape"');
    expect(xml).toContain('w:fill="FFFFCC"'); // grilla/banda crema
    expect(xml).toContain('w:fill="DAE9F7"'); // categoría OA / cabecera matriz celeste
    expect(xml).toContain('w:fill="C1E3F5"'); // banda del título
    expect(xml).toContain('OA3:'); // código corto (de "MA01 OA 03")
    expect(xml).toContain('OAT9:'); // transversal corto (de "OAT 9")
    expect(xml).not.toContain('MA01 OA 03'); // el código largo NO se muestra (solo display corto)
    expect(/<\/w:tbl>\s*<w:tbl>/.test(xml)).toBe(false); // sin tablas adyacentes (no se fusionan)
  });

  it('render .docx (Formato B): portrait, cabecera naranja, DUA en línea y sin tablas pegadas', async () => {
    const xml = documentXml(await Packer.toBuffer(construirDocumento(planoDocumento(planB, plantillaB, catalogos))));
    expect(xml).not.toContain('w:orient="landscape"');
    expect(xml).toContain('w:fill="F8CBAD"'); // cabecera naranja de la tabla de 4 columnas
    expect(xml).toContain('Proveer múltiples medios de Representación'); // Principio DUA en línea
    expect(xml).toContain('OA5'); // código corto (de "LE03 OA 05")
    expect(/<\/w:tbl>\s*<w:tbl>/.test(xml)).toBe(false);
  });
});
