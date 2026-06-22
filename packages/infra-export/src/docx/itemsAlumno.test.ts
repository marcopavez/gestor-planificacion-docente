import { describe, expect, it } from 'vitest';
import { Paragraph, Table } from 'docx';
import { renderItemAlumno } from './itemsAlumno.js';
import type { ItemPlano } from './planoPrueba.js';

describe('renderItemAlumno', () => {
  it('selección múltiple: enunciado + una línea por alternativa', () => {
    const item: ItemPlano = {
      tipo: 'seleccion_multiple',
      numero: 1,
      enunciado: '¿Cuántas patas tiene un gato?',
      alternativas: [
        { etiqueta: 'A', texto: '2', correcta: false },
        { etiqueta: 'B', texto: '4', correcta: true },
      ],
    };
    const out = renderItemAlumno(item);
    expect(out).toHaveLength(3); // enunciado + 2 alternativas
    expect(out.every((n) => n instanceof Paragraph)).toBe(true);
  });

  it('términos pareados: produce una tabla', () => {
    const item: ItemPlano = {
      tipo: 'terminos_pareados',
      numero: 2,
      enunciado: 'Une.',
      columnaA: ['perro', 'gato'],
      columnaB: ['guau', 'miau'],
    };
    const out = renderItemAlumno(item);
    expect(out.some((n) => n instanceof Table)).toBe(true);
  });
});
