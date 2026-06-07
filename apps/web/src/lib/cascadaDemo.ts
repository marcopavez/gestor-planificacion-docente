// apps/web/src/lib/cascadaDemo.ts
// Composition root del demo de Aula: arma el LlmPort (live si hay ANTHROPIC_API_KEY, si no demo
// con samples), corre la cascada síncrona y renderiza el deck a .pptx. Es el ÚNICO lugar que
// conoce los adapters concretos (INV-5). Decisión demo: sin token de suscripción en la app.

import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CascadaAulaUseCase } from '@faro/application';
import type { ContextoCascada, OaCorpus, ResultadoCascada } from '@faro/application';
import type { LlmPort } from '@faro/domain';
import { AnthropicLlmAdapter } from '@faro/infra-ai';
import { PptxExportAdapter } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import { cargarCorpus } from './corpus';
import { materiaPorId } from './materias';
import { raizRepo } from './raiz';
import { crearSamplesLlm } from './samplesLlm';

export type ModoCascada = 'demo' | 'live';

export interface PptxDescargable {
  readonly nombre: string;
  readonly mime: string;
  readonly bytes: number;
  readonly base64: string; // demo: descarga inline. Prod: object storage + URL firmada (spec §4.8).
}

export interface SalidaCascadaDemo {
  readonly modo: ModoCascada;
  readonly materiaId: string;
  readonly resultado: ResultadoCascada;
  readonly pptx: PptxDescargable;
}

export interface EntradaCascadaDemo {
  readonly materiaId: string;
  readonly oaCodigos?: readonly string[];
  readonly unidadTitulo?: string;
  readonly establecimiento?: string;
}

function construirLlm(samplesDir: string): { llm: LlmPort; modo: ModoCascada } {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey) {
    return { llm: AnthropicLlmAdapter.desdeApiKey(apiKey, crearLoggerHijo('infra-ai')), modo: 'live' };
  }
  return { llm: crearSamplesLlm(samplesDir), modo: 'demo' };
}

export async function ejecutarCascadaDemo(input: EntradaCascadaDemo): Promise<SalidaCascadaDemo> {
  const materia = materiaPorId(input.materiaId);
  if (materia === null) {
    throw new Error(`Materia desconocida: ${input.materiaId}`);
  }

  const corpus = cargarCorpus(materia);
  const samplesDir = join(raizRepo(), 'samples', materia.samplesDir);
  const { llm, modo } = construirLlm(samplesDir);

  // OA seleccionados por el/la docente, o todos los del corpus si no se especifican.
  const codigos = input.oaCodigos;
  const seleccion =
    codigos && codigos.length > 0 ? corpus.oa.filter((oa) => codigos.includes(oa.codigo)) : corpus.oa;
  const oaSeleccionados: OaCorpus[] = seleccion.map((oa) => ({
    codigo: oa.codigo,
    categoria: 'basal',
    descripcion: oa.descripcion,
    indicadores: oa.indicadores.length > 0 ? [...oa.indicadores] : undefined,
  }));

  const ctx: ContextoCascada = {
    establecimiento: input.establecimiento ?? 'Colegio Demo',
    asignatura: corpus.asignatura,
    nivel: corpus.nivel,
    unidadTitulo: input.unidadTitulo,
    oaSeleccionados,
    corpusVersionId: corpus.corpusVersionId,
    // citationGate valida contra el corpus COMPLETO de la asignatura (existe + vigente),
    // no solo contra la selección del docente. En el demo todo el corpus está vigente.
    oaCorpusValidacion: corpus.oa.map((oa) => ({ codigo: oa.codigo, vigente: true })),
  };

  const resultado = await new CascadaAulaUseCase(llm).ejecutar(ctx);

  // Render del deck a .pptx en /generated (gitignored) y lectura para descarga inline.
  const exporter = new PptxExportAdapter(join(raizRepo(), 'generated'), crearLoggerHijo('infra-export'));
  const archivo = await exporter.exportarPptx(resultado.deck);
  const contenido = await readFile(archivo.ruta);

  return {
    modo,
    materiaId: materia.id,
    resultado,
    pptx: {
      nombre: basename(archivo.ruta),
      mime: archivo.mime,
      bytes: archivo.bytes,
      base64: contenido.toString('base64'),
    },
  };
}
