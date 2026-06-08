// packages/infra-corpus/src/index.ts
// Paquete @faro/infra-corpus: adapters file-based del corpus curado (OA de las Bases
// Curriculares + plantillas de planificación). Implementa puertos de @faro/domain; la
// composition root (DI) vive en apps/* (INV-5). Sin red ni DB (INV-1).

export { OaRepositoryCorpus } from './OaRepositoryCorpus.js';
export { PlantillaRepositoryCorpus } from './PlantillaRepositoryCorpus.js';
export {
  ArchivoCorpusInvalidoError,
  BloqueCorpusNoEncontradoError,
  CorpusVersionDesconocidaError,
} from './errors.js';
export {
  ArchivoCorpusSchema,
  ManifiestoSchema,
  OaCorpusSchema,
  BloqueManifiestoSchema,
  HabilidadCorpusSchema,
} from './schemas.js';
export type {
  ArchivoCorpus,
  Manifiesto,
  OaCorpus,
  BloqueManifiesto,
  HabilidadCorpus,
} from './schemas.js';
