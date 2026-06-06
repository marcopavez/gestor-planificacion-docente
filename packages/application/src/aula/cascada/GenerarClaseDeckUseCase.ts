// packages/application/src/aula/cascada/GenerarClaseDeckUseCase.ts
// RF-2.8: produce el deck (ClaseDeck) de UNA clase. El render a .pptx lo hace el ExportPort.

import type { ClaseDeck, ClasePlanificadaType, LlmPort, PlanificacionUnidad } from '@faro/domain';
import { SchemaClaseDeck } from '@faro/domain';
import { bloqueCorpus, entradaDeck, exigirParsed, INSTR_DECK } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarClaseDeckUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutar(
    ctx: ContextoCascada,
    unidad: PlanificacionUnidad,
    clase: ClasePlanificadaType,
  ): Promise<ClaseDeck> {
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaClaseDeck,
      system: [bloqueCorpus(ctx), INSTR_DECK],
      entradaUsuario: entradaDeck(unidad, clase),
    });
    return exigirParsed(salida);
  }
}
