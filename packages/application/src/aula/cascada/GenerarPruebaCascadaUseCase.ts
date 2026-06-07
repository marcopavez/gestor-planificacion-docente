// packages/application/src/aula/cascada/GenerarPruebaCascadaUseCase.ts
// RF-2.7: produce la Prueba (sumativa, Decreto 67) a partir de la unidad, en full-context.
// Distinta de GenerarPruebaUseCase (esqueleto H-0.8, ruta DB/RAG): aquí no hay repos ni cola.

import type { LlmPort, PlanificacionUnidad, Prueba } from '@faro/domain';
import { SchemaPrueba } from '@faro/domain';
import { bloqueCorpus, entradaPrueba, exigirParsed, INSTR_PRUEBA } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarPruebaCascadaUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutar(ctx: ContextoCascada, unidad: PlanificacionUnidad): Promise<Prueba> {
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaPrueba,
      system: [bloqueCorpus(ctx), INSTR_PRUEBA],
      entradaUsuario: entradaPrueba(unidad),
    });
    return exigirParsed(salida);
  }
}
