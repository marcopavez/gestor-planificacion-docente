// packages/domain/src/ports/index.ts
// Puertos del dominio (firmas TS) — INV-5, RF-0.6, §4.4 del blueprint.
// Los adapters (infra-*) implementan estas interfaces; el dominio nunca importa adapters.

import type { ZodType } from 'zod';
import type {
  Cita,
  ClaseDeck,
  DocumentoGenerado,
  EstadoGeneracion,
  FiltrosRecuperacion,
  Norma,
  NuevaTraza,
  NuevoDocumento,
  ObjetivoAprendizaje,
  Recuperado,
  Tarea,
} from '../index.js';
import type { PlanificacionAnual, PlanificacionAnualGuardada } from '../schemas/planificacionAnual.js';

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

// --- Export (.pptx/.docx) — INV-6: render tras puerto; cambiarlo no toca la cascada ---

export interface ArchivoExportado {
  readonly ruta: string;
  readonly mime: string;
  readonly bytes: number;
}

export interface ExportPort {
  exportarPptx(deck: ClaseDeck): Promise<ArchivoExportado>;
  // TODO RF-2.17: exportarPptx(deck, plantilla?: DefinicionPlantilla) + exportarDocx(doc, plantilla).
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
  porIds(ids: readonly string[]): Promise<ObjetivoAprendizaje[]>;
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
}

export interface TrazaRepository {
  registrar(traza: NuevaTraza): Promise<void>;
}

export interface JobRepository {
  encolar(documentoId: string): Promise<void>;
  // FOR UPDATE SKIP LOCKED — ADR-003
  tomarSiguiente(workerId: string): Promise<{ id: string; documentoId: string } | null>;
  marcar(id: string, estado: 'hecho' | 'fallido'): Promise<void>;
}

// --- Planificación Anual (RF-PA.4/PA.5 — §4.2 plan-fase-1) ---
// Solo la interfaz; el adapter Drizzle se implementa en H-PA.3/H-PA.5 (infra-db).

export interface PlanificacionAnualRepository {
  // corpusVersionId ligado al corpus vigente en el momento de guardar (INV-4, RF-PA.4).
  guardar(p: PlanificacionAnual, corpusVersionId: string): Promise<PlanificacionAnualGuardada>;
  obtener(id: string): Promise<PlanificacionAnualGuardada | null>;
  listar(filtro: {
    establecimiento: string;
    asignatura?: string;
    nivel?: string;
    anio?: number;
  }): Promise<PlanificacionAnualGuardada[]>;
}
