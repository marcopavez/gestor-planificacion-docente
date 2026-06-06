// packages/infra-ai/src/index.ts
// Paquete @faro/infra-ai: adapters de LLM (Anthropic), embeddings y reranker.
// INV-5: implementa puertos de @faro/domain; usa @faro/observability para logs de tokens.
// La composition root (DI) vive en apps/web y apps/worker.

// TODO H-0.4: AnthropicLlmAdapter (router §4.5, cache_control, zodOutputFormat, usageLogger)
// TODO H-0.5: VoyageEmbeddingsAdapter + FakeEmbeddings; RerankerAdapter (Haiku) + FakeReranker

/**
 * Placeholder que confirma que el paquete compila con sus referencias.
 */
export const INFRA_AI_VERSION = '0.0.1-fase0-skeleton' as const;

// Re-exportar tipos de puertos para conveniencia de la composition root
export type { EmbeddingsPort, LlmPort, RerankerPort } from '@faro/domain';
