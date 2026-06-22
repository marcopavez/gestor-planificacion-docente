// packages/application/src/index.ts
// Paquete @faro/application: orquesta puertos del dominio vía use cases.
// INV-5: solo importa @faro/domain. No importa infra-*, next, SDK de Anthropic ni apps.

export type { GenerarPruebaInput } from './aula/GenerarPruebaUseCase.js';
export { GenerarPruebaUseCase, GeneracionError } from './aula/GenerarPruebaUseCase.js';

// --- Cascada de Aula (demo síncrono, full-context, genérico por asignatura/nivel) ---
export type {
  ContextoCascada,
  MetaArtefacto,
  MetadatosCascada,
  OaCorpus,
  ResultadoCascada,
} from './aula/cascada/tipos.js';
// Veredicto de gates (re-export del dominio) para tipar respuestas en apps.
export type { Hallazgo, ReporteGates, ResultadoGate, Severidad } from '@faro/domain';
export { CascadaAulaUseCase } from './aula/cascada/CascadaAulaUseCase.js';
export { GenerarPlanificacionUnidadUseCase } from './aula/cascada/GenerarPlanificacionUnidadUseCase.js';
export { GenerarPlanificacionClaseUseCase } from './aula/cascada/GenerarPlanificacionClaseUseCase.js';
export { GenerarPruebaCascadaUseCase } from './aula/cascada/GenerarPruebaCascadaUseCase.js';
export { GenerarClaseDeckUseCase } from './aula/cascada/GenerarClaseDeckUseCase.js';

// --- PPT infantil (Fase 3): ClaseDeck infantil data-driven desde la PlanificacionUnidad ---
export { GenerarPptInfantilUseCase } from './aula/cascada/GenerarPptInfantilUseCase.js';
export { ProcesarTrabajoPptInfantilUseCase } from './aula/cascada/ProcesarTrabajoPptInfantilUseCase.js';
export type {
  DependenciasProcesarPptInfantil,
  ResultadoProcesarPptInfantil,
} from './aula/cascada/ProcesarTrabajoPptInfantilUseCase.js';

// --- Prueba formativa (Fase 4): Prueba data-driven desde la PlanificacionUnidad + builder de encabezado ---
export { GenerarPruebaFormativaUseCase } from './aula/cascada/GenerarPruebaFormativaUseCase.js';

// --- Guía del alumno (Tanda 1): guía híbrida standalone desde OA + conocimiento ---
export { GenerarGuiaUseCase } from './aula/cascada/GenerarGuiaUseCase.js';

// --- Material para colorear (Plan 1): descripción del dibujo anclada al OA ---
export { GenerarDescripcionDibujoUseCase } from './aula/cascada/GenerarDescripcionDibujoUseCase.js';
export { GenerarMaterialColorearUseCase } from './aula/cascada/GenerarMaterialColorearUseCase.js';
export type { DependenciasGenerarMaterialColorear } from './aula/cascada/GenerarMaterialColorearUseCase.js';
export { ProcesarTrabajoMaterialColorearUseCase } from './aula/cascada/ProcesarTrabajoMaterialColorearUseCase.js';
export type { ResultadoProcesarMaterialColorear, DependenciasProcesarMaterialColorear } from './aula/cascada/ProcesarTrabajoMaterialColorearUseCase.js';
export { ProcesarTrabajoGuiaUseCase } from './aula/cascada/ProcesarTrabajoGuiaUseCase.js';
export type {
  DependenciasProcesarGuia,
  ResultadoProcesarGuia,
} from './aula/cascada/ProcesarTrabajoGuiaUseCase.js';
export { construirEncabezadoPrueba } from './aula/cascada/encabezadoPrueba.js';
export type { DatosInstitucionales } from './aula/cascada/encabezadoPrueba.js';
export { ProcesarTrabajoPruebaUseCase } from './aula/cascada/ProcesarTrabajoPruebaUseCase.js';
export type {
  DependenciasProcesarPrueba,
  ResultadoProcesarPrueba,
} from './aula/cascada/ProcesarTrabajoPruebaUseCase.js';

// --- derivarContextoCascada (función pura: UnidadPlanificada → ContextoCascada) ---
export { derivarContextoCascada } from './aula/cascada/derivarContextoCascada.js';

// --- Revisión humana HIL (H-PA.10, RF-PA.11/12): transiciones vía máquina de estados del dominio ---
export { RevisarDocumentoUseCase } from './aula/RevisarDocumentoUseCase.js';
export type { ResultadoRevision } from './aula/RevisarDocumentoUseCase.js';

// --- Worker de generación asíncrona (H-PA.8, ADR-003): orquesta la cascada desde la cola ---
export { ProcesarTrabajoCascadaUseCase } from './aula/ProcesarTrabajoCascadaUseCase.js';
export type {
  DependenciasProcesarTrabajo,
  ResultadoProcesarTrabajo,
} from './aula/ProcesarTrabajoCascadaUseCase.js';

// --- Generación híbrida de la Planificación de Unidad (H-2.3, spec 02-planificacion §1.2) ---
export { GenerarPlanificacionUseCase } from './planificacion/GenerarPlanificacionUseCase.js';
export {
  GeneracionPlanificacionError,
  PlantillaNoConfiguradaError,
  OaInexistenteError,
} from './planificacion/GenerarPlanificacionUseCase.js';
export type {
  DependenciasGenerarPlanificacion,
  MetaPlanificacion,
  ResultadoGenerarPlanificacion,
} from './planificacion/GenerarPlanificacionUseCase.js';
export { ProcesarTrabajoPlanificacionUseCase } from './planificacion/ProcesarTrabajoPlanificacionUseCase.js';
export type {
  DependenciasProcesarPlanificacion,
  ResultadoProcesarPlanificacion,
} from './planificacion/ProcesarTrabajoPlanificacionUseCase.js';

// --- CRUD de PlanificacionAnual (H-PA.5) ---
export { CrearPlanificacionAnualUseCase } from './planificacion/CrearPlanificacionAnualUseCase.js';
export type { ResultadoCrearPlan } from './planificacion/CrearPlanificacionAnualUseCase.js';
export { EditarPlanificacionAnualUseCase } from './planificacion/EditarPlanificacionAnualUseCase.js';
export type { ResultadoEditarPlan, ResultadoEdicion } from './planificacion/EditarPlanificacionAnualUseCase.js';
export { ListarPlanificacionAnualUseCase } from './planificacion/ListarPlanificacionAnualUseCase.js';
export type { FiltroListarPlan } from './planificacion/ListarPlanificacionAnualUseCase.js';
export { ObtenerPlanificacionAnualUseCase } from './planificacion/ObtenerPlanificacionAnualUseCase.js';
