// packages/application/src/aula/cascada/GenerarPlanificacionUnidadUseCase.ts
// RF-2.5: produce la Planificación de Unidad a partir del OA del corpus (full-context, síncrono).

import type { LlmPort, PlanificacionUnidad } from '@faro/domain';
import { SchemaPlanificacionUnidad } from '@faro/domain';
import { bloqueCorpus, entradaUnidad, exigirParsedConMeta, INSTR_UNIDAD } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarPlanificacionUnidadUseCase {
  constructor(private readonly llm: LlmPort) {}

  // Variante con metadatos (modelo/usage) para registrar la traza por artefacto (RF-PA.10).
  async ejecutarConMeta(ctx: ContextoCascada): Promise<{ valor: PlanificacionUnidad; meta: MetaGeneracion }> {
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaPlanificacionUnidad,
      system: [bloqueCorpus(ctx), INSTR_UNIDAD],
      entradaUsuario: entradaUnidad(ctx),
    });
    return exigirParsedConMeta(salida);
  }

  async ejecutar(ctx: ContextoCascada): Promise<PlanificacionUnidad> {
    return (await this.ejecutarConMeta(ctx)).valor;
  }
}
