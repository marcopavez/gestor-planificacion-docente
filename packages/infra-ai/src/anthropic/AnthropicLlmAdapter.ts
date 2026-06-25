// packages/infra-ai/src/anthropic/AnthropicLlmAdapter.ts
// Implementa LlmPort sobre el SDK de Anthropic (RF-0.9/0.10/0.11; blueprint §7).
// Estructurado vía messages.stream()+finalMessage() + zodOutputFormat; thinking adaptive; caching
// del corpus; log de usage. En refusal/max_tokens el contenido viene truncado/vacío → parsed=null,
// nunca basura (RF-0.9).

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { BloqueSistema, LlmPort, SalidaEstructurada, Tarea, UsoTokens } from '@faro/domain';
import type { Logger } from '@faro/observability';
import type { ZodType } from 'zod';
import { effortCapado, rutaPara } from './router.js';

// Con streaming no hay límite de timeout HTTP (skill claude-api). 64K es el techo de salida de Sonnet
// 4.6 y Haiku 4.5 (Opus 4.8 = 128K), así que es válido en los 3 modelos del router (verificado en
// claude-api/shared/models.md). Subido de 32K → 64K (2026-06-25, dueño aprobó el costo): guías
// verbosas truncaban a 32K. max_tokens es un TECHO, no un objetivo → solo sube el costo si la salida
// realmente crece. 'max' effort solo aplica a Opus (lo capa el router).
const MAX_TOKENS = 64000;

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

    // Streaming (no .parse): por encima de ~16K una respuesta no-stream arriesga timeout HTTP
    // (skill claude-api). finalMessage() ensambla el mensaje completo del stream.
    const stream = this.client.messages.stream({
      model: ruta.modelo,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort, format: zodOutputFormat(args.schema) },
      system,
      messages: [{ role: 'user', content: args.entradaUsuario }],
    });
    // finalMessage() auto-parsea el structured output (output_config.format) y LANZA si el JSON
    // viene truncado (stop_reason=max_tokens en salidas largas) o inválido — y eso ocurre ANTES del
    // gate de stop_reason de abajo, así que el worker reencolaba a ciegas con un error opaco (bug
    // guía 2026-06-25). Capturamos ese throw y recuperamos el mensaje CRUDO (stream.currentMessage,
    // que el SDK no limpia tras el throw en message_stop) para que el gate + safeJsonSchema devuelvan
    // parsed=null limpio (→ GeneracionError → reintento acotado). Sin currentMessage = error real
    // (red/abort): se re-lanza.
    const respuesta = await stream.finalMessage().catch((err: unknown) => {
      const crudo = stream.currentMessage;
      if (crudo === undefined) throw err;
      return crudo;
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

    const stopReason = respuesta.stop_reason ?? 'desconocido';

    // RF-0.9: en max_tokens/refusal el contenido viene truncado o vacío → parsed=null SIN intentar
    // parsearlo. Antes .parse() lanzaba un error de JSON ("Unterminated string") que el worker
    // malinterpretaba como transitorio; ahora devuelve null y exigirParsedConMeta lo vuelve un
    // GeneracionError limpio (reintento acotado).
    let parsed: T | null = null;
    if (stopReason !== 'max_tokens' && stopReason !== 'refusal') {
      let json = '';
      for (const bloque of respuesta.content) {
        if (bloque.type === 'text') json += bloque.text;
      }
      parsed = safeJsonSchema(args.schema, json);
    }

    this.log.info(
      { modelo: ruta.modelo, tarea: args.tarea, effort, stopReason, usage },
      'llm.generar',
    );

    return { parsed, stopReason, usage, modelo: ruta.modelo };
  }
}

/** Parsea texto→JSON y lo valida contra el schema; si algo falla, null (INV-2: basura nunca pasa). */
function safeJsonSchema<T>(schema: ZodType<T>, texto: string): T | null {
  let data: unknown;
  try {
    data = JSON.parse(texto);
  } catch {
    return null;
  }
  const r = schema.safeParse(data);
  return r.success ? r.data : null;
}
