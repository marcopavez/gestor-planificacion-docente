// packages/infra-db/src/index.ts
// @faro/infra-db — capa de persistencia Drizzle / Postgres para el proyecto Faro.
// INV-5: este paquete implementa puertos de @faro/domain; nunca es importado por domain ni application.
//         La composition root (DI) vive en apps/web y apps/worker.

// --- Schema Drizzle (tablas y tipos inferidos) ---
export {
  corpusVersion,
  objetivoAprendizaje,
  planificacionAnual,
  unidadPlanificada,
  documentoGenerado,
  trazaIa,
  jobGeneracion,
} from './schema/index.js';

export type {
  CorpusVersion,
  NuevaCorpusVersion,
  ObjetivoAprendizaje,
  NuevoObjetivoAprendizaje,
  PlanificacionAnualRow,
  NuevaPlanificacionAnualRow,
  UnidadPlanificadaRow,
  NuevaUnidadPlanificadaRow,
  DocumentoGenerado,
  NuevoDocumentoGenerado,
  TrazaIa,
  NuevaTrazaIa,
  JobGeneracion,
  NuevoJobGeneracion,
} from './schema/index.js';

// --- Cliente Drizzle (factoría, tipo de instancia) ---
export { crearDb } from './db.js';
export type { DrizzleDb, EnvDb } from './db.js';

// --- Adapters de repositorios (implementan los puertos de @faro/domain — INV-5) ---
export { OaRepositoryDrizzle, CorpusNoPublicadoError } from './repos/OaRepositoryDrizzle.js';
export { DocumentoRepositoryDrizzle } from './repos/DocumentoRepositoryDrizzle.js';
export { TrazaRepositoryDrizzle } from './repos/TrazaRepositoryDrizzle.js';
export { JobRepositoryDrizzle } from './repos/JobRepositoryDrizzle.js';
export { PlanificacionAnualRepositoryDrizzle } from './repos/PlanificacionAnualRepositoryDrizzle.js';
export { CorpusVersionRepositoryDrizzle } from './repos/CorpusVersionRepositoryDrizzle.js';
// Unidad de trabajo transaccional: envuelve la persistencia de la cascada en UNA tx (atomicidad).
export { UnidadDeTrabajoDrizzle } from './repos/UnidadDeTrabajoDrizzle.js';
