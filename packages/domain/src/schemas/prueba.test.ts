// packages/domain/src/schemas/prueba.test.ts
// Tests unitarios de los schemas Zod — CA-0.7.
// Sin red, sin DB, sin LLM (INV-1).

import { describe, expect, it } from 'vitest';
import { ItemPrueba, SchemaPrueba } from './prueba.js';
import { itemsDuplicados } from './prueba.js';

const pruebaValida = {
  asignatura: 'Matemática',
  curso: '1° básico',
  tipo_evaluacion: 'formativa' as const,
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
      retroalimentacion: 'Si fallas, vuelve a contar con material concreto.',
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
  perfil_nivel: '1-2' as const,
};

describe('SchemaPrueba', () => {
  it('acepta una prueba válida', () => {
    const resultado = SchemaPrueba.safeParse(pruebaValida);
    expect(resultado.success).toBe(true);
  });

  it('aplica tipo_evaluacion="formativa" por defecto si se omite', () => {
    const { tipo_evaluacion: _omit, ...sinTipo } = pruebaValida;
    const resultado = SchemaPrueba.safeParse(sinTipo);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.tipo_evaluacion).toBe('formativa');
    }
  });

  it('acepta una prueba formativa sin puntajes (ponderación opcional)', () => {
    const sinPuntajes = {
      ...pruebaValida,
      tabla_especificaciones: [{ oa: 'MA01 OA 03', n_items: 2 }],
      items: pruebaValida.items.map(({ puntaje: _p, ...resto }) => resto),
    };
    const resultado = SchemaPrueba.safeParse(sinPuntajes);
    expect(resultado.success).toBe(true);
  });

  it('acepta un ítem de tipo "ordenar" con secuencia_correcta', () => {
    const conOrdenar = {
      ...pruebaValida,
      items: [
        {
          oa: 'MA01 OA 03',
          habilidad: 'aplicar' as const,
          tipo: 'ordenar' as const,
          enunciado: 'Ordena de menor a mayor.',
          secuencia_correcta: ['1', '2', '3'],
          retroalimentacion: 'Compara de a pares.',
        },
      ],
    };
    const resultado = SchemaPrueba.safeParse(conOrdenar);
    expect(resultado.success).toBe(true);
  });

  it('acepta un ítem de tipo "terminos_pareados" con pares', () => {
    const conPareados = {
      ...pruebaValida,
      items: [
        {
          oa: 'MA01 OA 03',
          habilidad: 'comprender' as const,
          tipo: 'terminos_pareados' as const,
          enunciado: 'Une cada número con su nombre.',
          pares: [
            { columnaA: '2', columnaB: 'dos' },
            { columnaA: '3', columnaB: 'tres' },
          ],
        },
      ],
    };
    const resultado = SchemaPrueba.safeParse(conPareados);
    expect(resultado.success).toBe(true);
  });

  it('acepta un ítem de tipo "pictorico" con imagen como descripción placeholder', () => {
    const conPictorico = {
      ...pruebaValida,
      items: [
        {
          oa: 'MA01 OA 03',
          habilidad: 'recordar' as const,
          tipo: 'pictorico' as const,
          enunciado: 'Marca el grupo con más objetos.',
          imagen: 'Dos grupos de manzanas: uno con 3, otro con 5.',
        },
      ],
    };
    const resultado = SchemaPrueba.safeParse(conPictorico);
    expect(resultado.success).toBe(true);
  });

  it('rechaza si falta asignatura', () => {
    const { asignatura: _omit, ...sinAsignatura } = pruebaValida;
    const resultado = SchemaPrueba.safeParse(sinAsignatura);
    expect(resultado.success).toBe(false);
  });

  it('rechaza un perfil_nivel del enum antiguo (1B/2B/3B)', () => {
    const resultado = SchemaPrueba.safeParse({ ...pruebaValida, perfil_nivel: '1B' });
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

describe('itemsDuplicados', () => {
  const base = {
    oa: 'MA01 OA 01',
    habilidad: 'recordar' as const,
    tipo: 'seleccion_multiple' as const,
    alternativas: [
      { texto: 'a', correcta: true },
      { texto: 'b', correcta: false },
    ],
  };

  it('detecta enunciados repetidos (normaliza espacios y mayúsculas)', () => {
    const items = [
      { ...base, enunciado: '¿Qué artista está en el 2º lugar?' },
      { ...base, enunciado: '  ¿Qué Artista está en el  2º lugar?  ' },
    ];
    expect(itemsDuplicados(items)).toEqual({ itemIndex: 1 });
  });

  it('devuelve null cuando todos los enunciados son distintos', () => {
    const items = [
      { ...base, enunciado: '¿Cuántas estrellas hay?' },
      { ...base, enunciado: '¿Qué número viene después del 8?' },
    ];
    expect(itemsDuplicados(items)).toBeNull();
  });
});

describe('ItemPrueba.imagen_clave', () => {
  const base = {
    oa: 'MA01 OA 01',
    habilidad: 'recordar' as const,
    tipo: 'pictorico' as const,
    enunciado: '¿Cuántas estrellas hay? Escribe el número.',
    imagen: 'siete estrellas en una entrada de show',
  };

  it('parsea un ítem con imagen_clave (clave del PNG resuelto)', () => {
    const r = ItemPrueba.parse({ ...base, imagen_clave: 'a1b2c3d4' });
    expect(r.imagen_clave).toBe('a1b2c3d4');
  });

  it('parsea un ítem SIN imagen_clave (backward-compatible)', () => {
    const r = ItemPrueba.parse(base);
    expect(r.imagen_clave).toBeUndefined();
  });
});
