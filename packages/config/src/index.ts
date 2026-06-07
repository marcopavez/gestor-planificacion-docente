// packages/config/src/index.ts
// RF-0.20: validación de variables de entorno al boot con Zod.
// Si faltan claves críticas, el proceso falla con un mensaje claro — no silencia errores.

import { z } from 'zod';

const EnvSchema = z.object({
  // Base de datos (obligatoria para cualquier operación de datos)
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida de Postgres'),

  // Clave de IA (obligatoria para generar documentos; sin ella los adapters de IA degradan con error claro)
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY es requerida'),

  // Opcionales con defaults razonables
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Voyage (Fase 1 — opcional en Fase 0, FakeEmbeddings corre sin ella)
  VOYAGE_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Carga y valida las variables de entorno.
 * Lanza un error con descripción detallada de las variables faltantes si la validación falla.
 * Se llama una sola vez al arrancar la app o el worker.
 */
export function cargarEnv(): Env {
  const resultado = EnvSchema.safeParse(process.env);

  if (!resultado.success) {
    const errores = resultado.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');

    // Error fatal al boot — es intencional usar process.exit aquí
    throw new Error(
      `[config] Variables de entorno inválidas o faltantes:\n${errores}\n\nRevisa tu .env o .env.local.`,
    );
  }

  return resultado.data;
}

export { EnvSchema };
