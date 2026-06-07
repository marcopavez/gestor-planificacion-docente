// packages/infra-ai/src/crearLlm.ts
// Selección de proveedor de LlmPort en un solo lugar (RF-PA.14): evita duplicar la lógica entre
// apps/worker y apps/web. INV-6: la cascada y los use cases dependen solo de LlmPort, así que
// cambiar de proveedor no toca su código.
//
// Precedencia (coherente con §4.5 del plan-fase-1):
//   1. claude-code   — si hay CLAUDE_CODE_OAUTH_TOKEN (suscripción Claude Code, "por el momento")
//   2. anthropic-api — si hay ANTHROPIC_API_KEY (producción futura; el adapter ya existe)
//   3. samples       — fallback determinista (sin red, gratis): la plomería se prueba con samples
//
// Nota de auth: el Agent SDK da precedencia a ANTHROPIC_API_KEY sobre el token; por eso el adapter
// de claude-code anula la API key en el entorno del subproceso. Aquí, además, el token gana en la
// selección para que tener ambas variables no fuerce silenciosamente la ruta de API key.

import type { LlmPort } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { ClaudeCodeLlmAdapter } from './claudeCode/ClaudeCodeLlmAdapter.js';
import { AnthropicLlmAdapter } from './anthropic/AnthropicLlmAdapter.js';
import { crearSamplesLlm } from './__fakes__/SamplesLlm.js';

export type ModoLlm = 'claude-code' | 'anthropic-api' | 'samples';

export interface EntornoLlm {
  readonly CLAUDE_CODE_OAUTH_TOKEN?: string | undefined;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  // Directorio de samples para el fallback (una materia). El caller lo resuelve por entorno/raíz.
  readonly samplesDir: string;
}

/** Elige el adapter de LlmPort según el entorno y devuelve el modo elegido (para logging/trazas). */
export function crearLlm(env: EntornoLlm, log: Logger): { llm: LlmPort; modo: ModoLlm } {
  if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { llm: ClaudeCodeLlmAdapter.desdeToken(env.CLAUDE_CODE_OAUTH_TOKEN, log), modo: 'claude-code' };
  }
  if (env.ANTHROPIC_API_KEY) {
    return { llm: AnthropicLlmAdapter.desdeApiKey(env.ANTHROPIC_API_KEY, log), modo: 'anthropic-api' };
  }
  return { llm: crearSamplesLlm(env.samplesDir), modo: 'samples' };
}
