// packages/application/src/aula/cascada/CascadaAulaUseCase.ts
// Orquestador síncrono de la cascada de Aula (modo demo): OA → Unidad → {Clase, Prueba} → Deck.
// Full-context (sin DB/RAG, blueprint §6) y genérico por asignatura/nivel. El .pptx lo produce
// el ExportPort en la composition root; aquí se generan los 4 artefactos estructurados.

import type { LlmPort, OaVigencia } from '@faro/domain';
import { correrGatesCascada, ReglaDominioError } from '@faro/domain';
import { GenerarClaseDeckUseCase } from './GenerarClaseDeckUseCase.js';
import { GenerarPlanificacionClaseUseCase } from './GenerarPlanificacionClaseUseCase.js';
import { GenerarPlanificacionUnidadUseCase } from './GenerarPlanificacionUnidadUseCase.js';
import { GenerarPruebaCascadaUseCase } from './GenerarPruebaCascadaUseCase.js';
import { refClasePrincipal } from './generacion.js';
import type { ContextoCascada, ResultadoCascada } from './tipos.js';

export class CascadaAulaUseCase {
  private readonly unidad: GenerarPlanificacionUnidadUseCase;
  private readonly clase: GenerarPlanificacionClaseUseCase;
  private readonly prueba: GenerarPruebaCascadaUseCase;
  private readonly deck: GenerarClaseDeckUseCase;

  constructor(llm: LlmPort) {
    this.unidad = new GenerarPlanificacionUnidadUseCase(llm);
    this.clase = new GenerarPlanificacionClaseUseCase(llm);
    this.prueba = new GenerarPruebaCascadaUseCase(llm);
    this.deck = new GenerarClaseDeckUseCase(llm);
  }

  async ejecutar(ctx: ContextoCascada): Promise<ResultadoCascada> {
    if (ctx.oaSeleccionados.length === 0) {
      throw new ReglaDominioError('oa_requerido', 'La cascada requiere al menos un OA del corpus.');
    }

    const unidad = await this.unidad.ejecutarConMeta(ctx);

    // Clase y prueba dependen solo de la unidad → se generan en paralelo.
    const [clase, prueba] = await Promise.all([
      this.clase.ejecutarConMeta(ctx, unidad.valor),
      this.prueba.ejecutarConMeta(ctx, unidad.valor),
    ]);

    const clasePrincipal = refClasePrincipal(clase.valor);
    if (clasePrincipal === null) {
      throw new ReglaDominioError('clase_requerida', 'La planificación de clase no contiene clases para el deck.');
    }

    const deck = await this.deck.ejecutarConMeta(ctx, unidad.valor, clasePrincipal);

    // INV-2: el LLM propuso; los gates deterministas disponen. Se reporta (no se persiste) —
    // la revisión humana (HIL) decide; el reintento acotado (RF-2.15) queda como TODO.
    const corpus: readonly OaVigencia[] =
      ctx.oaCorpusValidacion ?? ctx.oaSeleccionados.map((o) => ({ codigo: o.codigo, vigente: true }));
    const gates = correrGatesCascada({
      unidad: unidad.valor,
      clase: clase.valor,
      prueba: prueba.valor,
      deck: deck.valor,
      corpus,
    });

    return {
      unidad: unidad.valor,
      clase: clase.valor,
      prueba: prueba.valor,
      deck: deck.valor,
      gates,
      // Metadatos por artefacto: alimentan las 4 filas de traza_ia en el worker (RF-PA.10).
      metadatos: {
        unidad: unidad.meta,
        clase: clase.meta,
        prueba: prueba.meta,
        deck: deck.meta,
      },
    };
  }
}
