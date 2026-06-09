// Unit del export .docx de la PRUEBA FORMATIVA (Fase 4, INV-6) — sin red. Aserta sobre el IR
// (planoPrueba: orden de secciones, numeración continua, instrucciones, soluciones según variante) y
// sobre el .docx renderizado (descomprimiendo word/document.xml / word/styles.xml SIN libs externas,
// como el test de DocxExportAdapter). Clave: alumno OCULTA soluciones; pauta las MUESTRA; documento
// VERTICAL; placeholder "IMAGEN: " del pictórico; fuente Arial.

import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { EncabezadoPrueba, Prueba } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { Packer } from 'docx';
import { construirDocumentoPrueba } from './PruebaExportAdapter.js';
import { planoPrueba } from './planoPrueba.js';

const log = crearLoggerHijo('infra-export-prueba-test');
void log; // logger disponible si se añaden tests de aDocx en disco; el render por XML no lo necesita.

/**
 * Extrae una parte (p. ej. word/document.xml) de un .docx (zip) SIN dependencias externas: lee el
 * directorio central del zip y descomprime (deflate) la entrada pedida. Copiado de DocxExportAdapter.test.
 */
function parteXml(buf: Buffer, parte: string): string {
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

const documentXml = (buf: Buffer): string => parteXml(buf, 'word/document.xml');

// Respuesta conocida que NO debe aparecer en la variante alumno y SÍ en la pauta.
const RESPUESTA_DESARROLLO = 'El agua se evapora por el calor del sol.';

const prueba: Prueba = {
  asignatura: 'Ciencias Naturales',
  curso: '3º básico',
  tipo_evaluacion: 'formativa',
  perfil_nivel: '3-4',
  pauta_correccion: 'Corrige según los indicadores; prioriza la retroalimentación formativa.',
  tabla_especificaciones: [
    { oa: 'CN03 OA 01', n_items: 4, puntaje: 8 },
    { oa: 'CN03 OA 02', n_items: 2, puntaje: 4 },
  ],
  items: [
    // seleccion_multiple (habilidad 'aplicar' → dentro de su sección iría después de un 'recordar')
    {
      oa: 'CN03 OA 01',
      habilidad: 'aplicar',
      tipo: 'seleccion_multiple',
      enunciado: '¿Qué necesita una planta para fabricar su alimento?',
      alternativas: [
        { texto: 'Luz solar', correcta: true },
        { texto: 'Oscuridad', correcta: false },
        { texto: 'Sal', correcta: false },
      ],
      puntaje: 2,
      retroalimentacion: 'Recuerda el proceso de fotosíntesis.',
    },
    // verdadero_falso (debe ir en la PRIMERA sección por el orden de tipos)
    {
      oa: 'CN03 OA 01',
      habilidad: 'recordar',
      tipo: 'verdadero_falso',
      enunciado: 'El Sol es una fuente de luz.',
      alternativas: [
        { texto: 'Verdadero', correcta: true },
        { texto: 'Falso', correcta: false },
      ],
      puntaje: 1,
      retroalimentacion: 'Observa el cielo de día.',
    },
    // pictorico
    {
      oa: 'CN03 OA 02',
      habilidad: 'comprender',
      tipo: 'pictorico',
      enunciado: 'Observa la imagen del ciclo del agua y marca dónde ocurre la evaporación.',
      imagen: 'ciclo del agua con flechas de evaporación',
      respuesta_correcta: 'En la superficie del mar.',
      puntaje: 2,
      retroalimentacion: 'La evaporación ocurre donde hay agua y calor.',
    },
    // ordenar
    {
      oa: 'CN03 OA 02',
      habilidad: 'analizar',
      tipo: 'ordenar',
      enunciado: 'Ordena las etapas del ciclo del agua.',
      secuencia_correcta: ['Evaporación', 'Condensación', 'Precipitación'],
      puntaje: 3,
      retroalimentacion: 'Piensa en el orden del calor a la lluvia.',
    },
    // terminos_pareados
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender',
      tipo: 'terminos_pareados',
      enunciado: 'Une cada ser vivo con su hábitat.',
      pares: [
        { columnaA: 'Pez', columnaB: 'Agua' },
        { columnaA: 'Águila', columnaB: 'Aire' },
      ],
      puntaje: 2,
      retroalimentacion: 'Piensa dónde vive cada animal.',
    },
    // desarrollo (con respuesta conocida para el assert alumno/pauta)
    {
      oa: 'CN03 OA 01',
      habilidad: 'evaluar',
      tipo: 'desarrollo',
      enunciado: 'Explica con tus palabras por qué se forma la lluvia.',
      respuesta_correcta: RESPUESTA_DESARROLLO,
      puntaje: 3,
      retroalimentacion: 'Relaciona la evaporación con las nubes.',
    },
  ],
};

