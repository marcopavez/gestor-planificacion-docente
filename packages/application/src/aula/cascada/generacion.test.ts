// Tests de los prompts/entradas de la cascada (sin red): garantizan que las reglas críticas de
// calibración/anclaje no se borren por accidente. No validan la salida del LLM (eso es el smoke).
import { describe, expect, it } from 'vitest';
import { INSTR_DIBUJO } from './generacion.js';

describe('INSTR_DIBUJO', () => {
  it('exige que descripcion_en represente exactamente el concepto (anclaje #1)', () => {
    expect(INSTR_DIBUJO.texto).toContain("DEBE representar exactamente el 'concepto'");
  });
});
