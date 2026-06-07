import { describe, expect, it } from 'vitest';
import { effortCapado, minimoCacheTokens, rutaPara } from './router.js';

describe('router de modelos (RF-0.10)', () => {
  it('rutea cada tarea a su modelo', () => {
    expect(rutaPara('redaccion').modelo).toBe('claude-sonnet-4-6');
    expect(rutaPara('razonamiento_normativo').modelo).toBe('claude-opus-4-8');
    expect(rutaPara('extraccion').modelo).toBe('claude-haiku-4-5');
    expect(rutaPara('verificacion').modelo).toBe('claude-haiku-4-5');
  });

  it('CA-0.10: effort "max" solo en Opus; capa Sonnet/Haiku a "high"', () => {
    expect(effortCapado('claude-opus-4-8', 'max')).toBe('max');
    expect(effortCapado('claude-sonnet-4-6', 'max')).toBe('high');
    expect(effortCapado('claude-haiku-4-5', 'max')).toBe('high');
    expect(effortCapado('claude-sonnet-4-6', 'medium')).toBe('medium');
  });

  it('mínimos de caching: Sonnet 2048, Opus/Haiku 4096', () => {
    expect(minimoCacheTokens('claude-sonnet-4-6')).toBe(2048);
    expect(minimoCacheTokens('claude-opus-4-8')).toBe(4096);
    expect(minimoCacheTokens('claude-haiku-4-5')).toBe(4096);
  });
});
