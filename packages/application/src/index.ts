// packages/application/src/index.ts
// Paquete @faro/application: orquesta puertos del dominio vía use cases.
// INV-5: solo importa @faro/domain. No importa infra-*, next, SDK de Anthropic ni apps.

export type { GenerarPruebaInput } from './aula/GenerarPruebaUseCase.js';
export { GenerarPruebaUseCase, GeneracionError } from './aula/GenerarPruebaUseCase.js';

// --- Cascada de Aula (demo síncrono, full-context, genérico por asignatura/nivel) ---
export type { ContextoCascada, OaCorpus, ResultadoCascada } from './aula/cascada/tipos.js';
// Veredicto de gates (re-export del dominio) para tipar respuestas en apps.
export type { Hallazgo, ReporteGates, ResultadoGate, Severidad } from '@faro/domain';
export { CascadaAulaUseCase } from './aula/cascada/CascadaAulaUseCase.js';
export { GenerarPlanificacionUnidadUseCase } from './aula/cascada/GenerarPlanificacionUnidadUseCase.js';
export { GenerarPlanificacionClaseUseCase } from './aula/cascada/GenerarPlanificacionClaseUseCase.js';
export { GenerarPruebaCascadaUseCase } from './aula/cascada/GenerarPruebaCascadaUseCase.js';
export { GenerarClaseDeckUseCase } from './aula/cascada/GenerarClaseDeckUseCase.js';

// --- derivarContextoCascada (función pura: UnidadPlanificada → ContextoCascada) ---
export { derivarContextoCascada } from './aula/cascada/derivarContextoCascada.js';

// --- CRUD de PlanificacionAnual (H-PA.5) ---
export { CrearPlanificacionAnualUseCase } from './planificacion/CrearPlanificacionAnualUseCase.js';
export type { ResultadoCrearPlan } from './planificacion/CrearPlanificacionAnualUseCase.js';
export { EditarPlanificacionAnualUseCase } from './planificacion/EditarPlanificacionAnualUseCase.js';
export type { ResultadoEditarPlan, ResultadoEdicion } from './planificacion/EditarPlanificacionAnualUseCase.js';
export { ListarPlanificacionAnualUseCase } from './planificacion/ListarPlanificacionAnualUseCase.js';
export type { FiltroListarPlan } from './planificacion/ListarPlanificacionAnualUseCase.js';
export { ObtenerPlanificacionAnualUseCase } from './planificacion/ObtenerPlanificacionAnualUseCase.js';
