// packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.ts
// Ficha educativa (Plan 2): genera los EJERCICIOS anclados al OA reusando el motor de PRUEBA
// (SchemaEjerciciosFicha = lista de ItemPrueba; INSTR_FICHA soporta 1º-2º pre-lectores e ítems pictóricos).
// La IA solo redacta los ítems; el use case valida schema + no-fuga. Nacen borrador (los persiste el worker).
// INV-5: importa SOLO de @faro/domain y hermanos ./ — nunca @faro/infra-*.

import type { ItemPruebaType, LlmPort } from '@faro/domain';
import { fugaDeTextoEnItems, GeneracionError, SchemaEjerciciosFicha } from '@faro/domain';
import { bloqueCorpus, entradaFicha, exigirParsedConMeta, INSTR_FICHA } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarEjerciciosFichaUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    ctx: ContextoCascada,
    concepto?: string,
  ): Promise<{ valor: ItemPruebaType[]; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('ficha_sin_oa');

    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaEjerciciosFicha,
      system: [bloqueCorpus(ctx), INSTR_FICHA],
      entradaUsuario: entradaFicha(ctx, concepto),
    });
    const { valor, meta } = exigirParsedConMeta(salida);

    if (valor.ejercicios.length === 0) throw new GeneracionError('ficha_sin_ejercicios');

    // Guardia anti-fuga: el schema (z.string()) no acota el texto libre y el SDK no soporta maxLength
    // en structured outputs → se valida tras parsear y se rechaza+reintenta (INV-2). Reusa la guardia de prueba.
    const fuga = fugaDeTextoEnItems(valor.ejercicios);
    if (fuga !== null) {
      throw new GeneracionError(`fuga_texto:${fuga.campo}#${fuga.itemIndex}(${fuga.largo})`);
    }

    return { valor: valor.ejercicios, meta };
  }

  async ejecutar(ctx: ContextoCascada, concepto?: string): Promise<ItemPruebaType[]> {
    return (await this.ejecutarConMeta(ctx, concepto)).valor;
  }
}
