// Unit de export .docx (H-2.5, CA-2.1/CA-2.2, RF-2.11) — sin red. Aserta sobre el IR (estructura/
// secciones) construido desde los PRESETS REALES de corpus/, no descomprimiendo el .docx; y verifica
// que el .docx generado pesa > 0. La fidelidad clave: las secciones del documento son EXACTAMENTE las
// de la plantilla (no se inventan), el Formato A trae la matriz de 5 columnas y el Formato B la tabla
// de 4 columnas por OA.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SchemaArchivoCatalogos,
  SchemaPlantillaPlanificacion,
  type CatalogosPlanificacion,
  type PlanificacionUnidad,
  type PlantillaPlanificacion,
} from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { DocxExportAdapter } from './DocxExportAdapter.js';
import { planoDocumento } from './plano.js';

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
  evaluacion: { tipo: [], instrumentos: [] },
  extras: { principios_dua: catalogos.principios_dua.map((o) => o.etiqueta) },
};

const tmp = mkdtempSync(join(tmpdir(), 'faro-docx-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

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
      expect(tablaOa.filas.map((f) => f.codigo)).toContain('MA01 OA 03');
      expect(tablaOa.filas[0]?.descripcion).toBe('Leer números del 0 al 20.'); // VERBATIM, ordenado basal primero
    }
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

  it('CA-2.2 (Formato B): tabla de 4 columnas, una fila por OA', () => {
    const plano = planoDocumento(planB, plantillaB, catalogos);
    const tablaOa = plano.secciones.flatMap((s) => s.bloques).find((b) => b.tipo === 'tabla_oa_b');
    expect(tablaOa?.tipo).toBe('tabla_oa_b');
    if (tablaOa?.tipo === 'tabla_oa_b') {
      expect(tablaOa.filas).toHaveLength(2); // una fila por OA priorizado
      // Cada fila tiene las 4 dimensiones: OA, habilidades, experiencias, evaluación.
      const f0 = tablaOa.filas[0];
      expect(f0?.oa.startsWith('LE03 OA 05')).toBe(true);
      expect(f0?.experiencias).toContain('Leen un cuento en voz alta.');
      expect(f0?.evaluacion).toContain('Responden preguntas sobre el texto.');
      expect(tablaOa.filas[1]?.evaluacion).toContain('Identifican el propósito del texto.');
    }
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
});
