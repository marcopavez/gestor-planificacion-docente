// Schema PlantillaPlanificacion data-driven (spec 02-planificacion, RF-2.4/RF-2.6).
import { describe, expect, it } from 'vitest';
import { SchemaPlantillaPlanificacion } from './plantilla.js';

// Plantilla mínima válida: una sección de encabezado + una sección con un checkbox_set y su catálogo.
const valida = {
  id: 'demo-a',
  formato: 'A',
  nombre: 'Demo',
  establecimiento: 'Escuela Demo',
  version: '1',
  secciones: [
    {
      clave: 'encabezado',
      titulo: 'Encabezado',
      orden: 0,
      campos: [{ clave: 'docente', etiqueta: 'Docente', tipo: 'texto', requerido: true, origen: 'input', orden: 0 }],
    },
    {
      clave: 'habilidades',
      titulo: 'Habilidades',
      orden: 1,
      campos: [
        {
          clave: 'habilidades_siglo_xxi',
          etiqueta: 'Habilidades del Siglo XXI',
          tipo: 'checkbox_set',
          requerido: false,
          origen: 'ia',
          catalogo: 'habilidades_siglo_xxi',
          orden: 0,
        },
      ],
    },
  ],
};

describe('SchemaPlantillaPlanificacion (RF-2.4)', () => {
  it('valida una plantilla bien formada', () => {
    expect(SchemaPlantillaPlanificacion.safeParse(valida).success).toBe(true);
  });

  it('rechaza un checkbox_set sin catálogo (invariante checkbox_set ⟺ catalogo)', () => {
    const malo = structuredClone(valida);
    delete (malo.secciones[1]!.campos[0] as { catalogo?: string }).catalogo;
    expect(SchemaPlantillaPlanificacion.safeParse(malo).success).toBe(false);
  });

  it('rechaza un catálogo en un campo que no es checkbox_set', () => {
    const malo = structuredClone(valida);
    malo.secciones[0]!.campos[0] = {
      clave: 'docente',
      etiqueta: 'Docente',
      tipo: 'texto',
      requerido: true,
      origen: 'input',
      catalogo: 'habilidades_siglo_xxi',
      orden: 0,
    } as (typeof malo.secciones)[0]['campos'][0];
    expect(SchemaPlantillaPlanificacion.safeParse(malo).success).toBe(false);
  });

  it('rechaza un catálogo que no es una de las 11 claves conocidas', () => {
    const malo = structuredClone(valida);
    (malo.secciones[1]!.campos[0] as { catalogo: string }).catalogo = 'catalogo_inventado';
    expect(SchemaPlantillaPlanificacion.safeParse(malo).success).toBe(false);
  });

  it('rechaza un tipo o un origen fuera del enum', () => {
    expect(SchemaPlantillaPlanificacion.safeParse({ ...valida, formato: 'C' }).success).toBe(false);
    const tipoMalo = structuredClone(valida);
    (tipoMalo.secciones[0]!.campos[0] as { tipo: string }).tipo = 'riquísimo';
    expect(SchemaPlantillaPlanificacion.safeParse(tipoMalo).success).toBe(false);
  });
});
