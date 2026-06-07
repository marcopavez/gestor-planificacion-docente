// packages/domain/src/errors/index.ts
// Errores del dominio — TS puro, sin dependencias de framework.

/** Se lanza cuando la generación del LLM produce parsed=null (refusal o max_tokens). RF-0.9. */
export class GeneracionError extends Error {
  constructor(
    public readonly stopReason: string,
    public readonly documentoId?: string,
  ) {
    super(`Generación fallida: stop_reason='${stopReason}'`);
    this.name = 'GeneracionError';
  }
}

/** Se lanza cuando una cita referenciada no existe o no está vigente en el corpus. */
export class CitaInvalidaError extends Error {
  constructor(public readonly referencia: string, public readonly motivo: string) {
    super(`Cita inválida '${referencia}': ${motivo}`);
    this.name = 'CitaInvalidaError';
  }
}

/** Se lanza cuando el dominio detecta una violación de sus reglas deterministas. */
export class ReglaDominioError extends Error {
  constructor(
    public readonly regla: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReglaDominioError';
  }
}
