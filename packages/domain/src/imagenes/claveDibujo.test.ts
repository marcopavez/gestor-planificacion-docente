import { describe, expect, it } from 'vitest';
import { claveDibujo } from './claveDibujo.js';

describe('claveDibujo', () => {
  it('es determinista: misma (oa, concepto) → misma clave', () => {
    expect(claveDibujo('MA01 OA 03', 'conteo')).toBe(claveDibujo('MA01 OA 03', 'conteo'));
  });

  it('concepto por defecto vacío: clave estable por OA sin concepto', () => {
    expect(claveDibujo('MA01 OA 03')).toBe(claveDibujo('MA01 OA 03', ''));
  });

  it('distinta (oa o concepto) → distinta clave', () => {
    expect(claveDibujo('MA01 OA 03')).not.toBe(claveDibujo('MA01 OA 04'));
    expect(claveDibujo('MA01 OA 03', 'conteo')).not.toBe(claveDibujo('MA01 OA 03', 'figuras'));
  });

  it('clave es hex segura para nombre de archivo (solo [0-9a-f])', () => {
    expect(claveDibujo('CN01 OA 01', 'seres vivos')).toMatch(/^[0-9a-f]+$/);
  });
});
