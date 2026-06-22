// packages/application/src/aula/cascada/GenerarFichaUseCase.ts
// Ficha educativa para colorear (Plan 2): orquesta el DIBUJO (ResolverDibujoUseCase, cache por OA/concepto,
// compartido con la lámina) + los EJERCICIOS (GenerarEjerciciosFichaUseCase, motor de prueba) y SOBRESCRIBE
// los campos fijos de la ficha. Gate por grado ≤ 3 (1º-3º). Nace borrador (lo persiste el worker).
// INV-5: importa SOLO de @faro/domain y hermanos ./ — nunca @faro/infra-*.

import type { BancoImagenesGeneradasPort, Ficha, ImageGenPort } from '@faro/domain';
import { fugaDeTextoEnFicha, GeneracionError, gradoDeNivel, SchemaFicha, tramoDeNivel } from '@faro/domain';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { GenerarEjerciciosFichaUseCase } from './GenerarEjerciciosFichaUseCase.js';
import { ResolverDibujoUseCase } from './ResolverDibujoUseCase.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export interface DependenciasGenerarFicha {
  readonly descripcion: GenerarDescripcionDibujoUseCase;
  readonly imageGen: ImageGenPort;
  readonly banco: BancoImagenesGeneradasPort;
  readonly ejercicios: GenerarEjerciciosFichaUseCase;
}

export class GenerarFichaUseCase {
  private readonly resolver: ResolverDibujoUseCase;
  private readonly ejercicios: GenerarEjerciciosFichaUseCase;

  constructor(deps: DependenciasGenerarFicha) {
    this.resolver = new ResolverDibujoUseCase({ descripcion: deps.descripcion, imageGen: deps.imageGen, banco: deps.banco });
    this.ejercicios = deps.ejercicios;
  }

  async ejecutarConMeta(
    ctx: ContextoCascada,
    opts?: { concepto?: string; regenerar?: boolean },
  ): Promise<{ valor: Ficha; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('ficha_sin_oa');

    // Gate por GRADO: solo 1º-3º básico (igual que la lámina; el PPT/prueba/guía no se tocan).
    const grado = gradoDeNivel(ctx.nivel);
    if (!(grado >= 1 && grado <= 3)) throw new GeneracionError('ficha_tramo_no_soportado');

    const dibujo = await this.resolver.resolver(ctx, oa.codigo, opts);
    const { valor: ejercicios, meta: metaEj } = await this.ejercicios.ejecutarConMeta(ctx, opts?.concepto);

    // perfil_nivel data-driven por tramo; el gate garantiza grado ≤ 3 → tramo ∈ {'1-2','3-4'} (sin cast).
    const tramo = tramoDeNivel(ctx.nivel);
    const perfilNivel: '1-2' | '3-4' = tramo === '1-2' ? '1-2' : '3-4';

    const ficha: Ficha = {
      asignatura: ctx.asignatura,
      curso: ctx.nivel,
      oa: { codigo: oa.codigo, descripcion: oa.descripcion },
      concepto: dibujo.concepto,
      perfil_nivel: perfilNivel,
      titulo: `Ficha para colorear: ${dibujo.concepto}`,
      consigna_dibujo: 'Colorea el dibujo.',
      ejercicios,
      descripcion_dibujo: dibujo.descripcion,
      imagen_clave: dibujo.clave,
    };

    const valido = SchemaFicha.parse(ficha);
    const fuga = fugaDeTextoEnFicha(valido);
    if (fuga !== null) {
      throw new GeneracionError(`fuga_texto:${fuga.campo}#${fuga.itemIndex}(${fuga.largo})`);
    }

    return { valor: valido, meta: combinarMeta(metaEj, dibujo.meta) };
  }

  async ejecutar(ctx: ContextoCascada, opts?: { concepto?: string; regenerar?: boolean }): Promise<Ficha> {
    return (await this.ejecutarConMeta(ctx, opts)).valor;
  }
}

// La ficha hace 2 llamadas a la IA (descripción del dibujo + ejercicios). Para una sola traza, se suma el
// uso; el modelo/stopReason del principal (ejercicios, que dominan el costo). En cache-hit del dibujo su
// uso es ceros → no distorsiona.
function combinarMeta(principal: MetaGeneracion, secundaria: MetaGeneracion): MetaGeneracion {
  return {
    modelo: principal.modelo,
    stopReason: principal.stopReason,
    usage: {
      input: principal.usage.input + secundaria.usage.input,
      output: principal.usage.output + secundaria.usage.output,
      cacheRead: principal.usage.cacheRead + secundaria.usage.cacheRead,
      cacheCreation: principal.usage.cacheCreation + secundaria.usage.cacheCreation,
    },
  };
}
