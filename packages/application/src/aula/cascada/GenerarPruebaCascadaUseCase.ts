// packages/application/src/aula/cascada/GenerarPruebaCascadaUseCase.ts
// RF-2.7: produce la Prueba (evaluación FORMATIVA por defecto) a partir de la unidad, en full-context.
// Distinta de GenerarPruebaUseCase (esqueleto H-0.8, ruta DB/RAG): aquí no hay repos ni cola.

import type { LlmPort, PlanificacionUnidad, Prueba } from '@faro/domain';
import { fugaDeTextoEnPrueba, GeneracionError, itemsDuplicados, SchemaPrueba, tramoDeNivel } from '@faro/domain';
import { bloqueCorpus, entradaPrueba, exigirParsedConMeta, INSTR_PRUEBA } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarPruebaCascadaUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    ctx: ContextoCascada,
    unidad: PlanificacionUnidad,
  ): Promise<{ valor: Prueba; meta: MetaGeneracion }> {
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaPrueba,
      system: [bloqueCorpus(ctx), INSTR_PRUEBA],
      entradaUsuario: entradaPrueba(unidad, tramoDeNivel(unidad.nivel)),
    });
    const { valor: prueba, meta } = exigirParsedConMeta(salida);

    // Paridad con GenerarPruebaFormativaUseCase: la cascada también rechaza generaciones inválidas para
    // que nunca se persistan/exporten (INV-2). El schema (z.string()) no acota el texto libre, así que una
    // IA que vuelca su razonamiento en un campo (p. ej. 'imagen') pasa el parse → la cazamos aquí.
    const fuga = fugaDeTextoEnPrueba(prueba);
    if (fuga !== null) {
      throw new GeneracionError(`fuga_texto:${fuga.campo}#${fuga.itemIndex}(${fuga.largo})`);
    }

    // Anti-duplicados: la IA a veces repite el mismo enunciado en dos ítems (sólo cambia la imagen).
    const dup = itemsDuplicados(prueba.items);
    if (dup !== null) {
      throw new GeneracionError(`items_duplicados:#${dup.itemIndex}`);
    }

    return { valor: prueba, meta };
  }

  async ejecutar(ctx: ContextoCascada, unidad: PlanificacionUnidad): Promise<Prueba> {
    return (await this.ejecutarConMeta(ctx, unidad)).valor;
  }
}
