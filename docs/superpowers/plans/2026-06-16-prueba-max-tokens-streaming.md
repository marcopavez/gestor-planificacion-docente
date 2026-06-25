# Structured output por streaming + max_tokens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `AnthropicLlmAdapter` genere el structured output por **streaming** con `max_tokens` ampliado, de modo que la prueba formativa (y cualquier artefacto grande) deje de truncar el JSON y de disparar el warning `"prueba reencolada para reintento"`.

**Architecture:** Hoy el adaptador usa `client.messages.parse()` (no-stream) con `max_tokens=16000`. Cuando la salida excede ese tope, el JSON del structured output llega cortado a media cadena y `messages.parse()` **lanza** `"Failed to parse structured output as JSON: Unterminated string at position N"`. Ese throw sube hasta `ProcesarTrabajoPruebaUseCase`, que lo trata como transitorio y reintenta a ciegas. El fix: cambiar a `client.messages.stream()` + `await stream.finalMessage()` (sin límite de timeout HTTP; Sonnet 4.6 admite hasta 64K de salida con streaming — verificado con la skill `claude-api`), subir `max_tokens` a `32000`, y **respetar RF-0.9 mirando `stop_reason`**: en `max_tokens`/`refusal` devolver `parsed=null` (que aguas abajo `exigirParsedConMeta` convierte en `GeneracionError` → reintento acotado), en vez de dejar que el parseo lance un error opaco.

**Tech Stack:** TypeScript (strict) · `@anthropic-ai/sdk` (`messages.stream`, `helpers/zod` → `zodOutputFormat`) · Zod · Vitest · monorepo pnpm.

**Alcance:** SOLO `packages/infra-ai/src/anthropic/AnthropicLlmAdapter.ts` + su nuevo test. El cambio beneficia a los 4 artefactos (planificación, prueba, PPT, guía) porque todos pasan por `generar()`. **Fuera de alcance:** `ClaudeCodeLlmAdapter` (usa el Agent SDK con su propia ruta `error_max_structured_output_retries`, no tiene este bug) y los use cases / worker (su comportamiento de reintento no cambia).

**Contexto del bug (para el ejecutor):** modelo de la tarea `redaccion` = `claude-sonnet-4-6` (`router.ts`). El log real mostró `level:40 "...Unterminated string at position 56816..." msg:"prueba reencolada"` seguido, 54s después, de `level:30 "prueba formativa hecha"` — o sea el reintento salvó la generación, pero por suerte. Una unidad consistentemente verbosa puede agotar los 3 reintentos → `fallido`.

---

### Task 1: Tests del adaptador (rojo)

Crea el archivo de test que hoy NO existe. Los 3 tests deben **fallar** contra el adaptador actual (que usa `messages.parse`, ausente en el cliente falso) y pasarán tras la reescritura de la Task 2.

**Files:**
- Create/Test: `packages/infra-ai/src/anthropic/AnthropicLlmAdapter.test.ts`

- [ ] **Step 1: Escribe el archivo de test completo**

