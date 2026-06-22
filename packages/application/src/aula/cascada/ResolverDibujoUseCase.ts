// packages/application/src/aula/cascada/ResolverDibujoUseCase.ts
// Pipeline de dibujo compartido (Plan 1 → factorizado para el Plan 2): cache por (OA, concepto).
//   cache HIT → reusa el dibujo (sin Claude ni Imagen).
//   cache MISS / regenerar → Claude propone la descripción (EN) → Imagen la dibuja → se cachea el PNG.
//   Si Imagen no está disponible (sin API key), png=null → NO se cachea; el caller ensambla con placeholder.
// Lo usan GenerarMaterialColorearUseCase (lámina) y GenerarFichaUseCase (ficha): mismo (OA, concepto) →
// mismo PNG cacheado. INV-5: importa SOLO de @faro/domain y hermanos ./ — nunca @faro/infra-*.

import type { BancoImagenesGeneradasPort, ImageGenPort, MetaDibujo } from '@faro/domain';
import { claveDibujo, IMAGENES_VERSION } from '@faro/domain';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

// Meta sintética para el camino cache-hit (no hubo llamada al LLM).
const META_CACHE: MetaGeneracion = {
  modelo: 'cache',
  usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
  stopReason: 'cache_hit',
};

export interface DependenciasResolverDibujo {
  readonly descripcion: GenerarDescripcionDibujoUseCase;
  readonly imageGen: ImageGenPort;
  readonly banco: BancoImagenesGeneradasPort;
}

export interface DibujoResuelto {
  readonly clave: string;
  readonly concepto: string;
  readonly descripcion: string; // descripción EN (alt-text / placeholder si falta el PNG)
  readonly meta: MetaGeneracion;
}

export class ResolverDibujoUseCase {
  private readonly descripcion: GenerarDescripcionDibujoUseCase;
  private readonly imageGen: ImageGenPort;
  private readonly banco: BancoImagenesGeneradasPort;

  constructor(deps: DependenciasResolverDibujo) {
    this.descripcion = deps.descripcion;
    this.imageGen = deps.imageGen;
    this.banco = deps.banco;
  }

  async resolver(
    ctx: ContextoCascada,
    oaCodigo: string,
    opts?: { concepto?: string; regenerar?: boolean },
  ): Promise<DibujoResuelto> {
    const clave = claveDibujo(oaCodigo, opts?.concepto);

    // cache HIT (salvo regenerar): reusa el dibujo y su descripción/concepto.
    if (opts?.regenerar !== true) {
      const cacheado = await this.banco.buscar(clave);
      if (cacheado !== null) {
        return { clave, concepto: cacheado.concepto, descripcion: cacheado.descripcion, meta: META_CACHE };
      }
    }

    // cache MISS / regenerar: Claude propone el dibujo (EN), Imagen lo dibuja.
    const { valor: desc, meta } = await this.descripcion.ejecutarConMeta(ctx, opts?.concepto);
    const png = await this.imageGen.generarLineArt(desc.descripcion_en, { aspectRatio: '3:4' });

    if (png !== null) {
      const metaDibujo: MetaDibujo = {
        oaCodigo,
        concepto: desc.concepto,
        descripcion: desc.descripcion_en,
        modelo: meta.modelo,
        imagenesVersion: IMAGENES_VERSION,
      };
      await this.banco.guardar(clave, png, metaDibujo);
    }

    return { clave, concepto: desc.concepto, descripcion: desc.descripcion_en, meta };
  }
}
