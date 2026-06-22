// packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.ts
// Material para colorear (Plan 1): orquesta el patrón híbrido con cache por (OA/concepto).
//   cache HIT → reusa el dibujo (sin Claude ni Imagen).
//   cache MISS / regenerar → Claude propone la descripción (EN) anclada al OA → Imagen la dibuja →
//     se cachea el PNG. Si Imagen no está disponible (sin API key), png=null → la lámina sale con
//     placeholder (no rompe; INV degradación).
// La lámina nace borrador (HIL) en el wrapper DocumentoGenerado (lo persiste el worker).

// REGLA INV-5: este use case (application) importa SOLO de @faro/domain (puertos) y de hermanos en
// ./ — NUNCA de @faro/infra-*. ESLint lo bloquea. El worker inyecta los adapters concretos.
import type { BancoImagenesGeneradasPort, ImageGenPort, Lamina, MetaDibujo } from '@faro/domain';
import { claveDibujo, GeneracionError, gradoDeNivel, IMAGENES_VERSION } from '@faro/domain';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

// Meta sintética para el camino cache-hit (no hubo llamada al LLM).
const META_CACHE: MetaGeneracion = {
  modelo: 'cache',
  usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
  stopReason: 'cache_hit',
};

export interface DependenciasGenerarMaterialColorear {
  readonly descripcion: GenerarDescripcionDibujoUseCase;
  readonly imageGen: ImageGenPort;
  readonly banco: BancoImagenesGeneradasPort;
}

export class GenerarMaterialColorearUseCase {
  private readonly descripcion: GenerarDescripcionDibujoUseCase;
  private readonly imageGen: ImageGenPort;
  private readonly banco: BancoImagenesGeneradasPort;

  constructor(deps: DependenciasGenerarMaterialColorear) {
    this.descripcion = deps.descripcion;
    this.imageGen = deps.imageGen;
    this.banco = deps.banco;
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

    const clave = claveDibujo(oa.codigo, opts?.concepto);

    // cache HIT (salvo regenerar): reusa el dibujo y su descripción/concepto.
    if (opts?.regenerar !== true) {
      const cacheado = await this.banco.buscar(clave);
      if (cacheado !== null) {
        return { valor: this.ensamblar(ctx, oa, cacheado.concepto, cacheado.descripcion, clave), meta: META_CACHE };
      }
    }

    // cache MISS / regenerar: Claude propone el dibujo (EN), Imagen lo dibuja.
    const { valor: desc, meta } = await this.descripcion.ejecutarConMeta(ctx, opts?.concepto);
    const png = await this.imageGen.generarLineArt(desc.descripcion_en, { aspectRatio: '3:4' });

    if (png !== null) {
      const metaDibujo: MetaDibujo = {
        oaCodigo: oa.codigo,
        concepto: desc.concepto,
        descripcion: desc.descripcion_en,
        modelo: meta.modelo,
        imagenesVersion: IMAGENES_VERSION,
      };
      await this.banco.guardar(clave, png, metaDibujo);
    }

    return { valor: this.ensamblar(ctx, oa, desc.concepto, desc.descripcion_en, clave), meta };
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
