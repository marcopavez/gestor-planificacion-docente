// packages/infra-ai/src/anthropic/AnthropicLlmAdapter.ts
// Implementa LlmPort sobre el SDK de Anthropic (RF-0.9/0.10/0.11; blueprint §7).
// Estructurado vía messages.parse() + zodOutputFormat; thinking adaptive; caching del corpus;
// log de usage. parsed_output puede ser null (refusal/max_tokens) → se devuelve null, nunca basura.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { BloqueSistema, LlmPort, SalidaEstructurada, Tarea, UsoTokens } from '@faro/domain';
import type { Logger } from '@faro/observability';
import type { ZodType } from 'zod';
import { effortCapado, rutaPara } from './router.js';

// Límite seguro sin streaming (skill claude-api): por encima de ~16K hay riesgo de timeout HTTP.
const MAX_TOKENS = 16000;

export class AnthropicLlmAdapter implements LlmPort {
  constructor(
    private readonly client: Anthropic,
    private readonly log: Logger,
  ) {}

  /** Construye el adapter desde la API key; sin key degrada con error claro (RF-0.20). */
  static desdeApiKey(apiKey: string | undefined, log: Logger): AnthropicLlmAdapter {
    if (!apiKey) {
      throw new Error('AnthropicLlmAdapter: falta ANTHROPIC_API_KEY (configúrala en .env).');
    }
    return new AnthropicLlmAdapter(new Anthropic({ apiKey }), log);
  }

  async generar<T>(args: {
    tarea: Tarea;
    schema: ZodType<T>;
    system: readonly BloqueSistema[];
    entradaUsuario: string;
  }): Promise<SalidaEstructurada<T>> {
    const ruta = rutaPara(args.tarea);
    const effort = effortCapado(ruta.modelo, ruta.effort);

    // Prefijo estable primero; cache_control solo sobre los bloques marcados cacheables (el corpus).
    const system = args.system.map((b) =>
      b.cacheable
        ? { type: 'text' as const, text: b.texto, cache_control: { type: 'ephemeral' as const } }
        : { type: 'text' as const, text: b.texto },
    );

    const respuesta = await this.client.messages.parse({
      model: ruta.modelo,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort, format: zodOutputFormat(args.schema) },
      system,
      messages: [{ role: 'user', content: args.entradaUsuario }],
    });

    const usage: UsoTokens = {
      input: respuesta.usage.input_tokens,
      output: respuesta.usage.output_tokens,
      cacheRead: respuesta.usage.cache_read_input_tokens ?? 0,
      cacheCreation: respuesta.usage.cache_creation_input_tokens ?? 0,
    };

    // RF-0.11: detector de invalidadores silenciosos de caché.
    const huboCacheable = args.system.some((b) => b.cacheable);
    if (huboCacheable && usage.cacheRead === 0 && usage.cacheCreation === 0) {
      this.log.warn(
        { modelo: ruta.modelo, tarea: args.tarea },
        'cache no impactó: prefijo bajo el mínimo o invalidado (revisar prefijo estable)',
      );
    }

    this.log.info(
      { modelo: ruta.modelo, tarea: args.tarea, effort, stopReason: respuesta.stop_reason, usage },
      'llm.generar',
    );

    return {
      parsed: (respuesta.parsed_output ?? null) as T | null,
      stopReason: respuesta.stop_reason ?? 'desconocido',
      usage,
      modelo: ruta.modelo,
    };
  }
}
