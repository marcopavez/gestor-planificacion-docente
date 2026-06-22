import { describe, expect, it } from 'vitest';
import { SchemaPayloadMaterialColorear } from './payloadMaterialColorear.js';

describe('SchemaPayloadMaterialColorear', () => {
  it('acepta el payload mínimo (sin concepto ni regenerar)', () => {
    const p = SchemaPayloadMaterialColorear.parse({
      establecimiento: 'Colegio X',
      asignatura: 'Matemática',
      nivel: '1° básico',
      oaCodigo: 'MA01 OA 01',
    });
    expect(p.concepto).toBeUndefined();
    expect(p.regenerar).toBeUndefined();
  });

  it('acepta concepto + regenerar opcionales', () => {
    const p = SchemaPayloadMaterialColorear.parse({
      establecimiento: 'Colegio X',
      asignatura: 'Matemática',
      nivel: '1° básico',
      oaCodigo: 'MA01 OA 01',
      concepto: 'conteo',
      regenerar: true,
    });
    expect(p.regenerar).toBe(true);
  });

  it('rechaza campos vacíos', () => {
    expect(SchemaPayloadMaterialColorear.safeParse({ establecimiento: '', asignatura: 'M', nivel: '1°', oaCodigo: 'X' }).success).toBe(false);
  });
});
