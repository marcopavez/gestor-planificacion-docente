// OaRepositoryCorpus: carga determinista por (asignatura, nivel) sobre el corpus real, sin red
// (INV-1, CA-1.2). Resuelve cada archivo por el manifiesto, no por slug.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearLoggerHijo } from '@faro/observability';
import { describe, expect, it } from 'vitest';
import { BloqueCorpusNoEncontradoError, CorpusVersionDesconocidaError } from './errors.js';
import { OaRepositoryCorpus } from './OaRepositoryCorpus.js';

// Raíz del repo desde packages/infra-corpus/src → ../../../
const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'corpus');

function crearRepo(): OaRepositoryCorpus {
  return new OaRepositoryCorpus(CORPUS_DIR, crearLoggerHijo('infra-corpus-test'));
}

describe('OaRepositoryCorpus.porAsignaturaNivel (RF-1.4, CA-1.2)', () => {
  it('devuelve los 20 OA reales de Matemática 1º básico', async () => {
    const oas = await crearRepo().porAsignaturaNivel('Matemática', '1º básico');
    expect(oas).toHaveLength(20);
    const primero = oas[0];
    expect(primero?.codigo).toBe('MA01 OA 01');
    expect(primero?.asignatura).toBe('Matemática');
    expect(primero?.nivel).toBe('1º básico');
    // file-based: id sintetizado = código; vigencias = null (decreto [VERIFICAR]); INV-4.
    expect(primero?.id).toBe('MA01 OA 01');
    expect(primero?.corpusVersionId).toBe('corpus@2026.1');
    expect(primero?.vigenciaDesde).toBeNull();
    expect(primero?.vigenciaHasta).toBeNull();
    expect(Array.isArray(primero?.indicadores)).toBe(true);
  });

  it('devuelve los 32 OAT del bloque Transversal/Básica (no sigue el patrón de slug)', async () => {
    const oats = await crearRepo().porAsignaturaNivel('Transversal', 'Básica');
    expect(oats).toHaveLength(32);
    expect(oats[0]?.codigo).toBe('OAT 1');
    expect(oats[31]?.codigo).toBe('OAT 32');
    expect(oats[0]?.asignatura).toBe('Transversal');
  });

  it('lanza error tipado si la combinación (asignatura, nivel) no existe (CA-1.2)', async () => {
    // "Inglés" no es la etiqueta del manifiesto ("Idioma Extranjero Inglés") → no hay match.
    await expect(crearRepo().porAsignaturaNivel('Inglés', '6º básico')).rejects.toBeInstanceOf(
      BloqueCorpusNoEncontradoError,
    );
  });

  it('expone corpusVersionId = corpus@<version del manifiesto> (INV-4)', async () => {
    expect(await crearRepo().corpusVersionId()).toBe('corpus@2026.1');
  });
});

describe('OaRepositoryCorpus.porAsignaturaCurso (compat con el puerto)', () => {
  it('delega en porAsignaturaNivel si la versión pedida coincide con la disponible', async () => {
    const oas = await crearRepo().porAsignaturaCurso('Matemática', '1º básico', 'corpus@2026.1');
    expect(oas).toHaveLength(20);
  });

  it('lanza error tipado si se pide una corpus_version que el corpus file-based no expone (INV-4)', async () => {
    await expect(
      crearRepo().porAsignaturaCurso('Matemática', '1º básico', 'corpus@otra-version'),
    ).rejects.toBeInstanceOf(CorpusVersionDesconocidaError);
  });
});

describe('OaRepositoryCorpus.porIds', () => {
  it(
    'resuelve por código a través de los bloques, preservando el orden pedido',
    async () => {
      const oas = await crearRepo().porIds(['OAT 9', 'MA01 OA 03', 'NO-EXISTE']);
      expect(oas.map((o) => o.codigo)).toEqual(['OAT 9', 'MA01 OA 03']);
    },
    // Lee todos los bloques del corpus; margen amplio para no flaquear bajo la suite completa.
    20_000,
  );

  it('devuelve [] para una lista vacía', async () => {
    expect(await crearRepo().porIds([])).toEqual([]);
  });
});
