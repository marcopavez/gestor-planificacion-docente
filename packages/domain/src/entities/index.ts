// packages/domain/src/entities/index.ts
// Entidades del dominio regulado — TS puro, sin I/O (INV-1).

// Tipos de norma que maneja el sistema (Fase 0: subconjunto)
export type TipoNorma = 'ley' | 'decreto' | 'plan' | 'orientacion';

// Dependencia del establecimiento educacional
export type Dependencia = 'municipal' | 'slep' | 'part_subv' | 'part_pagado';

// Estado de vigencia de una norma
export type EstadoVigencia = 'vigente' | 'derogado' | 'modificado';

// Estado de revisión de un documento generado (HIL — INV-3)
export type EstadoRevision = 'borrador' | 'en_revision' | 'aprobado' | 'rechazado';

// Estado de generación (cola + worker — ADR-003)
export type EstadoGeneracion = 'encolado' | 'generando' | 'validado' | 'fallido';

/**
 * Norma regulatoria citable del sistema (Decreto 67, Ley 20.248, etc.).
 * 'cuerpo' es el texto canónico citable; se persiste en corpus_version.
 */
export interface Norma {
  readonly id: string;
  readonly corpusVersionId: string;
  readonly tipo: TipoNorma;
  readonly referencia: string; // p.ej. 'Decreto 67/2018 art. 18 lit. f'
  readonly titulo: string;
  readonly cuerpo: string;
  readonly vigenciaDesde: Date | null;
  readonly vigenciaHasta: Date | null; // null = vigente sin fecha de término
  readonly estadoVigencia: EstadoVigencia;
  readonly metadata: Record<string, unknown>;
}

/**
 * Objetivo de Aprendizaje del currículum nacional (Bases Curriculares MINEDUC).
 * Unidad citable del currículum; alinea ítems de prueba y clases.
 */
export interface ObjetivoAprendizaje {
  readonly id: string;
  readonly corpusVersionId: string;
  readonly codigo: string; // p.ej. 'MA01 OA 03' (citable)
  readonly asignatura: string;
  readonly nivel: string; // p.ej. '1° básico'
  readonly descripcion: string;
  readonly indicadores: string[];
  readonly vigenciaDesde: Date | null;
  readonly vigenciaHasta: Date | null;
}

/**
 * Documento generado por el sistema (prueba, clase, borrador PME, etc.).
 * Nace siempre en estado 'borrador' (INV-3).
 */
export interface DocumentoGenerado {
  readonly id: string;
  readonly establecimientoId: string;
  readonly tipo: string; // 'prueba' | 'clase' | 'reglamento_auditoria' | 'pme_fase_anual'
  readonly contenido: unknown;
  readonly citas: Cita[];
  readonly estadoRevision: EstadoRevision;
  readonly estadoGeneracion: EstadoGeneracion;
  readonly autorHumano: string | null;
  readonly resultadoGates: unknown | null;
  readonly createdAt: Date;
  readonly aprobadoAt: Date | null;
}

/**
 * Cita a una norma o OA incluida en un documento generado.
 * La presencia de una cita se verifica contra corpus_version (citationGate).
 */
export interface Cita {
  readonly normaId: string;
  readonly referencia: string; // copia de Norma.referencia (legible sin join)
  readonly extracto: string; // fragmento citable que respalda la afirmación
}
