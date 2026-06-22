// packages/infra-ai/src/gemini/ImagenLineArtAdapter.ts
// Adapter de ImageGenPort sobre Google Imagen 4 Fast (Gemini API, método generateImages). INV-6: el
// modelId vive en UNA constante. OJO: Imagen 4 está DEPRECADO (shutdown 2026-08-17) → existe el adapter
// hermano GeminiFlashImageAdapter, seleccionable por env (ver crearImageGen). Imagen es solo-inglés:
// la descripción la produce Claude en inglés; el prompt nunca pide personajes con copyright/marca.

import { GoogleGenAI, PersonGeneration } from '@google/genai';
import type { ImageGenPort, OpcionesLineArt } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { construirPromptLineArt } from './promptLineArt.js';

export class ImagenLineArtAdapter implements ImageGenPort {
  static readonly MODELO = 'imagen-4.0-fast-generate-001';

  private constructor(
    private readonly ai: GoogleGenAI,
    private readonly log: Logger,
  ) {}

  static desdeApiKey(apiKey: string, log: Logger): ImagenLineArtAdapter {
    return new ImagenLineArtAdapter(new GoogleGenAI({ apiKey }), log);
  }

  async generarLineArt(descripcion: string, opts?: OpcionesLineArt): Promise<Buffer | null> {
    const respuesta = await this.ai.models.generateImages({
      model: ImagenLineArtAdapter.MODELO,
      prompt: construirPromptLineArt(descripcion),
      config: {
        numberOfImages: 1,
        aspectRatio: opts?.aspectRatio ?? '3:4',
        personGeneration: PersonGeneration.DONT_ALLOW, // material infantil: no generar personas
      },
    });
    const bytes = respuesta.generatedImages?.[0]?.image?.imageBytes;
    if (bytes === undefined) {
      throw new Error('Imagen 4 Fast no devolvió bytes de imagen.'); // transitorio → el worker reintenta
    }
    const png = Buffer.from(bytes, 'base64');
    this.log.info({ modelo: ImagenLineArtAdapter.MODELO, bytes: png.length }, 'imagegen.imagen.linea_bn');
    return png;
  }
}