const encabezado: EncabezadoPrueba = {
  nombreColegio: 'Escuela General José Alejandro Bernales D-114',
  comuna: 'Conchalí',
  escudo: 'escudo del colegio',
  porcentajeExigencia: 60,
  docente: 'Giannina Guzmán Guevara',
  titulo: 'Prueba de Ciencias Naturales',
  oa: [
    { codigo: 'CN03 OA 01', descripcion: 'Reconocer las necesidades de los seres vivos.' },
    { codigo: 'CN03 OA 02', descripcion: 'Describir el ciclo del agua.' },
  ],
  puntajeTotal: 13,
};

describe('planoPrueba (IR de la prueba formativa)', () => {
  it('agrupa por tipo en el ORDEN fijo y numera de forma continua 1..N', () => {
    const plano = planoPrueba(prueba, encabezado, 'alumno');
    // 6 ítems de 6 tipos distintos (sin completacion en la muestra) → 6 secciones, en el orden fijo del
    // contrato: verdadero_falso, seleccion_multiple, terminos_pareados, [completacion], ordenar, pictorico, desarrollo.
    expect(plano.secciones.map((s) => s.romano)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
    expect(plano.secciones.map((s) => s.items[0]?.tipo)).toEqual([
      'verdadero_falso',
      'seleccion_multiple',
      'terminos_pareados',
      'ordenar',
      'pictorico',
      'desarrollo',
    ]);
    // Numeración CONTINUA en el orden de render (sección tras sección): 1..6 sin huecos.
    const numeros = plano.secciones.flatMap((s) => s.items.map((i) => i.numero));
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('usa las instrucciones fijas por tipo y deriva el encabezado de la prueba', () => {
    const plano = planoPrueba(prueba, encabezado, 'alumno');
    expect(plano.secciones[0]?.instruccion).toBe('Escribe V si es verdadero o F si es falso.');
    expect(plano.secciones[1]?.instruccion).toBe('Marca con una X la alternativa correcta.');
    // asignatura/curso salen de la PRUEBA, no del encabezado.
    expect(plano.asignatura).toBe('Ciencias Naturales');
    expect(plano.curso).toBe('3º básico');
    expect(plano.encabezado.lineaColegio).toBe('Escuela General José Alejandro Bernales D-114 · Conchalí');
    // oaFilas = encabezado.oa (con su texto verbatim).
    expect(plano.encabezado.oaFilas).toEqual(encabezado.oa);
    // escudo como placeholder "IMAGEN: …".
    expect(plano.encabezado.escudo).toBe('IMAGEN: escudo del colegio');
  });

  it('alumno: mostrarSolucion=false; NINGÚN ítem trae solucion/retro; sin pauta/tabla', () => {
    const plano = planoPrueba(prueba, encabezado, 'alumno');
    expect(plano.mostrarSolucion).toBe(false);
    const items = plano.secciones.flatMap((s) => s.items);
    expect(items.every((i) => i.solucion === undefined)).toBe(true);
    expect(items.every((i) => i.retro === undefined)).toBe(true);
    expect(plano.pautaCorreccion).toBeUndefined();
    expect(plano.tablaEspecificaciones).toBeUndefined();
  });

  it('pauta: mostrarSolucion=true; solucion y retro presentes; pauta y tabla definidas', () => {
    const plano = planoPrueba(prueba, encabezado, 'pauta');
    expect(plano.mostrarSolucion).toBe(true);
    const items = plano.secciones.flatMap((s) => s.items);
    // Cada ítem de la muestra trae retroalimentación.
    expect(items.every((i) => i.retro !== undefined)).toBe(true);
    // Soluciones por tipo.
    const sm = items.find((i) => i.tipo === 'seleccion_multiple');
    expect(sm?.solucion).toBe('A) Luz solar');
    const vf = items.find((i) => i.tipo === 'verdadero_falso');
    expect(vf?.tipo === 'verdadero_falso' && vf.correcta).toBe('V');
    expect(vf?.solucion).toBe('V');
    const ordenar = items.find((i) => i.tipo === 'ordenar');
    expect(ordenar?.solucion).toBe('Evaporación → Condensación → Precipitación');
    const pareados = items.find((i) => i.tipo === 'terminos_pareados');
    expect(pareados?.solucion).toBe('Pez ↔ Agua; Águila ↔ Aire');
    const desarrollo = items.find((i) => i.tipo === 'desarrollo');
    expect(desarrollo?.solucion).toBe(RESPUESTA_DESARROLLO);
    // Pauta + tabla de especificaciones.
    expect(plano.pautaCorreccion).toBe(prueba.pauta_correccion);
    expect(plano.tablaEspecificaciones).toEqual([
      { codigo: 'CN03 OA 01', nItems: 4, puntaje: 8 },
      { codigo: 'CN03 OA 02', nItems: 2, puntaje: 4 },
    ]);
  });

  it('puntaje de sección = suma solo si todos los ítems traen puntaje', () => {
    const plano = planoPrueba(prueba, encabezado, 'alumno');
    // Sección II (seleccion_multiple): un solo ítem de 2 pts.
    const sm = plano.secciones.find((s) => s.items[0]?.tipo === 'seleccion_multiple');
    expect(sm?.puntaje).toBe(2);
    // Sección IV (ordenar): un solo ítem de 3 pts.
    const ordenar = plano.secciones.find((s) => s.items[0]?.tipo === 'ordenar');
    expect(ordenar?.puntaje).toBe(3);
  });
});

describe('construirDocumentoPrueba (render .docx)', () => {
  it('alumno: documento VERTICAL, con "IMAGEN:", lineaColegio, título y un OA; oculta la respuesta', async () => {
    const buf = await Packer.toBuffer(construirDocumentoPrueba(planoPrueba(prueba, encabezado, 'alumno')));
    const xml = documentXml(buf);
    expect(buf.length).toBeGreaterThan(0);
    // Vertical: el .docx NO lleva orient="landscape".
    expect(xml).not.toContain('w:orient="landscape"');
    // Placeholder pictórico VISIBLE.
    expect(xml).toContain('IMAGEN: ');
    expect(xml).toContain('ciclo del agua con flechas de evaporación');
    // Encabezado institucional + título + un OA del encabezado.
    expect(xml).toContain('Conchalí'); // parte de lineaColegio
    expect(xml).toContain('Prueba de Ciencias Naturales');
    expect(xml).toContain('Reconocer las necesidades de los seres vivos.');
    // La respuesta conocida NO aparece en la variante alumno.
    expect(xml).not.toContain(RESPUESTA_DESARROLLO);
    // Tampoco el bloque "PAUTA DE CORRECCIÓN".
    expect(xml).not.toContain('PAUTA DE CORRECCIÓN');
  });

  it('pauta: contiene la respuesta conocida, la retroalimentación y el banner de pauta', async () => {
    const buf = await Packer.toBuffer(construirDocumentoPrueba(planoPrueba(prueba, encabezado, 'pauta')));
    const xml = documentXml(buf);
    expect(buf.length).toBeGreaterThan(0);
    expect(xml).toContain(RESPUESTA_DESARROLLO); // la respuesta SÍ aparece en la pauta
    expect(xml).toContain('Retroalimentación:');
    expect(xml).toContain('PAUTA DE CORRECCIÓN');
    // El título de la pauta lleva el sufijo " — Pauta".
    expect(xml).toContain('Pauta');
    // Resumen de la tabla de especificaciones (un OA de la tabla).
    expect(xml).toContain('CN03 OA 01');
  });

  it('la fuente por defecto es Arial (en word/styles.xml), no Times New Roman', async () => {
    const buf = await Packer.toBuffer(construirDocumentoPrueba(planoPrueba(prueba, encabezado, 'alumno')));
    const styles = parteXml(buf, 'word/styles.xml');
    expect(styles).toContain('Arial');
    expect(documentXml(buf)).not.toContain('Times New Roman');
  });
});
