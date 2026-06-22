import { describe, expect, it } from 'vitest';
import { construirPromptLineArt } from './promptLineArt.js';
import { PlaceholderImageGen } from './PlaceholderImageGen.js';

describe('construirPromptLineArt', () => {
  it('envuelve la descripción en el template de line-art B&N para niños', () => {
    const p = construirPromptLineArt('ten apples in a basket');
    expect(p).toContain('Black and white line art coloring page');
    expect(p).toContain('thick clean outlines');
    expect(p).toContain('no text');
    expect(p).toContain('ten apples in a basket');
  });
});

describe('PlaceholderImageGen', () => {
  it('devuelve null (modo degradado, sin red)', async () => {
    expect(await new PlaceholderImageGen().generarLineArt('whatever')).toBeNull();
  });
});
