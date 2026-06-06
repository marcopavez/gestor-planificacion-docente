// packages/application/src/aula/cascada/GenerarPlanificacionUnidadUseCase.ts
// RF-2.5: produce la Planificación de Unidad a partir del OA del corpus (full-context, síncrono).

import type { LlmPort, PlanificacionUnidad } from '@faro/domain';
import { SchemaPlanificacionUnidad } from '@faro/domain';
import { bloqueCorpus, entradaUnidad, exigirParsed, INSTR_UNIDAD } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarPlanificacionUnidadUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutar(ctx: ContextoCascada): Promise<PlanificacionUnidad> {
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaPlanificacionUnidad,
      system: [bloqueCorpus(ctx), INSTR_UNIDAD],
      entradaUsuario: entradaUnidad(ctx),
    });
    return exigirParsed(salida);
  }
}
