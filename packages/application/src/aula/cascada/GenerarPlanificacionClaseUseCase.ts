// packages/application/src/aula/cascada/GenerarPlanificacionClaseUseCase.ts
// RF-2.6: desglosa la unidad en planificación clase a clase (momentos inicio/desarrollo/cierre).

import type { LlmPort, PlanificacionClase, PlanificacionUnidad } from '@faro/domain';
import { SchemaPlanificacionClase } from '@faro/domain';
import { bloqueCorpus, entradaClase, exigirParsedConMeta, INSTR_CLASE } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarPlanificacionClaseUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    ctx: ContextoCascada,
    unidad: PlanificacionUnidad,
  ): Promise<{ valor: PlanificacionClase; meta: MetaGeneracion }> {
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaPlanificacionClase,
      system: [bloqueCorpus(ctx), INSTR_CLASE],
      entradaUsuario: entradaClase(unidad),
    });
    return exigirParsedConMeta(salida);
  }

  async ejecutar(ctx: ContextoCascada, unidad: PlanificacionUnidad): Promise<PlanificacionClase> {
    return (await this.ejecutarConMeta(ctx, unidad)).valor;
  }
}
