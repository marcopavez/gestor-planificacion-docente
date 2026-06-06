// packages/domain/src/index.ts
// Punto de entrada del paquete @faro/domain — TS puro, sin framework deps (CA-0.6, INV-5).

// --- Entidades ---
export type {
  Cita,
  Dependencia,
  DocumentoGenerado,
  EstadoGeneracion,
  EstadoRevision,
  EstadoVigencia,
  Norma,
  ObjetivoAprendizaje,
  TipoNorma,
} from './entities/index.js';

// --- Puertos (firmas TS — los adapters los implementan en infra-*) ---
export type {
  ArchivoExportado,
  BloqueSistema,
  ClockPort,
  DocumentoRepository,
  EmbeddingsPort,
  ExportPort,
  JobRepository,
  LlmPort,
  NormaRepository,
  OaRepository,
  RerankerPort,
  ResultadoVerificacion,
  RetrievalPort,
  SalidaEstructurada,
  TrazaRepository,
  UsoTokens,
  VerificationGate,
} from './ports/index.js';

// --- Tipos auxiliares de dominio ---
// Tarea: define qué modelo del router usa cada operación (§4.5)
export type Tarea = 'extraccion' | 'redaccion' | 'razonamiento_normativo' | 'verificacion';

// Filtros para consultas de recuperación RAG
export interface FiltrosRecuperacion {
  readonly corpusVersionId: string;
  readonly soloVigentes: boolean;
  readonly dependencia?: import('./entities/index.js').Dependencia;
  readonly tipoNorma?: import('./entities/index.js').TipoNorma;
}

// Resultado de recuperación híbrida (vector + BM25 + RRF)
export interface Recuperado<T> {
  readonly item: T;
  readonly score: number;
  readonly via: 'vector' | 'bm25' | 'grafo';
}

// Input para crear un documento borrador
export interface NuevoDocumento {
  readonly establecimientoId: string;
  readonly tipo: string;
  readonly autorHumano: string | null;
}

// Input para registrar una traza de IA (reproducibilidad legal — INV-4)
export interface NuevaTraza {
  readonly documentoId: string;
  readonly corpusVersionId: string;
  readonly modelo: string;
  readonly rutaDecision: string;
  readonly promptHash: string;
  readonly recuperado: unknown; // IDs + scores (auditables)
  readonly citas: unknown;
  readonly evals: unknown;
  readonly usage: import('./ports/index.js').UsoTokens;
  readonly revisor: string | null;
}

// --- Schemas Zod (los 4 de RF-0.7) ---
export { SchemaClase } from './schemas/clase.js';
export type { Clase } from './schemas/clase.js';
export { SchemaPmeAccion } from './schemas/pmeAccion.js';
export type { PmeAccion } from './schemas/pmeAccion.js';
export { SchemaPrueba, ItemPrueba } from './schemas/prueba.js';
export type { ItemPruebaType, Prueba } from './schemas/prueba.js';
export { SchemaReglamentoAuditoria } from './schemas/reglamentoAuditoria.js';
export type { ReglamentoAuditoria } from './schemas/reglamentoAuditoria.js';

// --- Schemas de la cascada M0 Aula (spec 02-aula-cascada) ---
export { SchemaPlanificacionUnidad, OaReferenciado, IndicadorEvaluacion } from './schemas/planificacionUnidad.js';
export type {
  PlanificacionUnidad,
  OaReferenciadoType,
  IndicadorEvaluacionType,
} from './schemas/planificacionUnidad.js';
export { SchemaPlanificacionClase, ClasePlanificada } from './schemas/planificacionClase.js';
export type { PlanificacionClase, ClasePlanificadaType } from './schemas/planificacionClase.js';
export { SchemaClaseDeck, SlideDeck } from './schemas/claseDeck.js';
export type { ClaseDeck, SlideDeckType } from './schemas/claseDeck.js';

// --- Errores del dominio ---
export { CitaInvalidaError, GeneracionError, ReglaDominioError } from './errors/index.js';
