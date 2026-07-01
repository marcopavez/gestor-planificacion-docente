// packages/infra-db/src/test/pgliteHelper.ts
// Helper de tests de integración: arranca una instancia pglite en memoria,
// aplica la migración SQL y devuelve una instancia Drizzle lista para tests.
// Solo se importa desde archivos *.test.ts — no entra en el bundle de producción.

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as schema from '../schema/index.js';

// __dirname equivalente en ESM
const __dirname = dirname(fileURLToPath(import.meta.url));

// Todas las migraciones en orden — añadir aquí cada nuevo archivo de migración.
// El helper las aplica secuencialmente para que los tests siempre corran contra el schema completo.
const MIGRATION_PATHS = [
  join(__dirname, '../../migrations/0000_robust_mulholland_black.sql'),
  join(__dirname, '../../migrations/0001_glorious_tinkerer.sql'),
  join(__dirname, '../../migrations/0002_fancy_centennial.sql'),
];

/**
 * Crea una instancia Drizzle apuntando a pglite en memoria con el schema aplicado.
 * Uso en tests:
 *   const db = await crearDbTest();
 *
 * Cada test que necesite aislamiento debe llamar a esta función para obtener una DB prístina.
 */
export async function crearDbTest(): Promise<ReturnType<typeof drizzle<typeof schema>>> {
  const pg = new PGlite();

  // Aplicar cada migración en orden (el mismo SQL que va a Postgres real).
  // drizzle-kit genera bloques separados por '--> statement-breakpoint'; pglite
  // no los entiende, así que los dividimos y ejecutamos uno a uno.
  for (const migrationPath of MIGRATION_PATHS) {
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await pg.exec(stmt);
    }
  }

  return drizzle(pg, { schema });
}
