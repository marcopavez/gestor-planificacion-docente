// packages/application/src/aula/cascada/ResolverIlustracionUseCase.ts
// Resolver genérico de ILUSTRACIONES line-art ancladas (prueba/guía/PPT). Hermano de ResolverDibujoUseCase,
// pero la clave es la DESCRIPCIÓN anclada (claveIlustracion), no (OA, concepto): la descripción ya conoce
// el enunciado/slide. cache HIT → reusa el PNG; MISS → Imagen dibuja → se cachea. Sin Imagen (sin API key)
// → png=null → devuelve null (degradación: el ítem/slide no gana imagen_clave; el export usa el placeholder).
// INV-5: importa SOLO de @faro/domain — nunca @faro/infra-*.

import type {
  BancoImagenesGeneradasPort,
  ImageGenPort,
  MetaDibujo,
  OpcionesLineArt,
} from '@faro/domain';
import { claveIlustracion, IMAGENES_VERSION } from '@faro/domain';

export interface DependenciasResolverIlustracion {
  readonly imageGen: ImageGenPort;
  readonly banco: BancoImagenesGeneradasPort;
}

export class ResolverIlustracionUseCase {
  private readonly imageGen: ImageGenPort;
  private readonly banco: BancoImagenesGeneradasPort;

  constructor(deps: DependenciasResolverIlustracion) {
    this.imageGen = deps.imageGen;
    this.banco = deps.banco;
  }

  /**
   * Resuelve la ilustración de `descripcion`; devuelve su clave de cache, o null si no se pudo generar
   * (sin API key). `oaCodigo` solo alimenta la metadata del banco (trazabilidad). `aspectRatio` default 1:1.
   */
  async resolver(
    descripcion: string,
    oaCodigo: string,
    opts?: { aspectRatio?: OpcionesLineArt['aspectRatio'] },
  ): Promise<string | null> {
    const clave = claveIlustracion(descripcion);

    const cacheado = await this.banco.buscar(clave);
    if (cacheado !== null) return clave;

    const png = await this.imageGen.generarLineArt(descripcion, { aspectRatio: opts?.aspectRatio ?? '1:1' });
    if (png === null) return null; // degradación: sin Imagen, no se cachea

    const meta: MetaDibujo = {
      oaCodigo,
      concepto: descripcion.slice(0, 80),
      descripcion,
      modelo: 'imagegen',
      imagenesVersion: IMAGENES_VERSION,
    };
    await this.banco.guardar(clave, png, meta);
    return clave;
  }
}