```typescript
// packages/infra-ai/src/anthropic/AnthropicLlmAdapter.test.ts
// Test de contrato SIN red: inyecta un cliente Anthropic falso cuyo messages.stream().finalMessage()
// resuelve a un mensaje fijo. Verifica (a) validación del JSON contra el schema en éxito y
// (b) parsed=null en max_tokens SIN lanzar (regresión del bug "prueba reencolada").

import type Anthropic from '@anthropic-ai/sdk';
import { SchemaPrueba } from '@faro/domain';
import type { Prueba } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicLlmAdapter } from './AnthropicLlmAdapter.js';

const logFake = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

// Sample válido contra SchemaPrueba (el MISMO schema que usa la cascada).
const pruebaValida: Prueba = {
  asignatura: 'Matemática',
  curso: '1º básico',
  tipo_evaluacion: 'formativa',
  perfil_nivel: '1-2',
  tabla_especificaciones: [{ oa: 'MA01 OA 03', n_items: 1, puntaje: 2 }],
  items: [
    {
      oa: 'MA01 OA 03',
      habilidad: 'recordar',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuántas estrellas hay?',
      alternativas: [
        { texto: '6', correcta: false },
        { texto: '7', correcta: true },
      ],
      puntaje: 2,
      retroalimentacion: 'Si se equivocan, cuenten las estrellas una por una en voz alta.',
    },
  ],
  pauta_correccion: 'Ítem único, 2 puntos si marca 7.',
};

const usageFake = {
  input_tokens: 1200,
  output_tokens: 9000,
  cache_read_input_tokens: 800,
  cache_creation_input_tokens: 0,
};

/** Cliente Anthropic falso: messages.stream() → objeto con finalMessage() que resuelve al mensaje dado. */
function clienteFake(mensaje: unknown): Anthropic {
  return {
    messages: { stream: vi.fn(() => ({ finalMessage: async () => mensaje })) },
  } as unknown as Anthropic;
}

const argsGenerar = {
  tarea: 'redaccion' as const,
  schema: SchemaPrueba,
  system: [{ texto: 'system de prueba', cacheable: false }],
  entradaUsuario: 'genera una prueba',
};

describe('AnthropicLlmAdapter', () => {
  it('valida el JSON del bloque de texto contra el schema y mapea usage/modelo (éxito)', async () => {
    const cliente = clienteFake({
      content: [{ type: 'text', text: JSON.stringify(pruebaValida) }],
      stop_reason: 'end_turn',
      usage: usageFake,
    });
    const adapter = new AnthropicLlmAdapter(cliente, logFake);
    const salida = await adapter.generar(argsGenerar);

    expect(salida.parsed).not.toBeNull();
    expect(SchemaPrueba.safeParse(salida.parsed).success).toBe(true);
    expect(salida.stopReason).toBe('end_turn');
    expect(salida.modelo).toBe('claude-sonnet-4-6'); // router: redaccion → sonnet
    expect(salida.usage).toEqual({ input: 1200, output: 9000, cacheRead: 800, cacheCreation: 0 });
  });

  it('devuelve parsed=null en max_tokens SIN lanzar, aunque el JSON venga truncado (regresión)', async () => {
    // JSON cortado a media cadena, como en una salida real que choca con max_tokens.
    const truncado = JSON.stringify(pruebaValida).slice(0, 120);
    const cliente = clienteFake({
      content: [{ type: 'text', text: truncado }],
      stop_reason: 'max_tokens',
      usage: usageFake,
    });
    const adapter = new AnthropicLlmAdapter(cliente, logFake);

    const salida = await adapter.generar(argsGenerar);
    expect(salida.parsed).toBeNull();
    expect(salida.stopReason).toBe('max_tokens');
  });

  it('pide max_tokens=32000 y usa streaming (no .parse) al llamar al cliente', async () => {
    const streamSpy = vi.fn(() => ({
      finalMessage: async () => ({
        content: [{ type: 'text', text: JSON.stringify(pruebaValida) }],
        stop_reason: 'end_turn',
        usage: usageFake,
      }),
    }));
    const cliente = { messages: { stream: streamSpy } } as unknown as Anthropic;
    const adapter = new AnthropicLlmAdapter(cliente, logFake);
    await adapter.generar(argsGenerar);

    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(streamSpy.mock.calls[0][0]).toMatchObject({ max_tokens: 32000, model: 'claude-sonnet-4-6' });
  });
});
```

- [ ] **Step 2: Corre los tests y verifica que FALLAN**

Run: `pnpm --filter @faro/infra-ai exec vitest run src/anthropic/AnthropicLlmAdapter.test.ts`
Expected: FAIL en los 3 tests (el adaptador actual llama `messages.parse`, ausente en el cliente falso → throw/undefined; nunca llama `messages.stream`).

---

### Task 2: Reescribe el adaptador a streaming + max_tokens 32000 + gate de stop_reason (verde)

**Files:**
- Modify: `packages/infra-ai/src/anthropic/AnthropicLlmAdapter.ts` (reemplaza el cuerpo de `generar` y la constante `MAX_TOKENS`; añade el helper `safeJsonSchema`)

- [ ] **Step 1: Sube el tope de tokens**

Reemplaza la línea 14:

```typescript
// Límite seguro sin streaming (skill claude-api): por encima de ~16K hay riesgo de timeout HTTP.
const MAX_TOKENS = 16000;
```

por:

```typescript
// Con streaming no hay límite de timeout HTTP (skill claude-api). Sonnet 4.6 admite hasta 64K de
// salida; 32K da holgura cómoda para pruebas/PPT grandes sin desperdiciar tokens. 'max' solo aplica
// a Opus (lo capa el router); 32K es válido en los 3 modelos del router.
const MAX_TOKENS = 32000;
```

- [ ] **Step 2: Reemplaza el cuerpo de `generar` por la versión con streaming**

Reemplaza desde `const respuesta = await this.client.messages.parse({` (línea 46) **hasta la última `}` que cierra la clase** (línea 83 del archivo actual, inclusive) por el bloque siguiente. El bloque ya trae la `}` del método, la `}` de la clase y el helper `safeJsonSchema` al final — reemplazar hasta la línea 83 evita una llave de cierre duplicada:

