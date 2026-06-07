// packages/domain/src/hil/estadoRevision.test.ts
// Tests unitarios de la máquina de estados HIL (RF-PA.11, CA-PA.5).
// INV-1/INV-2/INV-3: pura, sin DB ni red; no existe ruta a 'aprobado' sin autorHumano.

import { describe, expect, it } from 'vitest';
import { ReglaDominioError } from '../errors/index.js';
import { transicionar } from './estadoRevision.js';

describe('máquina de estados HIL (H-PA.6)', () => {
  // --- Transiciones válidas ---

  it('borrador → en_revision al enviar a revisión', () => {
    const r = transicionar('borrador', 'enviar_a_revision');
    expect(r.estado).toBe('en_revision');
    expect(r.autorHumano).toBeNull();
  });

  it('en_revision → aprobado con autorHumano identificado', () => {
    const r = transicionar('en_revision', 'aprobar', { autorHumano: 'prof.garcia@colegio.cl' });
    expect(r.estado).toBe('aprobado');
    expect(r.autorHumano).toBe('prof.garcia@colegio.cl');
  });

  it('en_revision → rechazado', () => {
    const r = transicionar('en_revision', 'rechazar');
    expect(r.estado).toBe('rechazado');
    expect(r.autorHumano).toBeNull();
  });

  it('rechazado → en_revision al reenviar', () => {
    const r = transicionar('rechazado', 'reenviar');
    expect(r.estado).toBe('en_revision');
    expect(r.autorHumano).toBeNull();
  });

  // --- INV-2/INV-3: aprobar sin autorHumano lanza ReglaDominioError ---

  it('en_revision → aprobado SIN autorHumano lanza ReglaDominioError', () => {
    expect(() => transicionar('en_revision', 'aprobar')).toThrow(ReglaDominioError);
    expect(() => transicionar('en_revision', 'aprobar')).toThrow('autorHumano');
  });

  it('en_revision → aprobado con autorHumano vacío lanza ReglaDominioError', () => {
    expect(() => transicionar('en_revision', 'aprobar', { autorHumano: '   ' })).toThrow(ReglaDominioError);
  });

  it('en_revision → aprobado con autorHumano vacío lanza con regla aprobacion_sin_humano', () => {
    let lanzado: ReglaDominioError | null = null;
    try {
      transicionar('en_revision', 'aprobar', { autorHumano: '' });
    } catch (e) {
      lanzado = e as ReglaDominioError;
    }
    expect(lanzado).toBeInstanceOf(ReglaDominioError);
    expect(lanzado?.regla).toBe('aprobacion_sin_humano');
  });

  // --- Transiciones ilegales ---

  it('borrador → rechazar (ilegal) lanza ReglaDominioError', () => {
    expect(() => transicionar('borrador', 'rechazar')).toThrow(ReglaDominioError);
  });

  it('borrador → aprobar (ilegal) lanza ReglaDominioError', () => {
    expect(() => transicionar('borrador', 'aprobar', { autorHumano: 'alguien' })).toThrow(ReglaDominioError);
  });

  it('aprobado → cualquier acción (ilegal) lanza ReglaDominioError', () => {
    expect(() => transicionar('aprobado', 'enviar_a_revision')).toThrow(ReglaDominioError);
    expect(() => transicionar('aprobado', 'rechazar')).toThrow(ReglaDominioError);
    expect(() => transicionar('aprobado', 'reenviar')).toThrow(ReglaDominioError);
  });

  it('rechazado → enviar_a_revision (ilegal; solo puede reenviar) lanza ReglaDominioError', () => {
    expect(() => transicionar('rechazado', 'enviar_a_revision')).toThrow(ReglaDominioError);
  });

  it('en_revision → enviar_a_revision (ilegal) lanza ReglaDominioError', () => {
    expect(() => transicionar('en_revision', 'enviar_a_revision')).toThrow(ReglaDominioError);
  });
});
