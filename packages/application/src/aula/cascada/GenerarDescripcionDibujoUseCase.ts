// packages/application/src/aula/cascada/GenerarDescripcionDibujoUseCase.ts
// Material para colorear (Plan 1): la IA propone QUÉ dibujar anclado al OA (tarea 'redaccion').
// Espejo minimal de GenerarGuiaUseCase: bloqueCorpus para grounding, exigirParsedConMeta, guard anti-fuga.
// No sobrescribe campos (la salida es solo {concepto, descripcion_en}); el OA lo fija el llamador aguas abajo.

import type { DescripcionDibujo, LlmPort } from '@faro/domain';
import { fugaDeTextoEnDescripcion, GeneracionError, SchemaDescripcionDibujo } from '@faro/domain';
import { bloqueCorpus, entradaDibujo, exigirParsedConMeta, INSTR_DIBUJO } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarDescripcionDibujoUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    ctx: ContextoCascada,
    concepto?: string,
  ): Promise<{ valor: DescripcionDibujo; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('dibujo_sin_oa');

    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaDescripcionDibujo,
      system: [bloqueCorpus(ctx), INSTR_DIBUJO],
      entradaUsuario: entradaDibujo(ctx, concepto),
    });
    const { valor, meta } = exigirParsedConMeta(salida);

    const fuga = fugaDeTextoEnDescripcion(valor);
    if (fuga !== null) throw new GeneracionError(`fuga_texto:${fuga.campo}(${fuga.largo})`);

    return { valor, meta };
  }

  async ejecutar(ctx: ContextoCascada, concepto?: string): Promise<DescripcionDibujo> {
    return (await this.ejecutarConMeta(ctx, concepto)).valor;
  }
}
