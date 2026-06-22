import { describe, expect, it } from 'vitest';
import { SchemaFicha, SchemaEjerciciosFicha, fugaDeTextoEnFicha, type Ficha } from './ficha.js';

const itemValido = {
  oa: 'OA 1',
  habilidad: 'comprender' as const,
  tipo: 'completacion' as const,
  enunciado: 'El gato tiene ____ patas.',
};

const fichaValida: Ficha = {
  asignatura: 'Matemática',
  curso: '1º básico',
  oa: { codigo: 'MA01 OA 01', descripcion: 'Contar números del 0 al 100.' },
  concepto: 'conteo de frutas',
  perfil_nivel: '1-2',
  titulo: 'Ficha para colorear: conteo de frutas',
  consigna_dibujo: 'Colorea el dibujo.',
  ejercicios: [itemValido],
  descripcion_dibujo: 'Three apples on a table, thick outlines.',
  imagen_clave: 'abcd1234',
};

describe('SchemaFicha', () => {
  it('acepta una ficha válida', () => {
    expect(SchemaFicha.parse(fichaValida)).toEqual(fichaValida);
  });

  it('rechaza perfil_nivel fuera de 1º-3º (5-6)', () => {
    expect(() => SchemaFicha.parse({ ...fichaValida, perfil_nivel: '5-6' })).toThrow();
  });
});

describe('SchemaEjerciciosFicha', () => {
  it('acepta una lista de ítems de prueba', () => {
    expect(SchemaEjerciciosFicha.parse({ ejercicios: [itemValido] })).toEqual({ ejercicios: [itemValido] });
  });
});

describe('fugaDeTextoEnFicha', () => {
  it('devuelve null si los ítems están sanos', () => {
    expect(fugaDeTextoEnFicha(fichaValida)).toBeNull();
  });

  it('detecta fuga en un enunciado desmesurado', () => {
    const sucia: Ficha = { ...fichaValida, ejercicios: [{ ...itemValido, enunciado: 'x'.repeat(1001) }] };
    const fuga = fugaDeTextoEnFicha(sucia);
    expect(fuga).not.toBeNull();
    expect(fuga?.campo).toBe('enunciado');
    expect(fuga?.itemIndex).toBe(0);
  });
});
