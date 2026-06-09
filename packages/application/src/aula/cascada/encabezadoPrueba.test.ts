// Test del builder puro construirEncabezadoPrueba (Fase 4): compone lo FIJO del caller con lo DINÁMICO
// de la unidad, sin red (INV-1). Verifica título, filas OA (solo basales con texto verbatim), fallback de
// docente y validación contra SchemaEncabezadoPrueba.

import type { PlanificacionUnidad } from '@faro/domain';
import { SchemaEncabezadoPrueba } from '@faro/domain';
import { describe, expect, it } from 'vitest';
import { construirEncabezadoPrueba, type DatosInstitucionales } from './encabezadoPrueba.js';

const INST: DatosInstitucionales = {
  nombreColegio: 'Escuela José A. Bernales D-114',
  comuna: 'Conchalí',
  escudo: 'Escudo institucional del colegio.',
  porcentajeExigencia: 60,
};

/** Unidad con un OA basal y uno complementario (para verificar el filtro de filas OA). */
function unidadMuestra(overrides: Partial<PlanificacionUnidad> = {}): PlanificacionUnidad {
  return {
    plantilla: 'A',
    establecimiento: 'Escuela José A. Bernales D-114',
    docente: 'Profesora María Pérez',
    asignatura: 'Lenguaje y Comunicación',
    nivel: '2º básico',
    unidad: 'Unidad 1: Los cuentos',
    proposito: 'Comprender cuentos del entorno.',
    oa: [
      {
        codigo: 'LE02 OA 04',
        categoria: 'basal',
        descripcion: 'Leer y comprender cuentos breves.',
        detalle: [],
        habilidades: ['Comprender'],
      },
      {
        codigo: 'LE02 OA 12',
        categoria: 'complementario',
        descripcion: 'Escribir oraciones simples.',
        detalle: [],
        habilidades: ['Escribir'],
      },
    ],
    experiencias: [],
    indicadores_evaluacion: [],
    evaluacion: { tipo: ['formativa'], instrumentos: [] },
    extras: {},
    ...overrides,
  };
}

describe('construirEncabezadoPrueba (Fase 4, builder puro)', () => {
  it('compone lo fijo del caller con lo dinámico de la unidad y valida el schema', () => {
    const enc = construirEncabezadoPrueba(unidadMuestra(), INST);

    // No lanza: es un EncabezadoPrueba válido del dominio.
    expect(() => SchemaEncabezadoPrueba.parse(enc)).not.toThrow();

    // FIJO (del caller).
    expect(enc.nombreColegio).toBe('Escuela José A. Bernales D-114');
    expect(enc.comuna).toBe('Conchalí');
    expect(enc.escudo).toBe('Escudo institucional del colegio.');
    expect(enc.porcentajeExigencia).toBe(60);

    // DINÁMICO (de la unidad): título derivado de la asignatura.
    expect(enc.titulo).toBe('Prueba de Lenguaje y Comunicación');
  });

  it('incluye SOLO los OA basales con su texto verbatim', () => {
    const enc = construirEncabezadoPrueba(unidadMuestra(), INST);

    expect(enc.oa).toEqual([
      { codigo: 'LE02 OA 04', descripcion: 'Leer y comprender cuentos breves.' },
    ]);
  });

  it('el docente cae al de la unidad si el caller no lo especifica', () => {
    const enc = construirEncabezadoPrueba(unidadMuestra(), INST);

    expect(enc.docente).toBe('Profesora María Pérez');
  });

  it('el docente del caller manda por sobre el de la unidad', () => {
    const enc = construirEncabezadoPrueba(unidadMuestra(), {
      ...INST,
      docente: 'Profesor Juan Soto',
    });

    expect(enc.docente).toBe('Profesor Juan Soto');
  });

  it('omite docente si no lo da ni el caller ni la unidad (exactOptionalPropertyTypes)', () => {
    const sinDocente = unidadMuestra();
    delete sinDocente.docente;

    const enc = construirEncabezadoPrueba(sinDocente, {
      nombreColegio: 'Escuela X',
      comuna: 'Santiago',
    });

    expect(enc.docente).toBeUndefined();
    expect('docente' in enc).toBe(false);
  });

  it('deja oa: [] si ningún OA es basal (no inventa)', () => {
    const soloComplementarios = unidadMuestra({
      oa: [
        {
          codigo: 'LE02 OA 12',
          categoria: 'complementario',
          descripcion: 'Escribir oraciones simples.',
          detalle: [],
          habilidades: [],
        },
      ],
    });

    const enc = construirEncabezadoPrueba(soloComplementarios, INST);

    expect(enc.oa).toEqual([]);
  });

  it('omite escudo y porcentajeExigencia si el caller no los aporta', () => {
    const enc = construirEncabezadoPrueba(unidadMuestra(), {
      nombreColegio: 'Escuela X',
      comuna: 'Santiago',
    });

    expect('escudo' in enc).toBe(false);
    expect('porcentajeExigencia' in enc).toBe(false);
  });
});
