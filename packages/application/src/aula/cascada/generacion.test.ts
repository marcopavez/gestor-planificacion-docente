// Tests de los prompts/entradas de la cascada (sin red): garantizan que las reglas críticas de
// calibración/anclaje no se borren por accidente. No validan la salida del LLM (eso es el smoke).
import { describe, expect, it } from 'vitest';
import { entradaDeckInfantil, entradaPrueba, INSTR_DECK_INFANTIL, INSTR_DIBUJO, INSTR_GUIA, INSTR_PRUEBA } from './generacion.js';
import type { PlanificacionUnidad } from '@faro/domain';

const unidadMin = { unidad: 'U1', asignatura: 'Matemática', nivel: '1º básico', oa: [] } as unknown as PlanificacionUnidad;

const unidadMinDeck = {
  unidad: 'U1', asignatura: 'Matemática', nivel: '1º básico', establecimiento: 'Colegio Demo', oa: [],
} as unknown as PlanificacionUnidad;

describe('INSTR_DIBUJO', () => {
  it('exige que descripcion_en represente exactamente el concepto (anclaje #1)', () => {
    expect(INSTR_DIBUJO.texto).toContain("DEBE representar exactamente el 'concepto'");
  });
});

describe('entradaPrueba', () => {
  it('incluye el tramo de edad para calibrar el prompt (#4)', () => {
    const s = entradaPrueba(unidadMin, '1-2');
    expect(s).toContain('Tramo de edad: 1-2 básico');
  });
});

describe('INSTR_PRUEBA', () => {
  it('exige unicidad de enunciados (#3)', () => {
    expect(INSTR_PRUEBA.texto).toContain('no repitas el mismo enunciado');
  });
  it('da reglas para el tramo 1-2 pre-lectores (#4)', () => {
    expect(INSTR_PRUEBA.texto).toContain('MÁXIMO 2 alternativas');
  });
});

describe('INSTR_GUIA', () => {
  it('pide numerar sub-partes con letras para no reiniciar la numeración', () => {
    expect(INSTR_GUIA.texto).toContain('letras (a, b, c)');
  });
});

describe('INSTR_PRUEBA (imágenes ancladas + conteo abierto)', () => {
  it('describe imagen como descripción visual concreta y depictable', () => {
    expect(INSTR_PRUEBA.texto).toContain("'imagen' = una DESCRIPCIÓN visual CONCRETA");
  });
  it('formula el conteo de pre-lectores como respuesta abierta (no clave numérica fija)', () => {
    expect(INSTR_PRUEBA.texto).toContain('Escribe el número');
  });
});

describe('INSTR_DECK_INFANTIL (imagen anclada + no revelar conteo)', () => {
  it('pide una DESCRIPCIÓN visual en "imagen" (no un tópico de catálogo)', () => {
    expect(INSTR_DECK_INFANTIL.texto).toContain("pon en 'imagen' una DESCRIPCIÓN visual");
  });
  it('prohíbe revelar la cantidad en las opciones de conteo (#5)', () => {
    expect(INSTR_DECK_INFANTIL.texto).toContain('NO deben revelar la cantidad');
  });
  it('ya NO menciona topico_imagen', () => {
    expect(INSTR_DECK_INFANTIL.texto).not.toContain('topico_imagen');
  });
});

describe('entradaDeckInfantil (sin catálogo de tópicos)', () => {
  it('ya no inyecta la lista de tópicos de imagen', () => {
    expect(entradaDeckInfantil(unidadMinDeck, '1-2')).not.toContain('Tópicos de imagen');
  });
});
