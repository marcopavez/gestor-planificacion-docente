// PlantillaRepositoryCorpus + presets reales Bernales (RF-2.4). Sin red (INV-1): valida que los
// 2 presets cargan y validan, que cada campo.catalogo existe en el JSON de catálogos, y la
// coherencia requerido/origen.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaArchivoCatalogos } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { beforeAll, describe, expect, it } from 'vitest';
import { PlantillaRepositoryCorpus } from './PlantillaRepositoryCorpus.js';

const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'corpus');

function crearRepo(): PlantillaRepositoryCorpus {
  return new PlantillaRepositoryCorpus(CORPUS_DIR, crearLoggerHijo('infra-corpus-test'));
}

// Claves de catálogo realmente presentes en corpus/catalogos/planificacion.json.
const clavesCatalogo = new Set(
  Object.keys(
    SchemaArchivoCatalogos.parse(
      JSON.parse(readFileSync(join(CORPUS_DIR, 'catalogos', 'planificacion.json'), 'utf8')),
    ).catalogos,
  ),
);

describe('PlantillaRepositoryCorpus (RF-2.4)', () => {
  it('listar() devuelve los 2 presets reales (A y B)', async () => {
    const todas = await crearRepo().listar();
    expect(todas).toHaveLength(2);
    expect(todas.map((p) => p.formato).sort()).toEqual(['A', 'B']);
  });

  it('porId resuelve por id y devuelve null si no existe', async () => {
    const repo = crearRepo();
    expect((await repo.porId('bernales-formato-a'))?.formato).toBe('A');
    expect((await repo.porId('bernales-formato-b'))?.formato).toBe('B');
    expect(await repo.porId('no-existe')).toBeNull();
  });

  it('activaPara resuelve por establecimiento + formato', async () => {
    const repo = crearRepo();
    const est = 'Escuela General José Alejandro Bernales D-114';
    expect((await repo.activaPara(est, 'A'))?.id).toBe('bernales-formato-a');
    expect((await repo.activaPara(est, 'B'))?.id).toBe('bernales-formato-b');
    expect(await repo.activaPara('Otro Colegio', 'A')).toBeNull();
  });
});

describe('Presets de plantilla — integridad (RF-2.4/RF-2.6)', () => {
  let presets: Awaited<ReturnType<PlantillaRepositoryCorpus['listar']>>;
  beforeAll(async () => {
    // Si un preset no validara contra el schema, cargar() lanzaría aquí (CA: "los 2 presets validan").
    presets = await crearRepo().listar();
  });

  it('los 2 presets validan (se cargaron sin lanzar)', () => {
    expect(presets).toHaveLength(2);
  });

  it('cada campo.catalogo referenciado existe en el JSON de catálogos', () => {
    for (const plantilla of presets) {
      for (const seccion of plantilla.secciones) {
        for (const campo of seccion.campos) {
          if (campo.catalogo !== undefined) {
            expect(clavesCatalogo.has(campo.catalogo), `${plantilla.id}/${campo.clave} → ${campo.catalogo}`).toBe(true);
          }
        }
      }
    }
  });

  it('coherencia: contenido de origen IA nace borrador → nunca es captura obligatoria (HIL, INV-3)', () => {
    for (const plantilla of presets) {
      for (const seccion of plantilla.secciones) {
        for (const campo of seccion.campos) {
          if (campo.origen === 'ia') {
            expect(campo.requerido, `${plantilla.id}/${campo.clave} es IA y no debería ser requerido`).toBe(false);
          }
        }
      }
    }
  });

  it('coherencia: orden y clave son únicos dentro de cada sección', () => {
    for (const plantilla of presets) {
      for (const seccion of plantilla.secciones) {
        const ordenes = seccion.campos.map((c) => c.orden);
        const claves = seccion.campos.map((c) => c.clave);
        expect(new Set(ordenes).size, `ordenes duplicados en ${plantilla.id}/${seccion.clave}`).toBe(ordenes.length);
        expect(new Set(claves).size, `claves duplicadas en ${plantilla.id}/${seccion.clave}`).toBe(claves.length);
      }
    }
  });
});
