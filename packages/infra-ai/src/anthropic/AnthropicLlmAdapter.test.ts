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

  it('truncación: finalMessage() LANZA (auto-parse del SDK) pero recupera currentMessage → parsed=null SIN lanzar (regresión guía 2026-06-25)', async () => {
    // Reproduce el bug real: con output_config.format el SDK auto-parsea el structured output al
    // finalizar el stream y LANZA "Failed to parse structured output as JSON: Unterminated string"
    // sobre el JSON truncado, ANTES de que corra el gate de stop_reason del adapter. El mensaje crudo
    // acumulado sigue accesible en stream.currentMessage (el SDK no lo limpia si el throw fue en
    // message_stop). El adapter debe capturar el throw, leer currentMessage y devolver parsed=null.
    const truncado = JSON.stringify(pruebaValida).slice(0, 120);
    const mensajeCrudo = {
      content: [{ type: 'text', text: truncado }],
      stop_reason: 'max_tokens',
      usage: usageFake,
    };
    const cliente = {
      messages: {
        stream: vi.fn(() => ({
          finalMessage: async () => {
            throw new Error(
              'Failed to parse structured output: Error: Failed to parse structured output as JSON: Unterminated string in JSON at position 99587',
            );
          },
          currentMessage: mensajeCrudo,
        })),
      },
    } as unknown as Anthropic;
    const adapter = new AnthropicLlmAdapter(cliente, logFake);

    const salida = await adapter.generar(argsGenerar);
    expect(salida.parsed).toBeNull();
    expect(salida.stopReason).toBe('max_tokens');
    // Recuperó el usage del mensaje crudo (no perdió la telemetría pese al throw).
    expect(salida.usage).toEqual({ input: 1200, output: 9000, cacheRead: 800, cacheCreation: 0 });
  });

  it('si finalMessage() lanza y NO hay currentMessage (error real), re-lanza el error', async () => {
    const cliente = {
      messages: {
        stream: vi.fn(() => ({
          finalMessage: async () => {
            throw new Error('boom de red');
          },
          currentMessage: undefined,
        })),
      },
    } as unknown as Anthropic;
    const adapter = new AnthropicLlmAdapter(cliente, logFake);
    await expect(adapter.generar(argsGenerar)).rejects.toThrow('boom de red');
  });

  it('pide max_tokens=64000 y usa streaming (no .parse) al llamar al cliente', async () => {
    // Capturamos los params en una var (en vez de mock.calls[0][0]) para que el assert tipe limpio
    // bajo strict + noUncheckedIndexedAccess: el doble del cliente no tipa la tupla de argumentos.
    let paramsStream: unknown = undefined;
    const streamSpy = vi.fn((params: unknown) => {
      paramsStream = params;
      return {
        finalMessage: async () => ({
          content: [{ type: 'text', text: JSON.stringify(pruebaValida) }],
          stop_reason: 'end_turn',
          usage: usageFake,
        }),
      };
    });
    const cliente = { messages: { stream: streamSpy } } as unknown as Anthropic;
    const adapter = new AnthropicLlmAdapter(cliente, logFake);
    await adapter.generar(argsGenerar);

    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(paramsStream).toMatchObject({ max_tokens: 64000, model: 'claude-sonnet-4-6' });
  });
});