```typescript
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
    const respuesta = await stream.finalMessage();

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
```

Nota: el `}` que cierra la clase y el del método ya están incluidos arriba — asegúrate de no dejar una llave de cierre duplicada del archivo original. Conserva intactos los imports y el constructor; `zodOutputFormat` y `ZodType` siguen usándose.

- [ ] **Step 3: Typecheck del paquete**

Run: `pnpm --filter @faro/infra-ai exec tsc --build`
Expected: sin errores. Si `messages.stream(...)` rechaza `output_config` o `thinking` en la versión del SDK instalada, **NO adivines la API**: consulta la skill `claude-api` (sección streaming / structured outputs) o `helpers.md` del SDK para el binding exacto, y ajusta. La forma de los params de `stream()` es la misma que la de `parse()`/`create()`, así que no debería haber cambios.

- [ ] **Step 4: Corre los tests del adaptador y verifica que PASAN**

Run: `pnpm --filter @faro/infra-ai exec vitest run src/anthropic/AnthropicLlmAdapter.test.ts`
Expected: PASS en los 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/infra-ai/src/anthropic/AnthropicLlmAdapter.ts packages/infra-ai/src/anthropic/AnthropicLlmAdapter.test.ts
git commit -F - <<'EOF'
fix(infra-ai): genera structured output por streaming + max_tokens 32K

La prueba formativa (y cualquier artefacto grande) podía exceder max_tokens=16000:
messages.parse() lanzaba "Failed to parse structured output as JSON: Unterminated
string" sobre el JSON truncado, que el worker reintentaba a ciegas. Se pasa a
messages.stream()+finalMessage() (sin timeout HTTP; hasta 64K en Sonnet), se sube
max_tokens a 32000 y se respeta RF-0.9: en stop_reason max_tokens/refusal se
devuelve parsed=null (→ GeneracionError → reintento acotado) en vez de lanzar un
error de parseo opaco. Añade el primer test del adaptador (sin red).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Verificación global (typecheck + suite + lint)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Typecheck completo del monorepo**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 2: Suite completa**

Run: `pnpm test`
Expected: todos los tests verdes (la suite previa estaba en 305 passed / 4 skipped; ahora deben sumar los 3 nuevos del adaptador → ~308 passed). Ningún test roto.

- [ ] **Step 3: Lint del paquete tocado**

Run: `pnpm exec eslint packages/infra-ai/src/anthropic --max-warnings 0`
Expected: sin salida (sin warnings ni errores). Sin `any` salvo los casts `as unknown as` del test (justificados: doble de cliente/Logger sin red).

---

### Task 4 (manual / opcional): Smoke live end-to-end

Requiere los servidores arriba en modo live (Docker + `pnpm seed` + `pnpm dev`, con `ANTHROPIC_API_KEY` en `.env`). Confirma que la generación grande ya no reencola.

**Files:** ninguno.

- [ ] **Step 1: Genera una prueba para una unidad con varios OA** desde `http://localhost:3000/aula/planificacion` (crea/abre una planificación con 3+ OA → "Generar prueba formativa").

- [ ] **Step 2: Vigila el log del worker** mientras procesa el job:

Espera ver `msg:"prueba formativa hecha"` **sin** un `level:40 "...Unterminated string..." "prueba reencolada"` previo. Si el JSON aún excediera 32K (improbable), verás un `GeneracionError` con `stop_reason='max_tokens'` y reintento limpio — no un error de parseo.

- [ ] **Step 3 (si corre el smoke):** documenta el resultado; no hay commit asociado.

---

## Notas de cierre para el ejecutor

- El comportamiento del worker (reintento acotado en `ProcesarTrabajoPruebaUseCase`) **no cambia**: sigue siendo la red de seguridad. Lo que cambia es que (a) la truncación es mucho más rara (32K vs 16K, vía streaming) y (b) cuando ocurre, llega como `GeneracionError('max_tokens')` limpio en vez de un throw de parseo opaco.
- No toques `GenerarPruebaFormativaUseCase` ni `generacion.ts`: `exigirParsedConMeta` ya lanza `GeneracionError(stopReason)` cuando `parsed===null` (lo verificamos), que es exactamente la ruta deseada.
- Si decides ampliar `max_tokens` más allá de 32K en el futuro, recuerda: Sonnet 4.6/Haiku 4.5 topan en 64K de salida; Opus 4.8 en 128K — pero el modelo de `redaccion` es Sonnet.
