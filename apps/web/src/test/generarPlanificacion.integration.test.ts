// Integración del generador híbrido (H-2.3, CA-2.3) contra los adapters file-based REALES de
// corpus/ (OA + plantilla + catálogos de verdad) con IA simulada. Vive en apps/web porque la web
// es el único lugar (composition root) que depende de @faro/application + @faro/infra-corpus juntos.
// No levanta Next ni DB: es un wiring puro use-case + adapters de archivo.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BorradorPlanificacionIa, LlmPort } from '@faro/domain';
import { GenerarPlanificacionUseCase } from '@faro/application';
import {
  CatalogoRepositoryCorpus,
  OaRepositoryCorpus,
  PlantillaRepositoryCorpus,
} from '@faro/infra-corpus';
import { crearLoggerHijo } from '@faro/observability';

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/web/src/test → repo root: 4 niveles arriba.
const CORPUS_DIR = join(__dirname, '../../../../corpus');
const ESTABLECIMIENTO = 'Escuela General José Alejandro Bernales D-114';
const log = crearLoggerHijo('web-integration-test');

function llmConIndicadoresPara(codigos: string[]): LlmPort {
  const borrador: BorradorPlanificacionIa = {
    proposito: 'Propósito de la unidad redactado por la IA (borrador).',
    experiencias: ['Experiencia 1 (borrador IA).', 'Experiencia 2 (borrador IA).'],
    indicadores: codigos.map((c) => ({ oa: c, texto: `Indicador borrador para ${c}.` })),
    seleccion_checkboxes: { metodologias_activas: ['Gamificación'] },
  };
  return {
    async generar(args) {
      const parsed = args.schema.parse(borrador);
      return { parsed, stopReason: 'end_turn', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, modelo: 'fake' };
    },
  };
}

describe('GenerarPlanificacionUseCase con corpus file-based real (CA-2.3)', () => {
  it('Formato A · Matemática 1º básico: OA idénticos al corpus, IA solo redacta el resto', async () => {
    const oas = new OaRepositoryCorpus(CORPUS_DIR, log);
    const plantillas = new PlantillaRepositoryCorpus(CORPUS_DIR, log);
    const catalogos = await new CatalogoRepositoryCorpus(CORPUS_DIR, log).catalogos();

    const corpus = await oas.porAsignaturaNivel('Matemática', '1º básico');
    const codigos = corpus.slice(0, 3).map((o) => o.codigo);

    const uc = new GenerarPlanificacionUseCase({ oas, plantillas, llm: llmConIndicadoresPara(codigos), catalogos });
    const { plan, plantilla, corpusVersionId } = await uc.ejecutar({
      establecimiento: ESTABLECIMIENTO,
      asignatura: 'Matemática',
      nivel: '1º básico',
      unidad: 'Unidad 1',
      plantilla: 'A',
      oaCodigos: codigos,
      duracion_semanas: 6,
      horas_pedagogicas: 36,
    });

    expect(plantilla.id).toBe('bernales-formato-a');
    expect(corpusVersionId).toBe('corpus@2026.1');
    expect(plan.oa.map((o) => o.codigo)).toEqual(codigos);
    for (const ref of plan.oa) {
      const fuente = corpus.find((o) => o.codigo === ref.codigo);
      expect(ref.descripcion).toBe(fuente?.descripcion); // VERBATIM del corpus (CA-2.3)
    }
    expect((plan.proposito ?? '').length).toBeGreaterThan(0);
    expect(plan.experiencias.length).toBeGreaterThan(0);
    expect(plan.indicadores_evaluacion.every((i) => i.fuente === 'ia_borrador')).toBe(true);
  });

  it('Formato B · Lenguaje 3º básico: principios DUA = datos fijos del catálogo, OA priorizados', async () => {
    const oas = new OaRepositoryCorpus(CORPUS_DIR, log);
    const plantillas = new PlantillaRepositoryCorpus(CORPUS_DIR, log);
    const catalogos = await new CatalogoRepositoryCorpus(CORPUS_DIR, log).catalogos();

    const corpus = await oas.porAsignaturaNivel('Lenguaje y Comunicación', '3º básico');
    const codigos = corpus.slice(0, 2).map((o) => o.codigo);

    const uc = new GenerarPlanificacionUseCase({ oas, plantillas, llm: llmConIndicadoresPara(codigos), catalogos });
    const { plan, plantilla } = await uc.ejecutar({
      establecimiento: ESTABLECIMIENTO,
      asignatura: 'Lenguaje y Comunicación',
      nivel: '3º básico',
      unidad: 'Bloque 1',
      plantilla: 'B',
      oaCodigos: codigos,
      periodo: '1er semestre',
    });

    expect(plantilla.id).toBe('bernales-formato-b');
    expect(plan.oa.every((o) => o.categoria === 'priorizado')).toBe(true);
    expect(plan.extras['principios_dua']).toEqual(catalogos.principios_dua.map((o) => o.etiqueta));
  });
});
