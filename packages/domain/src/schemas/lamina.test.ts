import { describe, expect, it } from 'vitest';
import {
  SchemaLamina,
  SchemaDescripcionDibujo,
  fugaDeTextoEnDescripcion,
  LIMITE_TEXTO_DESCRIPCION,
  gradoDeNivel,
} from './lamina.js';

describe('SchemaDescripcionDibujo', () => {
  it('acepta concepto (ES) + descripcion_en (EN)', () => {
    const d = SchemaDescripcionDibujo.parse({ concepto: 'conteo de frutas', descripcion_en: 'ten apples in a basket' });
    expect(d.descripcion_en).toBe('ten apples in a basket');
  });
});

describe('fugaDeTextoEnDescripcion', () => {
  it('null si la descripción es breve', () => {
    expect(fugaDeTextoEnDescripcion({ concepto: 'c', descripcion_en: 'a small cat' })).toBeNull();
  });
  it('detecta volcado de razonamiento (sobre el límite)', () => {
    const larga = 'x'.repeat(LIMITE_TEXTO_DESCRIPCION + 1);
    expect(fugaDeTextoEnDescripcion({ concepto: 'c', descripcion_en: larga })).toEqual({
      campo: 'descripcion_en',
      largo: LIMITE_TEXTO_DESCRIPCION + 1,
    });
  });
});

describe('SchemaLamina', () => {
  it('valida una lámina completa', () => {
    const l = SchemaLamina.parse({
      asignatura: 'Matemática',
      curso: '1° básico',
      oa: { codigo: 'MA01 OA 01', descripcion: 'Contar números…' },
      concepto: 'conteo de frutas',
      titulo: 'Para colorear: conteo de frutas',
      consigna: 'Pinta el dibujo.',
      descripcion_dibujo: 'ten apples in a basket',
      imagen_clave: 'a1b2c3d4',
    });
    expect(l.imagen_clave).toBe('a1b2c3d4');
  });
});

describe('gradoDeNivel', () => {
  it('extrae el primer dígito del nivel', () => {
    expect(gradoDeNivel('1° básico')).toBe(1);
    expect(gradoDeNivel('3° básico')).toBe(3);
    expect(gradoDeNivel('6° básico')).toBe(6);
  });
  it('NaN si no hay dígito', () => {
    expect(Number.isNaN(gradoDeNivel('básico'))).toBe(true);
  });
});
