import { describe, expect, it } from 'vitest';
import { CATALOGO_IMAGENES, EntradaImagen, IMAGENES_VERSION } from './catalogo.js';

const FUENTES_PERMITIDAS = new Set(['openclipart', 'undraw', 'pixabay']);

describe('catálogo de imágenes', () => {
  it('expone una versión inmutable', () => {
    expect(IMAGENES_VERSION).toMatch(/^\d{4}\.\d+$/);
  });

  it('toda entrada valida contra EntradaImagen', () => {
    for (const e of CATALOGO_IMAGENES) {
      expect(EntradaImagen.safeParse(e).success).toBe(true);
    }
  });

  it('los ids son únicos', () => {
    const ids = CATALOGO_IMAGENES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('solo usa fuentes con licencia permitida (nunca Storyset/MINEDUC)', () => {
    for (const e of CATALOGO_IMAGENES) {
      expect(FUENTES_PERMITIDAS.has(e.fuente)).toBe(true);
    }
  });
});
