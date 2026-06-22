// packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.ts
// Material para colorear (Plan 1): la LÁMINA. Delega el pipeline de dibujo (cache por OA/concepto) en
// ResolverDibujoUseCase (compartido con la ficha, Plan 2) y SOBRESCRIBE los campos fijos de la lámina.
// La lámina nace borrador (HIL) en el wrapper DocumentoGenerado (lo persiste el worker).
// REGLA INV-5: importa SOLO de @faro/domain (puertos) y de hermanos en ./ — NUNCA de @faro/infra-*.

import type { Lamina } from '@faro/domain';
import { GeneracionError, gradoDeNivel } from '@faro/domain';
import { ResolverDibujoUseCase, type DependenciasResolverDibujo } from './ResolverDibujoUseCase.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

// La DI pública no cambia: el worker sigue inyectando { descripcion, imageGen, banco }.
export type DependenciasGenerarMaterialColorear = DependenciasResolverDibujo;

export class GenerarMaterialColorearUseCase {
  private readonly resolver: ResolverDibujoUseCase;

  constructor(deps: DependenciasGenerarMaterialColorear) {
    this.resolver = new ResolverDibujoUseCase(deps);
  }

  async ejecutarConMeta(
    ctx: ContextoCascada,
    opts?: { concepto?: string; regenerar?: boolean },
  ): Promise<{ valor: Lamina; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('material_sin_oa');

    // Gate por GRADO (no por tramo agrupado): solo 1º-3º básico (decisión del dueño).
    const grado = gradoDeNivel(ctx.nivel);
    if (!(grado >= 1 && grado <= 3)) throw new GeneracionError('material_tramo_no_soportado');

    const { clave, concepto, descripcion, meta } = await this.resolver.resolver(ctx, oa.codigo, opts);
    return { valor: this.ensamblar(ctx, oa, concepto, descripcion, clave), meta };
  }

  async ejecutar(ctx: ContextoCascada, opts?: { concepto?: string; regenerar?: boolean }): Promise<Lamina> {
    return (await this.ejecutarConMeta(ctx, opts)).valor;
  }

  // SOBRESCRIBE los campos fijos (asignatura/curso/oa/consigna/titulo) — la IA solo aportó la descripción.
  private ensamblar(
    ctx: ContextoCascada,
    oa: { codigo: string; descripcion: string },
    concepto: string,
    descripcionDibujo: string,
    clave: string,
  ): Lamina {
    return {
      asignatura: ctx.asignatura,
      curso: ctx.nivel,
      oa: { codigo: oa.codigo, descripcion: oa.descripcion },
      concepto,
      titulo: `Para colorear: ${concepto}`,
      consigna: 'Pinta el dibujo.',
      descripcion_dibujo: descripcionDibujo,
      imagen_clave: clave,
    };
  }
}
