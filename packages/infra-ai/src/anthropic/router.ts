// packages/infra-ai/src/anthropic/router.ts
// Política de routing de modelos (RF-0.10, blueprint §7.1 / 00-cimientos §4.5).
// IDs exactos verificados con la skill `claude-api`: claude-opus-4-8 | claude-sonnet-4-6 | claude-haiku-4-5.

import type { Tarea } from '@faro/domain';

export type Effort = 'low' | 'medium' | 'high' | 'max';

export interface RutaModelo {
  readonly modelo: string;
  readonly effort: Effort;
}

const RUTA: Record<Tarea, RutaModelo> = {
  extraccion: { modelo: 'claude-haiku-4-5', effort: 'medium' },
  verificacion: { modelo: 'claude-haiku-4-5', effort: 'low' },
  redaccion: { modelo: 'claude-sonnet-4-6', effort: 'medium' }, // default: redactar borradores
  razonamiento_normativo: { modelo: 'claude-opus-4-8', effort: 'high' },
};

export function rutaPara(tarea: Tarea): RutaModelo {
  return RUTA[tarea];
}

// INVARIANTE (RF-0.10): effort 'max' solo es válido en Opus; en Sonnet/Haiku da 400.
// Por eso el router lo capa por modelo en vez de confiar en quien llama.
export function effortCapado(modelo: string, effort: Effort): Effort {
  if (effort === 'max' && !modelo.startsWith('claude-opus')) return 'high';
  return effort;
}

// Mínimos de prompt caching confirmados (skill claude-api): Sonnet 4.6 = 2048; Opus/Haiku = 4096.
// Por debajo del mínimo el prefijo NO cachea (en silencio).
export function minimoCacheTokens(modelo: string): number {
  return modelo.startsWith('claude-sonnet') ? 2048 : 4096;
}
