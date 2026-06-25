import { describe, expect, it } from 'vitest';
import { claveIlustracion } from './claveIlustracion.js';

describe('claveIlustracion', () => {
  it('normaliza espacios y mayúsculas → misma clave', () => {
    const a = claveIlustracion('Siete estrellas en una entrada de show');
    const b = claveIlustracion('  siete   estrellas en una   ENTRADA de show  ');
    expect(a).toBe(b);
  });

  it('descripciones distintas dan claves distintas', () => {
    expect(claveIlustracion('siete estrellas')).not.toBe(claveIlustracion('cinco instrumentos'));
  });

  it('la clave es hex de 8 chars (segura como nombre de archivo)', () => {
    expect(claveIlustracion('una fila de cinco instrumentos')).toMatch(/^[0-9a-f]{8}$/);
  });
});
