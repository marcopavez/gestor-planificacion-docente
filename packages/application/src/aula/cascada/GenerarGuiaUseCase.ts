// packages/application/src/aula/cascada/GenerarGuiaUseCase.ts
// Tanda 1 (guía del alumno): genera una Guia desde un ContextoCascada con UN OA + un conocimiento.
// Standalone desde el OA (no usa planificación). Híbrido: la IA redacta explicacion/ejemplo/ejercicios;
// el use case SOBRESCRIBE los campos fijos (asignatura/curso/oa/conocimiento/perfil_nivel/titulo).
// Tramo 1-2 NO soportado en tanda 1 (difiere hasta tener imágenes reales). Nace borrador (HIL).

import type { Guia, LlmPort } from '@faro/domain';
import { fugaDeTextoEnGuia, GeneracionError, SchemaGuia, tramoDeNivel } from '@faro/domain';
import { bloqueCorpus, entradaGuia, exigirParsedConMeta, INSTR_GUIA } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarGuiaUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    ctx: ContextoCascada,
    conocimiento: string,
  ): Promise<{ valor: Guia; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('guia_sin_oa');

    const tramo = tramoDeNivel(ctx.nivel);
    // Tanda 1: solo 3-4 / 5-6. El tramo 1-2 es casi pura imagen → difiere (ver spec §3).
    if (tramo === '1-2') throw new GeneracionError('guia_tramo_no_soportado');

    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaGuia,
      system: [bloqueCorpus(ctx), INSTR_GUIA],
      entradaUsuario: entradaGuia(ctx, conocimiento),
    });
    const { valor: borrador, meta } = exigirParsedConMeta(salida);

    // Ensamblaje: SOBRESCRIBE lo que NO inventa la IA (datos fijos del contexto/OA).
    const guia: Guia = {
      ...borrador,
      asignatura: ctx.asignatura,
      curso: ctx.nivel,
      oa: { codigo: oa.codigo, descripcion: oa.descripcion },
      conocimiento,
      perfil_nivel: tramo, // narrowed a '3-4' | '5-6' tras el guard de arriba
      titulo: `Guía: ${conocimiento}`,
    };

    const valido = SchemaGuia.parse(guia);

    // Guard anti-fuga (INV-2): la IA puede volcar razonamiento en texto libre → rechazar → reintenta.
    const fuga = fugaDeTextoEnGuia(valido);
    if (fuga !== null) {
      throw new GeneracionError(`fuga_texto:${fuga.campo}(${fuga.largo})`);
    }

    return { valor: valido, meta };
  }

  async ejecutar(ctx: ContextoCascada, conocimiento: string): Promise<Guia> {
    return (await this.ejecutarConMeta(ctx, conocimiento)).valor;
  }
}
