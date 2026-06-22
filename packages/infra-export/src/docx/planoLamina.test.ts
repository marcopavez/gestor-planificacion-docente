import { describe, expect, it } from 'vitest';
import type { Lamina } from '@faro/domain';
import { planoLamina } from './planoLamina.js';

const LAMINA: Lamina = {
  asignatura: 'Matemática',
  curso: '1° básico',
  oa: { codigo: 'MA01 OA 01', descripcion: 'Contar números del 0 al 20…' },
  concepto: 'conteo de frutas',
  titulo: 'Para colorear: conteo de frutas',
  consigna: 'Pinta el dibujo.',
  descripcion_dibujo: 'ten apples in a basket',
  imagen_clave: 'abc123',
};

describe('planoLamina', () => {
  it('compone el encabezado + consigna + clave de imagen', () => {
    const p = planoLamina(LAMINA, { nombreColegio: 'Colegio X', comuna: 'Santiago' });
    expect(p.encabezado.titulo).toBe('Para colorear: conteo de frutas');
    expect(p.encabezado.lineaColegio).toBe('Colegio X · Santiago');
    expect(p.consigna).toBe('Pinta el dibujo.');
    expect(p.imagenClave).toBe('abc123');
    expect(p.descripcionDibujo).toBe('ten apples in a basket');
  });
});
