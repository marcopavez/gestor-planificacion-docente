import { describe, expect, it } from 'vitest';
import { SchemaPayloadGuia } from './payloadGuia.js';

describe('SchemaPayloadGuia', () => {
  it('valida un payload completo', () => {
    const ok = SchemaPayloadGuia.safeParse({
      asignatura: 'Ciencias Naturales',
      nivel: '3º básico',
      oaCodigo: 'CN03 OA 01',
      conocimiento: 'Los seres vivos',
      establecimiento: 'Colegio Demo',
    });
    expect(ok.success).toBe(true);
  });

  it('rechaza campos vacíos', () => {
    const bad = SchemaPayloadGuia.safeParse({
      asignatura: '',
      nivel: '3º básico',
      oaCodigo: 'CN03 OA 01',
      conocimiento: 'X',
      establecimiento: 'Y',
    });
    expect(bad.success).toBe(false);
  });
});
