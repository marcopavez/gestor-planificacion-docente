// packages/infra-ai/src/index.ts
// Paquete @faro/infra-ai: adapters de LLM (Anthropic), embeddings y reranker.
// INV-5: implementa puertos de @faro/domain; usa @faro/observability para logs de tokens.
// La composition root (DI) vive en apps/web y apps/worker.

export { AnthropicLlmAdapter } from './anthropic/AnthropicLlmAdapter.js';
// Adapter en vivo vía suscripción Claude Code (Agent SDK + CLAUDE_CODE_OAUTH_TOKEN) — RF-PA.13.
export { ClaudeCodeLlmAdapter } from './claudeCode/ClaudeCodeLlmAdapter.js';
export { effortCapado, minimoCacheTokens, rutaPara } from './anthropic/router.js';
export type { Effort, RutaModelo } from './anthropic/router.js';
export { FakeLlm } from './__fakes__/FakeLlm.js';
// Adapter de demo: sirve samples curados como LlmPort (sin API key) — usado por apps/web y apps/worker.
export { crearSamplesLlm } from './__fakes__/SamplesLlm.js';
// Selección de proveedor (claude-code | anthropic-api | samples) — RF-PA.14, evita duplicar DI.
export { crearLlm } from './crearLlm.js';
export type { EntornoLlm, ModoLlm } from './crearLlm.js';

// TODO H-0.5: VoyageEmbeddingsAdapter + FakeEmbeddings; RerankerAdapter (Haiku) + FakeReranker

// Re-exportar tipos de puertos para conveniencia de la composition root
export type { EmbeddingsPort, LlmPort, RerankerPort } from '@faro/domain';
