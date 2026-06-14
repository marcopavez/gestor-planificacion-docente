import { describe, expect, it } from 'vitest';
import { guiaGate } from './guiaGate.js';
import type { Guia } from '../schemas/guia.js';

const base: Guia = {
  asignatura: 'Matemática',
  curso: '4º básico',
  oa: { codigo: 'MA04 OA 01', descripcion: 'Representar números naturales.' },
  conocimiento: 'Valor posicional',
  perfil_nivel: '3-4',
  titulo: 'Guía: Valor posicional',
  explicacion: 'El valor de un dígito depende de su posición.',
  ejemplo: 'En 234, el 2 vale 200.',
  ejercicios: [
    {
      oa: 'MA04 OA 01',
      habilidad: 'aplicar',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuánto vale el 3 en 36?',
      alternativas: [
        { texto: '3', correcta: false },
        { texto: '30', correcta: true },
      ],
      retroalimentacion: 'Mira la posición del dígito.',
    },
  ],
};

describe('guiaGate', () => {
  it('ok para una guía coherente', () => {
    const r = guiaGate(base);
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toEqual([]);
  });

  it('bloquea si un ejercicio de selección múltiple no tiene exactamente una correcta', () => {
    const mala: Guia = {
      ...base,
      ejercicios: [
        {
          ...base.ejercicios[0]!,
          alternativas: [
            { texto: '3', correcta: true },
            { texto: '30', correcta: true },
          ],
        },
      ],
    };
    expect(guiaGate(mala).ok).toBe(false);
  });

  it('bloquea si la guía no trae ejercicios', () => {
    const mala: Guia = { ...base, ejercicios: [] };
    expect(guiaGate(mala).ok).toBe(false);
  });
});
