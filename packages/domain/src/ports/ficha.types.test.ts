import { describe, expect, it } from 'vitest';
import type { ExportFichaPort, JobRepository, TrabajoFicha } from '../index.js';

describe('puertos de la ficha (contrato de tipos)', () => {
  it('un doble satisface ExportFichaPort y los métodos de cola de JobRepository', () => {
    const exportador: Pick<ExportFichaPort, 'aDocx' | 'aPdf'> = {
      aDocx: async () => ({ ruta: '/tmp/f.docx', mime: 'x', bytes: 1 }),
      aPdf: async () => ({ ruta: '/tmp/f.pdf', mime: 'x', bytes: 1 }),
    };
    const cola: Pick<JobRepository, 'encolarFicha' | 'tomarSiguienteFicha'> = {
      encolarFicha: async () => 'job-1',
      tomarSiguienteFicha: async (): Promise<TrabajoFicha | null> => null,
    };
    expect(typeof exportador.aDocx).toBe('function');
    expect(typeof cola.encolarFicha).toBe('function');
  });
});
