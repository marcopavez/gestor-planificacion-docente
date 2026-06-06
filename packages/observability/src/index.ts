// packages/observability/src/index.ts
// RF-0.21: logger estructurado para todo el monorepo.
// Sin console.log en el camino de producción — usar siempre este logger (CLAUDE.md).

import pino from 'pino';

/**
 * Crea un logger con nivel configurado vía variable de entorno LOG_LEVEL.
 * El transporte por defecto emite JSON estructurado (apto para Loki / CloudWatch).
 * En desarrollo se puede agregar pino-pretty como devDependency opcional.
 */
function crearLogger(nombre: string): pino.Logger {
  return pino({
    name: nombre,
    level: process.env['LOG_LEVEL'] ?? 'info',
  });
}

// Logger raíz del proceso — cada subsistema lo extiende con child().
export const logger = crearLogger('faro');

export { pino };
export type { pino as PinoType };

/**
 * Crea un logger hijo con un nombre de subsistema.
 * Uso: const log = crearLoggerHijo('infra-ai'); log.info({ tokens: 42 }, 'llamada completada');
 */
export function crearLoggerHijo(subsistema: string): pino.Logger {
  return logger.child({ subsistema });
}
