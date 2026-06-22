// packages/infra-ai/src/gemini/GeminiFlashImageAdapter.ts
// Adapter de ImageGenPort sobre Gemini Flash Image (método generateContent). Sucesor de Imagen 4 Fast
// (que se retira 2026-08-17). INV-6: el modelId vive en UNA constante. La extracción del PNG se aísla
// en extraerImagenDeRespuesta (pura, testeable sin red).

import { GoogleGenAI, Modality } from '@google/genai';
import type { ImageGenPort, OpcionesLineArt } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { construirPromptLineArt } from './promptLineArt.js';

// Forma estructural mínima de lo que leemos de la respuesta (evita `any`; testeable con un objeto plano).
interface ParteRespuesta {
  readonly text?: string;
  readonly inlineData?: { readonly data?: string; readonly mimeType?: string };
}
interface RespuestaContenido {
  readonly candidates?: ReadonlyArray<{ readonly content?: { readonly parts?: ReadonlyArray<ParteRespuesta> } }>;
}

/** Extrae el PNG (base64) de la primera parte con inlineData. null si el modelo respondió solo texto/rechazo. */
export function extraerImagenDeRespuesta(resp: RespuestaContenido): Buffer | null {
  const partes = resp.candidates?.[0]?.content?.parts ?? [];
  const parteImg = partes.find((p) => p.inlineData?.data !== undefined);
  const data = parteImg?.inlineData?.data;
  return data !== undefined ? Buffer.from(data, 'base64') : null;
}

export class GeminiFlashImageAdapter implements ImageGenPort {
  static readonly MODELO = 'gemini-3.1-flash-image';

  private constructor(
    private readonly ai: GoogleGenAI,
    private readonly log: Logger,
  ) {}

  static desdeApiKey(apiKey: string, log: Logger): GeminiFlashImageAdapter {
    return new GeminiFlashImageAdapter(new GoogleGenAI({ apiKey }), log);
  }

  async generarLineArt(descripcion: string, opts?: OpcionesLineArt): Promise<Buffer | null> {
    const respuesta = await this.ai.models.generateContent({
      model: GeminiFlashImageAdapter.MODELO,
      contents: construirPromptLineArt(descripcion),
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE], // OBLIGATORIO para salida de imagen
        // SDK v2: el aspect ratio se pasa via imageConfig (no responseFormat.image.aspectRatio)
        imageConfig: { aspectRatio: opts?.aspectRatio ?? '3:4' },
      },
    });
    const png = extraerImagenDeRespuesta(respuesta as unknown as RespuestaContenido);
    if (png === null) {
      throw new Error('Gemini Flash Image no devolvió una parte de imagen.'); // transitorio → el worker reintenta
    }
    this.log.info({ modelo: GeminiFlashImageAdapter.MODELO, bytes: png.length }, 'imagegen.flash.linea_bn');
    return png;
  }
}
