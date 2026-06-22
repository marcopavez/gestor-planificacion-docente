import { describe, expect, it } from 'vitest';
import type { EntradaImagenT } from './catalogo.js';
import { resolverImagenEn, topicosDisponiblesEn } from './resolver.js';

// Catálogo de prueba (inyectado): no dependemos del set real curado.
const CAT: EntradaImagenT[] = [
  { id: 'a', topico: 'manzana', materia: null, tramo: '1-2', tipo: 'color', archivo: 'x/a.png', fuente: 'pixabay', licencia: 'Pixabay' },
  { id: 'b', topico: 'manzana', materia: null, tramo: '1-2', tipo: 'color', archivo: 'x/b.png', fuente: 'pixabay', licencia: 'Pixabay' },
  { id: 'c', topico: 'conteo', materia: 'Matemática', tramo: '1-2', tipo: 'color', archivo: 'x/c.png', fuente: 'undraw', licencia: 'unDraw' },
  { id: 'd', topico: 'numero_3', materia: null, tramo: '1-2', tipo: 'linea_bn', archivo: 'x/d.png', fuente: 'openclipart', licencia: 'CC0' },
];

describe('topicosDisponiblesEn', () => {
  it('devuelve tópicos de la materia + transversales, del tipo y tramo pedidos', () => {
    const t = topicosDisponiblesEn(CAT, 'Matemática', '1-2', 'color');
    expect(new Set(t)).toEqual(new Set(['manzana', 'conteo']));
  });
  it('una materia ajena no ve los tópicos exclusivos de otra', () => {
    const t = topicosDisponiblesEn(CAT, 'Música', '1-2', 'color');
    expect(t).toEqual(['manzana']); // 'conteo' es exclusivo de Matemática
  });
  it('filtra por tipo', () => {
    expect(topicosDisponiblesEn(CAT, 'Matemática', '1-2', 'linea_bn')).toEqual(['numero_3']);
  });
});

describe('resolverImagenEn', () => {
  it('un tópico inexistente devuelve null', () => {
    expect(resolverImagenEn(CAT, 'dinosaurio', 'Matemática', '1-2', 'color')).toBeNull();
  });
  it('es DETERMINISTA: misma seed → misma entrada', () => {
    const r1 = resolverImagenEn(CAT, 'manzana', 'Matemática', '1-2', 'color', 'doc-1');
    const r2 = resolverImagenEn(CAT, 'manzana', 'Matemática', '1-2', 'color', 'doc-1');
    expect(r1?.id).toBe(r2?.id);
  });
  it('respeta materia (exacta o transversal) y tipo', () => {
    const r = resolverImagenEn(CAT, 'conteo', 'Matemática', '1-2', 'color');
    expect(r?.id).toBe('c');
    expect(resolverImagenEn(CAT, 'conteo', 'Música', '1-2', 'color')).toBeNull();
  });
});
