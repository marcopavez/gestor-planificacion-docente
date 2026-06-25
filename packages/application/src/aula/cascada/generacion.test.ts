// Tests de los prompts/entradas de la cascada (sin red): garantizan que las reglas críticas de
// calibración/anclaje no se borren por accidente. No validan la salida del LLM (eso es el smoke).
import { describe, expect, it } from 'vitest';
import { entradaPrueba, INSTR_DIBUJO, INSTR_PRUEBA } from './generacion.js';
import type { PlanificacionUnidad } from '@faro/domain';

const unidadMin = { unidad: 'U1', asignatura: 'Matemática', nivel: '1º básico', oa: [] } as unknown as PlanificacionUnidad;

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
