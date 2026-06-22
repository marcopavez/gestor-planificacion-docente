// packages/infra-ai/src/crearImageGen.ts
// Selección del proveedor de ImageGenPort en un solo lugar (espejo de crearLlm.ts). INV-6: el use case
// depende solo de ImageGenPort. DUAL: Imagen 4 Fast (default) o Gemini Flash Image (FARO_IMAGE_PROVIDER=flash).
// Sin API key → placeholder (degrada, no rompe). Auth: GEMINI_API_KEY o GOOGLE_API_KEY (si ambas, gana GOOGLE_API_KEY).

import type { ImageGenPort } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { ImagenLineArtAdapter } from './gemini/ImagenLineArtAdapter.js';
import { GeminiFlashImageAdapter } from './gemini/GeminiFlashImageAdapter.js';
import { PlaceholderImageGen } from './gemini/PlaceholderImageGen.js';

export type ModoImageGen = 'imagen' | 'flash' | 'placeholder';

export interface EntornoImageGen {
  readonly GEMINI_API_KEY?: string | undefined;
  readonly GOOGLE_API_KEY?: string | undefined;
  // 'imagen' (default) | 'flash'. Permite migrar de Imagen 4 Fast (deprecado) a Flash sin tocar código.
  readonly FARO_IMAGE_PROVIDER?: string | undefined;
}

export function crearImageGen(env: EntornoImageGen, log: Logger): { imageGen: ImageGenPort; modo: ModoImageGen } {
  const apiKey = env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return { imageGen: new PlaceholderImageGen(), modo: 'placeholder' };
  if (env.FARO_IMAGE_PROVIDER === 'flash') {
    return { imageGen: GeminiFlashImageAdapter.desdeApiKey(apiKey, log), modo: 'flash' };
  }
  return { imageGen: ImagenLineArtAdapter.desdeApiKey(apiKey, log), modo: 'imagen' };
}
