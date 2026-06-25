import { describe, expect, it } from 'vitest';
import { claveDibujo } from './claveDibujo.js';
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

// Golden / characterization: PINNEAN la salida exacta de fnv1aHex (vía claveDibujo/claveIlustracion).
// El refactor a fnv1aHex es behavior-preserving; si alguien cambia el algoritmo del hash, TODOS los PNG
// cacheados (nombrados por estas claves) se invalidarían en silencio. Estos valores lo cazan: si fallan,
// es una decisión deliberada de migrar el cache, no un cambio gratuito.
describe('claves de cache (golden values — fnv1aHex)', () => {
  it('claveIlustracion pinnea su hash', () => {
    expect(claveIlustracion('siete estrellas en una entrada de show')).toBe('8b32c1b9');
  });

  it('claveDibujo pinnea su hash (OA sin concepto)', () => {
    expect(claveDibujo('MA01 OA 03')).toBe('7e1e0b2b');
  });

  it('claveDibujo pinnea su hash (OA + concepto)', () => {
    expect(claveDibujo('CN01 OA 01', 'seres vivos')).toBe('001597c1');
  });
});
