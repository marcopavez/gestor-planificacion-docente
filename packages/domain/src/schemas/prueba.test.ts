// packages/domain/src/schemas/prueba.test.ts
// Tests unitarios de los schemas Zod — CA-0.7.
// Sin red, sin DB, sin LLM (INV-1).

import { describe, expect, it } from 'vitest';
import { SchemaPrueba } from './prueba.js';

const pruebaValida = {
  asignatura: 'Matemática',
  curso: '1° básico',
  tabla_especificaciones: [{ oa: 'MA01 OA 03', n_items: 2, puntaje: 4 }],
  items: [
    {
      oa: 'MA01 OA 03',
      habilidad: 'recordar' as const,
      tipo: 'seleccion_multiple' as const,
      enunciado: '¿Cuánto es 2 + 2?',
      alternativas: [
        { texto: '3', correcta: false },
        { texto: '4', correcta: true },
        { texto: '5', correcta: false },
      ],
      puntaje: 2,
    },
    {
      oa: 'MA01 OA 03',
      habilidad: 'comprender' as const,
      tipo: 'desarrollo' as const,
      enunciado: 'Explica con palabras qué significa sumar.',
      respuesta_correcta: 'Juntar cantidades.',
      puntaje: 2,
    },
  ],
  pauta_correccion: 'Ver rúbrica adjunta.',
  alineada_reglamento: true,
  version_nee_dua: false,
  perfil_nivel: '1B' as const,
};

describe('SchemaPrueba', () => {
  it('acepta una prueba válida', () => {
    const resultado = SchemaPrueba.safeParse(pruebaValida);
    expect(resultado.success).toBe(true);
  });

  it('rechaza si falta asignatura', () => {
    const { asignatura: _omit, ...sinAsignatura } = pruebaValida;
    const resultado = SchemaPrueba.safeParse(sinAsignatura);
    expect(resultado.success).toBe(false);
  });

  it('rechaza un tipo de habilidad inválido', () => {
    const conHabilidadInvalida = {
      ...pruebaValida,
      items: [{ ...pruebaValida.items[0], habilidad: 'memorizar' }],
    };
    const resultado = SchemaPrueba.safeParse(conHabilidadInvalida);
    expect(resultado.success).toBe(false);
  });
});
