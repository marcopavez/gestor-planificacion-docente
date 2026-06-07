// packages/infra-ai/src/claudeCode/ClaudeCodeLlmAdapter.ts
// Implementa LlmPort sobre el Claude Agent SDK (@anthropic-ai/claude-agent-sdk) usando la
// suscripción de Claude Code (CLAUDE_CODE_OAUTH_TOKEN) — RF-PA.13/PA.14, §4.5 del plan-fase-1.
//
// Es un adapter DISTINTO de AnthropicLlmAdapter (API key + messages.parse): aquí el SDK arranca
// el binario de Claude Code como subproceso y devuelve `structured_output` validado contra el
// JSON Schema. La doble validación (SDK + Zod) es intencional: refinements/transforms/brand de
// Zod no viajan al JSON Schema, así que se revalida con el MISMO schema de la cascada (INV-2:
// el LLM solo propone; basura → parsed=null, nunca se persiste).

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { BloqueSistema, LlmPort, SalidaEstructurada, Tarea, UsoTokens } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { z } from 'zod';
import type { ZodType } from 'zod';
import { rutaPara } from '../anthropic/router.js';

export class ClaudeCodeLlmAdapter implements LlmPort {
  private constructor(
    private readonly token: string,
    private readonly log: Logger,
  ) {}

  /** Construye el adapter desde el token de suscripción; sin token degrada con error claro
   *  (la composition root decide el fallback a samples, como hoy con la API key — RF-PA.13). */
  static desdeToken(token: string | undefined, log: Logger): ClaudeCodeLlmAdapter {
    if (!token) {
      throw new Error(
        'ClaudeCodeLlmAdapter: falta CLAUDE_CODE_OAUTH_TOKEN (genéralo con `claude setup-token`).',
      );
    }
    return new ClaudeCodeLlmAdapter(token, log);
  }

  async generar<T>(args: {
    tarea: Tarea;
    schema: ZodType<T>;
    system: readonly BloqueSistema[];
    entradaUsuario: string;
  }): Promise<SalidaEstructurada<T>> {
    const ruta = rutaPara(args.tarea);
    const systemPrompt = args.system.map((b) => b.texto).join('\n\n');

    // Zod 4 (repo en zod@^4.4.3): conversión nativa a JSON Schema; el SDK valida y re-prompta
    // en mismatch. Cast a Record<string,unknown> porque OutputFormat.schema lo exige.
    const jsonSchema = z.toJSONSchema(args.schema) as Record<string, unknown>;

    // Precedencia de auth: ANTHROPIC_API_KEY gana sobre CLAUDE_CODE_OAUTH_TOKEN. Por eso NO se
    // hereda la API key: env REEMPLAZA el entorno del subproceso, así que se spread-ea process.env
    // y se anula la API key explícitamente para forzar el uso de la suscripción.
    const env: NonNullable<Options['env']> = {
      ...process.env,
      ANTHROPIC_API_KEY: undefined,
      CLAUDE_CODE_OAUTH_TOKEN: this.token,
    };

    const options: Options = {
      model: ruta.modelo,
      systemPrompt,
      outputFormat: { type: 'json_schema', schema: jsonSchema },
      // Generación pura: sin tools, una sola vuelta, sin leer .claude del repo ni escribir transcript.
      allowedTools: [],
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
      env,
    };

    let resultMsg: SDKResultMessage | undefined;
    try {
      for await (const mensaje of query({ prompt: args.entradaUsuario, options })) {
        if (esResultado(mensaje)) {
          resultMsg = mensaje;
        }
      }
    } catch (e: unknown) {
      // Errores del subproceso (binario ausente, token inválido, etc.): el adapter no reintenta
      // la generación (los reintentos de job viven en el worker). Se propaga con contexto.
      const detalle = e instanceof Error ? e.message : String(e);
      this.log.error({ modelo: ruta.modelo, tarea: args.tarea, err: detalle }, 'claude-code.generar.error');
      throw new Error(`ClaudeCodeLlmAdapter: falló la generación vía Agent SDK: ${detalle}`);
    }

    // Si el SDK terminó sin emitir un mensaje 'result', usamos un subtype REAL del vocabulario del
    // SDK (no un string inventado) para que worker/traza interpreten el campo de forma consistente.
    const stopReason: string = resultMsg?.subtype ?? 'error_during_execution';
    const usage = mapearUsage(resultMsg);

    // structured_output solo viene en el resultado 'success'; otros subtypes (max_turns,
    // error_max_structured_output_retries, error_during_execution) no traen salida válida.
    const crudo = resultMsg?.subtype === 'success' ? resultMsg.structured_output : undefined;
    const parsed = args.schema.safeParse(crudo);

    if (!parsed.success) {
      // INV-2: ni un mismatch del SDK ni un fallo de refinement Zod persisten basura → parsed=null.
      this.log.warn(
        { modelo: ruta.modelo, tarea: args.tarea, stopReason },
        'claude-code.generar: salida no validó contra el schema (parsed=null)',
      );
      return { parsed: null, stopReason, usage, modelo: ruta.modelo };
    }

    this.log.info(
      { modelo: ruta.modelo, tarea: args.tarea, stopReason, usage },
      'llm.generar',
    );
    return { parsed: parsed.data, stopReason, usage, modelo: ruta.modelo };
  }
}

/** El generador emite muchos SDKMessage; solo interesa el de tipo 'result' (cierre de la corrida). */
function esResultado(mensaje: SDKMessage): mensaje is SDKResultMessage {
  return mensaje.type === 'result';
}

/** Mapea el `usage` del Agent SDK (shape de BetaUsage; cache fields nullable) a UsoTokens. */
function mapearUsage(resultMsg: SDKResultMessage | undefined): UsoTokens {
  if (resultMsg === undefined) {
    return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  }
  const u = resultMsg.usage;
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheCreation: u.cache_creation_input_tokens ?? 0,
  };
}
