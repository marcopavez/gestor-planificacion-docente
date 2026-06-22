import { describe, expect, it } from 'vitest';
import { extraerImagenDeRespuesta } from './GeminiFlashImageAdapter.js';

describe('extraerImagenDeRespuesta', () => {
  it('extrae el PNG (base64) de la parte inlineData, ignorando partes de texto', () => {
    const b64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    const resp = {
      candidates: [{ content: { parts: [{ text: 'aquí tienes' }, { inlineData: { data: b64, mimeType: 'image/png' } }] } }],
    };
    const png = extraerImagenDeRespuesta(resp);
    expect(png).not.toBeNull();
    expect(png?.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
  });

  it('devuelve null si no hay parte de imagen (el modelo respondió solo texto/rechazo)', () => {
    const resp = { candidates: [{ content: { parts: [{ text: 'no puedo' }] } }] };
    expect(extraerImagenDeRespuesta(resp)).toBeNull();
  });
});
