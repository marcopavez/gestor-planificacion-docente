// packages/application/src/aula/cascada/GenerarClaseDeckUseCase.ts
// RF-2.8: produce el deck (ClaseDeck) de UNA clase. El render a .pptx lo hace el ExportPort.

import type { ClaseDeck, ClasePlanificadaType, LlmPort, PlanificacionUnidad } from '@faro/domain';
import { SchemaClaseDeck } from '@faro/domain';
import { bloqueCorpus, entradaDeck, exigirParsedConMeta, INSTR_DECK } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarClaseDeckUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    ctx: ContextoCascada,
    unidad: PlanificacionUnidad,
    clase: ClasePlanificadaType,
  ): Promise<{ valor: ClaseDeck; meta: MetaGeneracion }> {
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaClaseDeck,
      system: [bloqueCorpus(ctx), INSTR_DECK],
      entradaUsuario: entradaDeck(unidad, clase),
    });
    return exigirParsedConMeta(salida);
  }

  async ejecutar(
    ctx: ContextoCascada,
    unidad: PlanificacionUnidad,
    clase: ClasePlanificadaType,
  ): Promise<ClaseDeck> {
    return (await this.ejecutarConMeta(ctx, unidad, clase)).valor;
  }
}
