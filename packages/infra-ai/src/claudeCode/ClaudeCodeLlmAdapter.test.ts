// packages/infra-ai/src/claudeCode/ClaudeCodeLlmAdapter.test.ts
// Test de contrato SIN red: mockea `query` del Agent SDK con un async generator y verifica que el
// adapter cumple LlmPort. NO llama al SDK real ni gasta token (no hay token en CI). CA-PA.6.

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { SchemaPrueba } from '@faro/domain';
import type { Prueba } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// El mock debe estar declarado antes de importar el adapter (hoisting de vi.mock).
const queryMock = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (params: unknown) => queryMock(params),
}));

// Import dinámico tras el mock para que el adapter resuelva la versión mockeada de `query`.
const { ClaudeCodeLlmAdapter } = await import('./ClaudeCodeLlmAdapter.js');

// Sample válido contra SchemaPrueba (el MISMO schema que usa la cascada).
const pruebaValida: Prueba = {
  asignatura: 'Matemática',
  curso: '1º básico',
  perfil_nivel: '1B',
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
    },
  ],
  pauta_correccion: 'Ítem único, 2 puntos si marca 7.',
  alineada_reglamento: false,
  version_nee_dua: false,
};

// Logger doble silencioso: el adapter solo lo usa para info/warn/error.
const logFake = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

/** Construye un async generator que emite los mensajes dados (como hace el SDK real). */
function generador(mensajes: SDKMessage[]): AsyncGenerator<SDKMessage> {
  return (async function* () {
    for (const m of mensajes) {
      yield m;
    }
  })();
}

const argsGenerar = {
  tarea: 'redaccion' as const,
  schema: SchemaPrueba,
  system: [{ texto: 'system de prueba', cacheable: false }],
  entradaUsuario: 'genera una prueba',
};

describe('ClaudeCodeLlmAdapter', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('desdeToken lanza error claro sin token', () => {
    expect(() => ClaudeCodeLlmAdapter.desdeToken(undefined, logFake)).toThrowError(
      /CLAUDE_CODE_OAUTH_TOKEN/,
    );
  });

  it('valida structured_output exitoso contra el schema de la cascada y mapea usage/modelo', async () => {
    queryMock.mockReturnValue(
      generador([
        {
          type: 'result',
          subtype: 'success',
          structured_output: pruebaValida,
          usage: {
            input_tokens: 1200,
            output_tokens: 340,
            cache_read_input_tokens: 800,
            cache_creation_input_tokens: 50,
          },
        } as unknown as SDKMessage,
      ]),
    );

    const adapter = ClaudeCodeLlmAdapter.desdeToken('token-falso', logFake);
    const salida = await adapter.generar(argsGenerar);

    expect(salida.parsed).not.toBeNull();
    // El parsed debe pasar el safeParse del MISMO schema (no es un objeto cualquiera).
    expect(SchemaPrueba.safeParse(salida.parsed).success).toBe(true);
    expect(salida.stopReason).toBe('success');
    expect(salida.modelo).toBe('claude-sonnet-4-6'); // router: redaccion → sonnet
    expect(salida.usage).toEqual({ input: 1200, output: 340, cacheRead: 800, cacheCreation: 50 });
  });

  it('devuelve parsed=null y propaga el stopReason en error_max_structured_output_retries', async () => {
    queryMock.mockReturnValue(
      generador([
        {
          type: 'result',
          subtype: 'error_max_structured_output_retries',
          usage: {
            input_tokens: 500,
            output_tokens: 0,
            cache_read_input_tokens: null,
            cache_creation_input_tokens: null,
          },
        } as unknown as SDKMessage,
      ]),
    );

    const adapter = ClaudeCodeLlmAdapter.desdeToken('token-falso', logFake);
    const salida = await adapter.generar(argsGenerar);

    expect(salida.parsed).toBeNull();
    expect(salida.stopReason).toBe('error_max_structured_output_retries');
    // cache fields nullable → 0.
    expect(salida.usage).toEqual({ input: 500, output: 0, cacheRead: 0, cacheCreation: 0 });
  });

  it('devuelve parsed=null si structured_output no cumple el schema (INV-2)', async () => {
    queryMock.mockReturnValue(
      generador([
        {
          type: 'result',
          subtype: 'success',
          structured_output: { asignatura: 'Matemática' }, // incompleto → no valida
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        } as unknown as SDKMessage,
      ]),
    );

    const adapter = ClaudeCodeLlmAdapter.desdeToken('token-falso', logFake);
    const salida = await adapter.generar(argsGenerar);

    expect(salida.parsed).toBeNull();
    expect(salida.stopReason).toBe('success');
  });

  it('propaga un error claro si el subproceso del SDK falla', async () => {
    queryMock.mockImplementation(() => {
      throw new Error('binario de Claude Code no encontrado');
    });

    const adapter = ClaudeCodeLlmAdapter.desdeToken('token-falso', logFake);
    await expect(adapter.generar(argsGenerar)).rejects.toThrowError(/Agent SDK/);
  });
});
