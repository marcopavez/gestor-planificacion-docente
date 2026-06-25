// packages/domain/src/index.ts
// Punto de entrada del paquete @faro/domain — TS puro, sin framework deps (CA-0.6, INV-5).

// --- Entidades ---
export type {
  Cita,
  CorpusVersion,
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
  CorpusVersionRepository,
  DocumentoRepository,
  EmbeddingsPort,
  EstadoJob,
  ExportPort,
  ExportPlanificacionPort,
  ExportGuiaPort,
  DatosInstitucionalesGuia,
  ExportPruebaPort,
  JobRepository,
  LlmPort,
  NormaRepository,
  OaRepository,
  PlanificacionAnualRepository,
  PlantillaRepository,
  RerankerPort,
  ReposTransaccion,
  ResultadoVerificacion,
  RetrievalPort,
  SalidaEstructurada,
  TrabajoCascada,
  TrabajoGuia,
  TrabajoPlanificacion,
  TrabajoPptInfantil,
  TrabajoPrueba,
  TrazaRepository,
  UnidadDeTrabajo,
  UsoTokens,
  VariantePrueba,
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

// Input para crear un documento borrador.
// La cascada necesita persistir corpus real (INV-4), trazabilidad self-FK (origen_id), y el artefacto.
export interface NuevoDocumento {
  readonly tipo: string; // 'planificacion_unidad' | 'planificacion_clase' | 'prueba' | 'clase_deck'
  readonly establecimientoId: string;
  readonly corpusVersionId: string; // versión REAL del corpus (no placeholder — INV-4, FK NOT NULL)
  readonly unidadPlanificadaId?: string;
  readonly origenId?: string; // self-FK: traza la cadena de la cascada (clase.origen_id = unidad, etc.)
  readonly payload?: unknown;
  readonly resultadoGates?: unknown;
  readonly estadoGeneracion?: import('./entities/index.js').EstadoGeneracion; // default 'pendiente'
  readonly autorHumano?: string | null;
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
export { SchemaPrueba, ItemPrueba, LIMITE_TEXTO_ITEM, fugaDeTextoEnPrueba, fugaDeTextoEnItems, itemsDuplicados } from './schemas/prueba.js';
export { validarItemPrueba } from './gates/itemPrueba.js';
export type { ItemPruebaType, Prueba } from './schemas/prueba.js';
export { SchemaEncabezadoPrueba, OaEncabezado } from './schemas/encabezadoPrueba.js';
export type { EncabezadoPrueba, OaEncabezadoType } from './schemas/encabezadoPrueba.js';
export { SchemaPayloadPrueba } from './schemas/payloadPrueba.js';
export type { PayloadPrueba } from './schemas/payloadPrueba.js';
export { SchemaPayloadPptInfantil } from './schemas/payloadPptInfantil.js';
export type { PayloadPptInfantil } from './schemas/payloadPptInfantil.js';
export { SchemaPayloadGuia } from './schemas/payloadGuia.js';
export type { PayloadGuia } from './schemas/payloadGuia.js';
export { SchemaGuia, LIMITE_TEXTO_GUIA, fugaDeTextoEnGuia } from './schemas/guia.js';
export type { Guia } from './schemas/guia.js';
export { SchemaReglamentoAuditoria } from './schemas/reglamentoAuditoria.js';
export type { ReglamentoAuditoria } from './schemas/reglamentoAuditoria.js';

// --- Schemas de la planificación (spec 02-planificacion) ---
export { SchemaPlanificacionUnidad, OaReferenciado, IndicadorEvaluacion } from './schemas/planificacionUnidad.js';
export {
  SchemaCatalogosPlanificacion,
  SchemaArchivoCatalogos,
  OpcionCatalogo,
} from './schemas/catalogosPlanificacion.js';
export type {
  CatalogosPlanificacion,
  ClaveCatalogo,
  OpcionCatalogoType,
} from './schemas/catalogosPlanificacion.js';
export {
  SchemaPlantillaPlanificacion,
  CampoPlantilla,
  SeccionPlantilla,
  TipoCampo,
  OrigenCampo,
  FormatoPlantilla,
  LayoutSeccion,
  ColorHex,
  TemaPlantilla,
  TemaSeccion,
  HeaderTema,
} from './schemas/plantilla.js';
export type {
  PlantillaPlanificacion,
  CampoPlantillaType,
  SeccionPlantillaType,
  TipoCampoType,
  OrigenCampoType,
  FormatoPlantillaType,
  LayoutSeccionType,
  TemaPlantillaType,
  TemaSeccionType,
  HeaderTemaType,
} from './schemas/plantilla.js';

// --- Generación híbrida de la planificación (spec 02-planificacion §1.2, H-2.3) ---
export {
  SchemaPayloadPlanificacion,
  SchemaSeleccionCheckboxes,
  SchemaBorradorPlanificacionIa,
} from './schemas/generarPlanificacion.js';
export type {
  PayloadPlanificacion,
  SeleccionCheckboxes,
  BorradorPlanificacionIa,
} from './schemas/generarPlanificacion.js';

// --- Planificación Anual (RF-PA.4 — §4.3 plan-fase-1) ---
export { SchemaPlanificacionAnual, SchemaUnidadPlanificada } from './schemas/planificacionAnual.js';
export type {
  PlanificacionAnual,
  PlanificacionAnualGuardada,
  UnidadPlanificada,
  UnidadPlanificadaGuardada,
} from './schemas/planificacionAnual.js';
export type {
  PlanificacionUnidad,
  OaReferenciadoType,
  IndicadorEvaluacionType,
} from './schemas/planificacionUnidad.js';
export { SchemaPlanificacionClase, ClasePlanificada } from './schemas/planificacionClase.js';
export type { PlanificacionClase, ClasePlanificadaType } from './schemas/planificacionClase.js';
export {
  SchemaClaseDeck,
  SlideDeck,
  TemaDeckInfantil,
  TEMAS_DECK_INFANTIL,
  tramoDeNivel,
  temaDeckInfantil,
  acentoAsignatura5y6,
} from './schemas/claseDeck.js';
export type { ClaseDeck, SlideDeckType, TemaDeckInfantilType } from './schemas/claseDeck.js';

// --- Gates deterministas de la cascada (INV-1/INV-2) ---
export {
  citationGate,
  construirResultado,
  correrGatesCascada,
  pedagogicalGate,
  planificacionGate,
  planificacionGateV2,
  secuenciaAnualGate,
} from './gates/index.js';
export { guiaGate } from './gates/guiaGate.js';
export type {
  EntradaCitationGate,
  EntradaGatesCascada,
  EntradaPlanificacionGateV2,
  Hallazgo,
  OaCorpus,
  OaVigencia,
  ReporteGates,
  ResultadoGate,
  Severidad,
} from './gates/index.js';

// --- Proyección plantilla→plan (data-driven; compartida por gate v2 y export — H-2.4/H-2.5) ---
export {
  valorEscalarCampo,
  seleccionCheckbox,
  listaCampo,
  oaCampo,
  campoTieneContenido,
} from './planificacion/proyeccion.js';

// --- HIL: máquina de estados de revisión (RF-PA.11, INV-2, INV-3) ---
// EstadoRevision ya se exporta desde entities/index.js (mismo tipo canónico).
export { transicionar } from './hil/estadoRevision.js';
export type {
  AccionRevision,
  ContextoTransicion,
  ResultadoTransicion,
} from './hil/estadoRevision.js';

// --- Errores del dominio ---
export { CitaInvalidaError, GeneracionError, ReglaDominioError } from './errors/index.js';

// --- Utils de dominio (funciones puras, deterministas — INV-1) ---
export { estaVigente } from './utils/vigencia.js';

// --- Banco de imágenes curado (catálogo versionado + resolución — INV-1/INV-4) ---
export { EntradaImagen, TRAMOS_IMAGEN, TIPOS_IMAGEN, IMAGENES_VERSION, CATALOGO_IMAGENES } from './imagenes/catalogo.js';
export type { EntradaImagenT, TramoImagen, TipoImagen } from './imagenes/catalogo.js';
export { topicosDisponiblesPara, resolverImagen } from './imagenes/resolver.js';
export { claveDibujo } from './imagenes/claveDibujo.js';
export { claveIlustracion } from './imagenes/claveIlustracion.js';
export type { ImageGenPort, OpcionesLineArt } from './ports/index.js';
export { SchemaPayloadMaterialColorear } from './schemas/payloadMaterialColorear.js';
export type { PayloadMaterialColorear } from './schemas/payloadMaterialColorear.js';
export { SchemaPayloadFicha } from './schemas/payloadFicha.js';
export type { PayloadFicha } from './schemas/payloadFicha.js';
export type {
  BancoImagenesGeneradasPort,
  DibujoCacheado,
  MetaDibujo,
  ExportLaminaPort,
  TrabajoMaterialColorear,
  ExportFichaPort,
  TrabajoFicha,
} from './ports/index.js';

// --- Material para colorear (Plan 1, 1º-3º básico — lámina + descripción del dibujo) ---
export {
  SchemaLamina,
  SchemaDescripcionDibujo,
  fugaDeTextoEnDescripcion,
  LIMITE_TEXTO_DESCRIPCION,
  gradoDeNivel,
} from './schemas/lamina.js';
export type { Lamina, DescripcionDibujo } from './schemas/lamina.js';

// --- Ficha educativa para colorear (Plan 2, 1º-3º básico) ---
export { SchemaFicha, SchemaEjerciciosFicha, fugaDeTextoEnFicha } from './schemas/ficha.js';
export type { Ficha, EjerciciosFicha } from './schemas/ficha.js';
