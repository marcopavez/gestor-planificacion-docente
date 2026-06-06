// packages/infra-ai/src/__fakes__/FakeLlm.ts
// Doble de test determinista de LlmPort (INV-6): ejercita use cases sin red ni API key.
// La respuesta se valida contra el schema real, así un test no puede pasar datos inválidos.

import type { BloqueSistema, LlmPort, SalidaEstructurada, Tarea } from '@faro/domain';
import type { ZodType } from 'zod';

export class FakeLlm implements LlmPort {
  constructor(private readonly responder: (tarea: Tarea) => unknown) {}

  async generar<T>(args: {
    tarea: Tarea;
    schema: ZodType<T>;
    system: readonly BloqueSistema[];
    entradaUsuario: string;
  }): Promise<SalidaEstructurada<T>> {
    const parsed = args.schema.parse(this.responder(args.tarea));
    return {
      parsed,
      stopReason: 'end_turn',
      usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      modelo: 'fake-llm',
    };
  }
}
