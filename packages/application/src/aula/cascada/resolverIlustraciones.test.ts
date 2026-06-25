import { describe, expect, it, vi } from 'vitest';
import type { ItemPruebaType, SlideDeckType } from '@faro/domain';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
import { resolverIlustracionesItems, resolverIlustracionesSlides } from './resolverIlustraciones.js';

function ilustradorFijo(clave: string | null): ResolverIlustracionUseCase {
  return { resolver: vi.fn(async () => clave) } as unknown as ResolverIlustracionUseCase;
}

const itemConImagen: ItemPruebaType = {
  oa: 'MA01 OA 01',
  habilidad: 'recordar',
  tipo: 'pictorico',
  enunciado: '¿Cuántas estrellas hay? Escribe el número.',
  imagen: 'siete estrellas',
};
const itemSinImagen: ItemPruebaType = {
  oa: 'MA01 OA 01',
  habilidad: 'recordar',
  tipo: 'seleccion_multiple',
  enunciado: '¿Cuál es mayor?',
  alternativas: [{ texto: '3', correcta: false }, { texto: '5', correcta: true }],
};

describe('resolverIlustracionesItems', () => {
  it('los ítems con imagen ganan imagen_clave; los sin imagen quedan igual', async () => {
    const out = await resolverIlustracionesItems([itemConImagen, itemSinImagen], 'MA01 OA 01', ilustradorFijo('cafe1234'));
    expect(out[0]?.imagen_clave).toBe('cafe1234');
    expect(out[1]?.imagen_clave).toBeUndefined();
    expect(out[1]).toEqual(itemSinImagen);
  });

  it('si el ilustrador devuelve null, NO se añade imagen_clave (degradación)', async () => {
    const out = await resolverIlustracionesItems([itemConImagen], 'MA01 OA 01', ilustradorFijo(null));
    expect(out[0]?.imagen_clave).toBeUndefined();
    expect(out[0]?.imagen).toBe('siete estrellas');
  });

  it('un ítem con imagen vacía (string en blanco) no se resuelve', async () => {
    const ilustrador = ilustradorFijo('x');
    await resolverIlustracionesItems([{ ...itemConImagen, imagen: '   ' }], 'MA01 OA 01', ilustrador);
    expect(ilustrador.resolver).not.toHaveBeenCalled();
  });
});

describe('resolverIlustracionesSlides', () => {
  const slideConImagen: SlideDeckType = {
    momento: 'inicio',
    titulo: 'Contemos',
    contenido: ['¿Cuántas ves?'],
    notas_docente: 'La respuesta se lee de la imagen.',
    imagen: 'siete estrellas',
    tipo: 'contenido',
    opciones: [],
  };
  const slideSinImagen: SlideDeckType = {
    momento: 'cierre',
    titulo: 'Repaso',
    contenido: ['Listo'],
    notas_docente: 'Cierre.',
    tipo: 'contenido',
    opciones: [],
  };

  it('los slides con imagen ganan imagen_clave; los sin imagen quedan igual', async () => {
    const out = await resolverIlustracionesSlides([slideConImagen, slideSinImagen], 'MA01 OA 01', ilustradorFijo('beef5678'));
    expect(out[0]?.imagen_clave).toBe('beef5678');
    expect(out[1]?.imagen_clave).toBeUndefined();
    expect(out[1]).toEqual(slideSinImagen);
  });
});
