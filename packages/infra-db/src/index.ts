// packages/infra-db/src/index.ts
// Paquete @faro/infra-db: adapters Drizzle (repositorios, HybridRetriever).
// INV-5: implementa puertos de @faro/domain; nunca importa apps ni application directamente.
// La composition root (DI) vive en apps/web y apps/worker.

// TODO H-0.2: schema Drizzle + migraciones
// TODO H-0.5: repositorios (DrizzleNormaRepository, DrizzleOaRepository, etc.)
// TODO H-0.6: HybridRetriever (vector <=> + ts_rank_cd + RRF)

/**
 * Placeholder que confirma que el paquete compila y que sus exports
 * están cableados con @faro/domain (RF-0.1).
 */
export const INFRA_DB_VERSION = '0.0.1-fase0-skeleton' as const;
