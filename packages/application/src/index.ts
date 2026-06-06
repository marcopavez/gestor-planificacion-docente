// packages/application/src/index.ts
// Paquete @faro/application: orquesta puertos del dominio vía use cases.
// INV-5: solo importa @faro/domain. No importa infra-*, next, SDK de Anthropic ni apps.

export type { GenerarPruebaInput } from './aula/GenerarPruebaUseCase.js';
export { GenerarPruebaUseCase, GeneracionError } from './aula/GenerarPruebaUseCase.js';

// --- Cascada de Aula (demo síncrono, full-context, genérico por asignatura/nivel) ---
export type { ContextoCascada, OaCorpus, ResultadoCascada } from './aula/cascada/tipos.js';
export { CascadaAulaUseCase } from './aula/cascada/CascadaAulaUseCase.js';
export { GenerarPlanificacionUnidadUseCase } from './aula/cascada/GenerarPlanificacionUnidadUseCase.js';
export { GenerarPlanificacionClaseUseCase } from './aula/cascada/GenerarPlanificacionClaseUseCase.js';
export { GenerarPruebaCascadaUseCase } from './aula/cascada/GenerarPruebaCascadaUseCase.js';
export { GenerarClaseDeckUseCase } from './aula/cascada/GenerarClaseDeckUseCase.js';
