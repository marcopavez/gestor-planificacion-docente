// packages/infra-db/drizzle.config.ts
// Configuración de drizzle-kit para generar y aplicar migraciones.
// db:generate corre OFFLINE (no necesita una DB activa) y produce el SQL versionado.
// db:migrate aplica las migraciones; requiere DATABASE_URL en el entorno.

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Esquema fuente (drizzle-kit lo lee para generar el diff SQL)
  schema: './src/schema/index.ts',
  // Directorio donde se depositan las migraciones SQL versionadas
  out: './migrations',
  // Driver de Postgres estándar (no pgvector, no mysql, no sqlite)
  dialect: 'postgresql',
  // La URL se usa solo en db:migrate; db:generate no la necesita.
  // Usamos la variable de entorno directamente aquí porque drizzle.config.ts
  // se ejecuta como CLI, no a través de cargarEnv (que lanzaría error si falta).
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
