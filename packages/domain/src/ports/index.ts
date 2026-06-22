// packages/domain/src/ports/index.ts
// Puertos del dominio (firmas TS) — INV-5, RF-0.6, §4.4 del blueprint.
// Los adapters (infra-*) implementan estas interfaces; el dominio nunca importa adapters.

import type { ZodType } from 'zod';
import type {
  Cita,
  ClaseDeck,
  CorpusVersion,
  DocumentoGenerado,
  EstadoGeneracion,
  EstadoRevision,
  FiltrosRecuperacion,
  Norma,
  NuevaTraza,
  NuevoDocumento,
  ObjetivoAprendizaje,
  Recuperado,
  Tarea,
} from '../index.js';
import type {
  PlanificacionAnual,
  PlanificacionAnualGuardada,
  UnidadPlanificada,
} from '../schemas/planificacionAnual.js';
import type { FormatoPlantillaType, PlantillaPlanificacion } from '../schemas/plantilla.js';
import type { PlanificacionUnidad } from '../schemas/planificacionUnidad.js';
import type { CatalogosPlanificacion } from '../schemas/catalogosPlanificacion.js';
import type { PayloadPlanificacion } from '../schemas/generarPlanificacion.js';
import type { PayloadPrueba } from '../schemas/payloadPrueba.js';
import type { PayloadPptInfantil } from '../schemas/payloadPptInfantil.js';
import type { PayloadGuia } from '../schemas/payloadGuia.js';
import type { PayloadMaterialColorear } from '../schemas/payloadMaterialColorear.js';
import type { Lamina } from '../schemas/lamina.js';
import type { PayloadFicha } from '../schemas/payloadFicha.js';
import type { Ficha } from '../schemas/ficha.js';
import type { Prueba } from '../schemas/prueba.js';
import type { EncabezadoPrueba } from '../schemas/encabezadoPrueba.js';
import type { Guia } from '../schemas/guia.js';

// --- Recuperación (RAG) ---

export interface RetrievalPort {
  hibrida(query: string, f: FiltrosRecuperacion, k: number): Promise<Recuperado<Norma>[]>;
  hibridaOa(query: string, f: FiltrosRecuperacion, k: number): Promise<Recuperado<ObjetivoAprendizaje>[]>;
}

// --- Embeddings ---

export interface EmbeddingsPort {
  embed(textos: readonly string[], modo: 'query' | 'document'): Promise<number[][]>;
  readonly dimension: number; // fijada por corpus_version (ADR-004)
}

// --- Reranker ---

export interface RerankerPort {
  ordenar<T>(query: string, candidatos: readonly Recuperado<T>[], topK: number): Promise<Recuperado<T>[]>;
}

// --- LLM ---

export interface BloqueSistema {
  readonly texto: string;
  readonly cacheable: boolean; // si true, se aplica cache_control:{type:"ephemeral"}
}

export interface UsoTokens {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
}

export interface SalidaEstructurada<T> {
  readonly parsed: T | null; // null = refusal o max_tokens — nunca persiste (RF-0.9)
  readonly stopReason: string;
  readonly usage: UsoTokens;
  readonly modelo: string;
}

export interface LlmPort {
  generar<T>(args: {
    tarea: Tarea;
    schema: ZodType<T>;
    system: readonly BloqueSistema[];
    entradaUsuario: string;
  }): Promise<SalidaEstructurada<T>>;
}

// --- Generación de imágenes (line-art para colorear) — INV-6: proveedor tras puerto ---
// generarLineArt devuelve el PNG, o null si el proveedor no está disponible (modo degradado sin
// API key) → el caller ensambla la lámina con un placeholder. Errores transitorios del proveedor
// se lanzan (el worker reintenta), null es un estado degradado explícito (no se reintenta).
export interface OpcionesLineArt {
  readonly aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
}

export interface ImageGenPort {
  generarLineArt(descripcion: string, opts?: OpcionesLineArt): Promise<Buffer | null>;
}

// --- Banco de imágenes generadas (cache por clave determinista) — INV-1/INV-4 ---
// El dibujo se genera una vez por (OA/concepto) y se reusa. File-backed: el adapter guarda el PNG +
// metadata por clave; el dominio/aplicación solo ven el puerto (testeable con un doble en memoria).
export interface MetaDibujo {
  readonly oaCodigo: string;
  readonly concepto: string;
  readonly descripcion: string; // descripción (EN) con la que se generó — para alt-text/placeholder
  readonly modelo: string; // modelo de imagen (p. ej. imagen-4.0-fast-generate-001) o 'placeholder'
  readonly imagenesVersion: string; // IMAGENES_VERSION (INV-4)
}

