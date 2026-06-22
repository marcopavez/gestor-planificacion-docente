import { describe, expect, it } from 'vitest';
import { crearImageGen } from './crearImageGen.js';
import { crearLoggerHijo } from '@faro/observability';

const log = crearLoggerHijo('test');

describe('crearImageGen (DUAL)', () => {
  it('sin API key → modo placeholder (degradado)', () => {
    expect(crearImageGen({}, log).modo).toBe('placeholder');
  });
  it('con API key y sin proveedor → modo imagen (default)', () => {
    expect(crearImageGen({ GEMINI_API_KEY: 'k' }, log).modo).toBe('imagen');
  });
  it('FARO_IMAGE_PROVIDER=flash con API key → modo flash', () => {
    expect(crearImageGen({ GEMINI_API_KEY: 'k', FARO_IMAGE_PROVIDER: 'flash' }, log).modo).toBe('flash');
  });
  it('GOOGLE_API_KEY también activa el proveedor', () => {
    expect(crearImageGen({ GOOGLE_API_KEY: 'k' }, log).modo).toBe('imagen');
  });
});
