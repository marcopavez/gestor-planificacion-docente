// packages/infra-db/src/db.ts
// Factoría del cliente Drizzle.
// INV-5: recibe la Env ya validada (inyectada desde la composition root de apps/worker o apps/web)
//         en lugar de leer process.env directamente — facilita tests y evita el singleton global.

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

// Interfaz mínima que crearDb realmente necesita — los callers con Env completa siguen
// compilando por tipado estructural (Env extiende EnvDb implícitamente).
export interface EnvDb {
  readonly DATABASE_URL: string;
}

// Re-export del tipo de la instancia Drizzle para que los repositorios puedan tipar la inyección.
export type DrizzleDb = ReturnType<typeof crearDb>['db'];

// Transacción de Drizzle derivada de la firma de db.transaction (no se asume de memoria).
// Es el primer parámetro del callback que recibe transaction(...).
export type Transaccion = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

// Repos que entran a una unidad de trabajo aceptan db top-level O una transacción:
// insert/update/select/execute existen en ambos; transaction() solo en DrizzleDb (no anidamos).
export type DbOTx = DrizzleDb | Transaccion;

/**
 * Crea el Pool de pg y la instancia Drizzle, ambos ligados a la URL recibida.
 * El Pool se expone para poder cerrarlo limpiamente al apagar el proceso.
 *
 * Ejemplo de uso en la composition root:
 *   const env = cargarEnv();
 *   const { db, pool } = crearDb(env);
 *   process.on('SIGTERM', () => pool.end());
 */
export function crearDb(env: EnvDb) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  const db = drizzle(pool, {
    schema,
    // Drizzle logger está deshabilitado en producción; la observability se hace en los repos/use cases.
    logger: false,
  });

  return { db, pool };
}