export interface DibujoCacheado {
  readonly png: Buffer;
  readonly descripcion: string;
  readonly concepto: string;
}

export interface BancoImagenesGeneradasPort {
  buscar(clave: string): Promise<DibujoCacheado | null>;
  guardar(clave: string, png: Buffer, meta: MetaDibujo): Promise<void>;
}

// --- Export (.pptx/.docx) — INV-6: render tras puerto; cambiarlo no toca la cascada ---

export interface ArchivoExportado {
  readonly ruta: string;
  readonly mime: string;
  readonly bytes: number;
}

export interface ExportPort {
  exportarPptx(deck: ClaseDeck): Promise<ArchivoExportado>;
}

// --- Export de la Planificación de Unidad (.docx/.pdf) — H-2.5/H-2.6, INV-6 ---
// El layout se deriva 1:1 de la `definicion` de la plantilla activa (calca las tablas del PDF real);
// los catálogos proveen las opciones de cada checkbox_set. `.pdf` = render del mismo .docx (LibreOffice).
export interface ExportPlanificacionPort {
  // idDocumento (opcional) hace único el nombre de archivo en disco: dos documentos con la misma
  // asignatura/nivel/formato no se pisan al exportar a la carpeta compartida (H-2.7, fix de colisión).
  aDocx(
    plan: PlanificacionUnidad,
    plantilla: PlantillaPlanificacion,
    catalogos: CatalogosPlanificacion,
    idDocumento?: string,
  ): Promise<ArchivoExportado>;
  aPdf(
    plan: PlanificacionUnidad,
    plantilla: PlantillaPlanificacion,
    catalogos: CatalogosPlanificacion,
    idDocumento?: string,
  ): Promise<ArchivoExportado>;
}

// --- Export de la Prueba formativa (.docx/.pdf) — Fase 4, INV-6 ---
// Dos VARIANTES del mismo modelo: 'alumno' (hoja sin respuestas) y 'pauta' (hoja de respuestas con
// la solución + retroalimentación por ítem). La pauta es un DOCUMENTO SEPARADO (ninguna prueba real
// traía pauta embebida). El encabezado institucional se pasa como dato (no es IA): ver EncabezadoPrueba.
// `.pdf` = el mismo .docx renderizado por LibreOffice (como ExportPlanificacionPort).
export type VariantePrueba = 'alumno' | 'pauta';

export interface ExportPruebaPort {
  // idDocumento (opcional) hace único el nombre de archivo en disco (evita colisiones al exportar a la
  // carpeta compartida, como ExportPlanificacionPort).
  aDocx(
    prueba: Prueba,
    encabezado: EncabezadoPrueba,
    variante: VariantePrueba,
    idDocumento?: string,
  ): Promise<ArchivoExportado>;
  aPdf(
    prueba: Prueba,
    encabezado: EncabezadoPrueba,
    variante: VariantePrueba,
    idDocumento?: string,
  ): Promise<ArchivoExportado>;
}

// --- Export de la Guía del alumno (.docx/.pdf) — Tanda 1, INV-6 ---
export interface DatosInstitucionalesGuia {
  readonly nombreColegio: string;
  readonly comuna: string;
  readonly docente?: string;
}

