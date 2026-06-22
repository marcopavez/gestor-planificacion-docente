import { describe, expect, it } from 'vitest';
import { SchemaPayloadFicha } from './payloadFicha.js';

describe('SchemaPayloadFicha', () => {
  it('acepta el payload mínimo (sin concepto ni regenerar)', () => {
    const p = { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: '1º básico', oaCodigo: 'MA01 OA 01' };
    expect(SchemaPayloadFicha.parse(p)).toEqual(p);
  });

  it('acepta concepto y regenerar opcionales', () => {
    const p = { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: '1º básico', oaCodigo: 'MA01 OA 01', concepto: 'frutas', regenerar: true };
    expect(SchemaPayloadFicha.parse(p)).toEqual(p);
  });

  it('rechaza campos requeridos vacíos', () => {
    expect(() => SchemaPayloadFicha.parse({ establecimiento: '', asignatura: 'M', nivel: '1º', oaCodigo: 'x' })).toThrow();
  });
});
