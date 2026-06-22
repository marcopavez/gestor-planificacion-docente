// packages/infra-ai/src/gemini/PlaceholderImageGen.ts
// Adapter degradado: sin API key, generarLineArt devuelve null → el caller ensambla la lámina con un
// placeholder (no rompe). Es el fallback de crearImageGen cuando no hay clave de proveedor.

import type { ImageGenPort } from '@faro/domain';

export class PlaceholderImageGen implements ImageGenPort {
  async generarLineArt(_descripcion: string): Promise<Buffer | null> {
    return null;
  }
}