export interface ExportGuiaPort {
  aDocx(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
  aPdf(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
}

// --- Export de la Lámina para colorear (.docx/.pdf) — Plan 1, INV-6 ---
// Reusa DatosInstitucionalesGuia (mismos campos institucionales). El PNG line-art lo resuelve el
// adapter desde el banco generado por `lamina.imagen_clave`; si falta, degrada a un placeholder.
export interface ExportLaminaPort {
  aDocx(lamina: Lamina, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
  aPdf(lamina: Lamina, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
}

// --- Export de la Ficha educativa para colorear (.docx/.pdf) — Plan 2, INV-6 ---
// Reusa DatosInstitucionalesGuia. Combina ejercicios (motor de prueba) + 1 dibujo line-art del banco
// generado por `ficha.imagen_clave`; si falta el PNG, degrada a un placeholder.
export interface ExportFichaPort {
  aDocx(ficha: Ficha, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
  aPdf(ficha: Ficha, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
}

// --- Verificación ---

export interface ResultadoVerificacion {
  readonly ok: boolean;
  readonly hallazgos: readonly {
    citaRef: string;
    motivo: 'inexistente' | 'derogada' | 'no_respalda';
  }[];
}

export interface VerificationGate {
  // (a)(b) deterministas contra DB; (c) "¿respalda?" = TODO LLM (Fase 1/3)
  verificarCitas(
    citas: readonly Cita[],
    contexto: readonly Norma[],
    corpusVersionId: string,
  ): Promise<ResultadoVerificacion>;
}

// --- Reloj inyectable (INV-1: reglas de vigencia testeables sin red) ---

export interface ClockPort {
  hoy(): Date;
}

// --- Repositorios ---

export interface NormaRepository {
  recuperarVigentesPorVersion(corpusVersionId: string, filtros: FiltrosRecuperacion): Promise<Norma[]>;
  porIds(ids: readonly string[]): Promise<Norma[]>;
}

export interface OaRepository {
  porAsignaturaCurso(asignatura: string, curso: string, corpusVersionId: string): Promise<ObjetivoAprendizaje[]>;
  // RF-1.4 / RF-2.5: OA reales de las Bases por (asignatura, nivel) para que la planificación
  // los ofrezca como datos fijos. La versión vigente del corpus la resuelve el adapter
  // (file-based: del manifiesto; DB: la corpus_version publicada). Error tipado si no existe.
  porAsignaturaNivel(asignatura: string, nivel: string): Promise<ObjetivoAprendizaje[]>;
  porIds(ids: readonly string[]): Promise<ObjetivoAprendizaje[]>;
}

// --- Plantillas de planificación (RF-2.4 — data-driven; el adapter file-based vive en infra-corpus) ---

export interface PlantillaRepository {
  porId(id: string): Promise<PlantillaPlanificacion | null>;
  // La plantilla activa de un establecimiento para un formato (A/B). null si no hay una configurada.
  activaPara(establecimiento: string, formato: FormatoPlantillaType): Promise<PlantillaPlanificacion | null>;
  listar(): Promise<PlantillaPlanificacion[]>;
}

export interface DocumentoRepository {
  crearBorrador(input: NuevoDocumento): Promise<DocumentoGenerado>;
  marcarGeneracion(
    id: string,
    estado: EstadoGeneracion,
    contenido?: unknown,
    gates?: unknown,
  ): Promise<void>;
  porId(id: string): Promise<DocumentoGenerado | null>;
  // Devuelve la cascada completa desde su raíz: el documento raíz (id = raizId) + todos los
  // que cuelgan de él por origen_id (clase/prueba → unidad; deck → clase). RF-PA.9 / H-PA.9.
  listarPorRaiz(raizId: string): Promise<DocumentoGenerado[]>;
  // Cola de revisión HIL (RF-PA.12, H-PA.10): documentos 'borrador'/'en_revision' del
  // establecimiento, más recientes primero. Solo lo pendiente; no incluye aprobado/rechazado.
  listarPendientesRevision(establecimientoId: string): Promise<DocumentoGenerado[]>;
  // Persiste el resultado de UNA transición HIL ya decidida por la máquina de estados del dominio.
  // El adapter NO valida la transición (eso lo hace `transicionar`); el CHECK chk_aprobado_requiere_humano
  // es la última red contra 'aprobado' sin autorHumano (INV-3). autorHumano = null salvo en 'aprobado'.
  actualizarEstadoRevision(
    id: string,
    estado: EstadoRevision,
    autorHumano: string | null,
  ): Promise<void>;
}

export interface TrazaRepository {
  registrar(traza: NuevaTraza): Promise<void>;
}

// Un trabajo de la cola listo para procesar (cascada desde una unidad planificada — RF-PA.3, ADR-003).
export interface TrabajoCascada {
  readonly id: string;
  readonly unidadPlanificadaId: string;
  readonly intentos: number; // ya incrementado por tomarSiguiente (cuenta el intento en curso)
}

// Un trabajo de generación de planificación híbrida (RF-2.14, H-2.7). El payload lleva la petición
// completa del docente; el documento aún no existe al encolar (lo crea el worker).
export interface TrabajoPlanificacion {
  readonly id: string;
  readonly payload: PayloadPlanificacion;
  readonly intentos: number; // ya incrementado por tomarSiguientePlanificacion (cuenta el intento en curso)
}

// Un trabajo de generación de prueba formativa (Fase 4): el payload referencia el documento de
// planificación de unidad del que deriva la prueba; el worker lo carga y valida al tomarlo.
export interface TrabajoPrueba {
  readonly id: string;
  readonly payload: PayloadPrueba;
  readonly intentos: number; // ya incrementado por tomarSiguientePrueba (cuenta el intento en curso)
}

// Un trabajo de generación de PPT infantil (Fase 3): el payload referencia el documento de
// planificación de unidad del que deriva el deck; el worker lo carga y valida al tomarlo.
export interface TrabajoPptInfantil {
  readonly id: string;
  readonly payload: PayloadPptInfantil;
  readonly intentos: number; // ya incrementado por tomarSiguientePptInfantil (cuenta el intento en curso)
}

// Un trabajo de generación de GUÍA (Tanda 1): el payload trae OA + conocimiento (standalone desde el OA).
export interface TrabajoGuia {
  readonly id: string;
  readonly payload: PayloadGuia;
  readonly intentos: number; // ya incrementado por tomarSiguienteGuia (cuenta el intento en curso)
}

// Un trabajo de generación de MATERIAL PARA COLOREAR (Plan 1): standalone desde un OA (como la guía).
export interface TrabajoMaterialColorear {
  readonly id: string;
  readonly payload: PayloadMaterialColorear;
  readonly intentos: number; // ya incrementado por tomarSiguienteMaterialColorear (cuenta el intento en curso)
}

// Un trabajo de generación de FICHA para colorear (Plan 2): standalone desde un OA (como la lámina).
export interface TrabajoFicha {
  readonly id: string;
  readonly payload: PayloadFicha;
  readonly intentos: number; // ya incrementado por tomarSiguienteFicha (cuenta el intento en curso)
}

// Estado de un job de la cola, leído por la web para hacer polling del avance (H-PA.9).
// documentoId = id del documento raíz de la cascada (la unidad generada) cuando estado='hecho'.
export interface EstadoJob {
  readonly id: string;
  readonly estado: 'pendiente' | 'en_proceso' | 'hecho' | 'fallido';
  readonly documentoId: string | null;
  readonly intentos: number;
  readonly error: string | null;
}

export interface JobRepository {
  // Encola una corrida de la cascada para una unidad; devuelve el id del job creado.
  encolarCascadaUnidad(unidadPlanificadaId: string): Promise<string>;
  // Encola una generación de planificación híbrida (RF-2.14); devuelve el id del job creado.
  encolarPlanificacion(payload: PayloadPlanificacion): Promise<string>;
  // Encola una generación de prueba formativa (Fase 4) desde una unidad ya planificada.
  encolarPrueba(payload: PayloadPrueba): Promise<string>;
  // Encola una generación de PPT infantil (Fase 3) desde una unidad ya planificada.
  encolarPptInfantil(payload: PayloadPptInfantil): Promise<string>;
  // Encola una generación de GUÍA (Tanda 1) standalone desde un OA.
  encolarGuia(payload: PayloadGuia): Promise<string>;
  // Encola una generación de MATERIAL PARA COLOREAR (Plan 1) standalone desde un OA.
  encolarMaterialColorear(payload: PayloadMaterialColorear): Promise<string>;
  // Encola una generación de FICHA para colorear (Plan 2) standalone desde un OA.
  encolarFicha(payload: PayloadFicha): Promise<string>;
  // FOR UPDATE SKIP LOCKED — ADR-003. Marca el job 'en_proceso' e incrementa intentos atómicamente.
  // Filtra por tipo de trabajo 'cascada_unidad' (coexiste con la cola de planificación, H-2.7).
  tomarSiguiente(workerId: string): Promise<TrabajoCascada | null>;
  // Análogo a tomarSiguiente para los jobs 'planificacion' (su propia cola por tipo de trabajo).
  tomarSiguientePlanificacion(workerId: string): Promise<TrabajoPlanificacion | null>;
  // Análogo para la cola 'prueba_formativa' (Fase 4): su propia cola por tipo de trabajo.
  tomarSiguientePrueba(workerId: string): Promise<TrabajoPrueba | null>;
  // Análogo para la cola 'ppt_infantil' (Fase 3): su propia cola por tipo de trabajo.
  tomarSiguientePptInfantil(workerId: string): Promise<TrabajoPptInfantil | null>;
  // Análogo para la cola 'guia': su propia cola por tipo de trabajo.
  tomarSiguienteGuia(workerId: string): Promise<TrabajoGuia | null>;
  // Análogo para la cola 'material_colorear': su propia cola por tipo de trabajo.
  tomarSiguienteMaterialColorear(workerId: string): Promise<TrabajoMaterialColorear | null>;
  // Análogo para la cola 'ficha_colorear' (Plan 2): su propia cola por tipo de trabajo.
  tomarSiguienteFicha(workerId: string): Promise<TrabajoFicha | null>;
  // Estado del job para el polling de la web; null si el id no existe (H-PA.9).
  obtenerEstado(jobId: string): Promise<EstadoJob | null>;
  // Éxito: estado='hecho' y documento_id = id del documento raíz de la cascada (la unidad generada).
  marcarHecho(id: string, documentoRaizId: string): Promise<void>;
  // Reintento acotado: vuelve a 'pendiente' y registra el error del intento (otro worker lo retomará).
  reintentar(id: string, error: string): Promise<void>;
  // Agotados los reintentos: estado='fallido' y se conserva el último error.
  marcarFallido(id: string, error: string): Promise<void>;
}

// --- Unidad de trabajo transaccional (atomicidad de la persistencia de la cascada) ---
// Sin atomicidad, un fallo a mitad de los 4 crearBorrador + 4 trazas + marcarHecho deja
// documentos huérfanos que el reintento del job duplicaría. enTransaccion envuelve todo en UNA tx.

export interface ReposTransaccion {
  readonly documentos: DocumentoRepository;
  readonly trazas: TrazaRepository;
  readonly jobs: JobRepository;
}

export interface UnidadDeTrabajo {
  // Ejecuta fn dentro de UNA transacción; si fn lanza, se revierte TODO (atomicidad).
  enTransaccion<T>(fn: (repos: ReposTransaccion) => Promise<T>): Promise<T>;
}

// --- Corpus Version (RF-PA.2, INV-4, ADR-004) ---

export interface CorpusVersionRepository {
  // Crea una nueva versión en estado 'borrador'; idempotencia por etiqueta la maneja el caller.
  crear(etiqueta: string): Promise<CorpusVersion>;
  buscarPorEtiqueta(etiqueta: string): Promise<CorpusVersion | null>;
  // Transiciona a 'publicada' y registra publicadaAt = ahora; snapshot activo.
  publicar(id: string): Promise<CorpusVersion>;
  // Retorna la versión publicada más reciente (snapshot activo para generar documentos).
  obtenerPublicadaVigente(): Promise<CorpusVersion | null>;
}

// --- Planificación Anual (RF-PA.4/PA.5 — §4.2 plan-fase-1) ---
// Solo la interfaz; el adapter Drizzle se implementa en H-PA.3/H-PA.5 (infra-db).

export interface PlanificacionAnualRepository {
  // corpusVersionId ligado al corpus vigente en el momento de guardar (INV-4, RF-PA.4).
  guardar(p: PlanificacionAnual, corpusVersionId: string): Promise<PlanificacionAnualGuardada>;
  // Actualiza la cabecera y reemplaza unidades; corpusVersionId puede cambiar si el corpus se actualizó.
  actualizar(id: string, p: PlanificacionAnual, corpusVersionId: string): Promise<PlanificacionAnualGuardada>;
  obtener(id: string): Promise<PlanificacionAnualGuardada | null>;
  listar(filtro: {
    establecimiento: string;
    asignatura?: string;
    nivel?: string;
    anio?: number;
  }): Promise<PlanificacionAnualGuardada[]>;
  // Resuelve una unidad y la cabecera de su plan (para derivar el ContextoCascada en el worker — RF-PA.3).
  obtenerUnidad(unidadPlanificadaId: string): Promise<{
    unidad: UnidadPlanificada;
    cabecera: {
      id: string;
      establecimiento: string;
      asignatura: string;
      nivel: string;
      anio: number;
      corpusVersionId: string;
    };
  } | null>;
}
