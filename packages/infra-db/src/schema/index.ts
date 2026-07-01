// packages/infra-db/src/schema/index.ts
// Esquema Drizzle para Postgres (SIN pgvector — se añade en M3 / RAG).
// INV-3: documento_generado nace en 'borrador' y el CHECK chk_aprobado_requiere_humano
//         impide marcar 'aprobado' sin autor_humano (también reforzado en la migración SQL).
// INV-4: FKs a corpus_version en objetivo_aprendizaje, documento_generado y traza_ia;
//         unique(corpus_version_id, codigo) en objetivo_aprendizaje garantiza idempotencia
//         de ingesta (RF-PA.2).

import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  jsonb,
  timestamp,
  check,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// corpus_version — inmutable al publicar (INV-4, ADR-004)
// ---------------------------------------------------------------------------
export const corpusVersion = pgTable(
  'corpus_version',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    etiqueta: text('etiqueta').notNull(),
    // 'borrador' permite edición; 'publicada' congela el corpus; 'retirada' deshabilita uso.
    estado: text('estado').notNull().default('borrador'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publicadaAt: timestamp('publicada_at', { withTimezone: true }),
  },
  // La etiqueta es la clave de idempotencia de ingesta (RF-PA.2): re-correr con la misma etiqueta
  // reutiliza la versión existente; UNIQUE lo garantiza a nivel de DB.
  (t) => [unique('corpus_version_etiqueta_unique').on(t.etiqueta)],
);

// ---------------------------------------------------------------------------
// objetivo_aprendizaje — filas del corpus bajo una corpus_version
// unique(corpus_version_id, codigo) permite ingesta idempotente (RF-PA.2)
// ---------------------------------------------------------------------------
export const objetivoAprendizaje = pgTable(
  'objetivo_aprendizaje',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    corpusVersionId: uuid('corpus_version_id')
      .notNull()
      .references(() => corpusVersion.id),
    codigo: text('codigo').notNull(),
    asignatura: text('asignatura').notNull(),
    nivel: text('nivel').notNull(),
    descripcion: text('descripcion').notNull(),
    eje: text('eje'),
    // basal | complementario | oat (Objetivos de Aprendizaje Transversales)
    tipo: text('tipo'),
    // Indicadores de evaluación según Programas de Estudio (jsonb para flexibilidad por materia)
    indicadores: jsonb('indicadores'),
    vigenciaDesde: date('vigencia_desde'),
    // null = vigente actualmente
    vigenciaHasta: date('vigencia_hasta'),
  },
  (t) => [unique('oa_corpus_codigo_unique').on(t.corpusVersionId, t.codigo)],
);

// ---------------------------------------------------------------------------
// usuario — espejo local del usuario de Supabase Auth + estado de suscripción.
// id = UUID de Supabase (claim sub); NO se genera localmente (por eso sin defaultRandom).
// ---------------------------------------------------------------------------
export const usuario = pgTable('usuario', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  // trial | activo | vencido | cancelado — gobierna el gate de generación.
  plan: text('plan').notNull().default('trial'),
  // Contador de generaciones del período (trial: cuenta contra el límite gratis; activo: tope blando mensual).
  generacionesUsadas: integer('generaciones_usadas').notNull().default(0),
  periodoInicio: timestamp('periodo_inicio', { withTimezone: true }),
  // Espejo del preapproval de Mercado Pago (id + estado crudo) para reconciliar con el webhook.
  mpPreapprovalId: text('mp_preapproval_id'),
  suscripcionEstado: text('suscripcion_estado'),
  // Fin del período pagado; el gate compara contra la fecha actual.
  periodoFin: timestamp('periodo_fin', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('usuario_email_unique').on(t.email)]);

// ---------------------------------------------------------------------------
// planificacion_anual — secuencia anual definida por el docente (input humano)
// ---------------------------------------------------------------------------
export const planificacionAnual = pgTable('planificacion_anual', {
  id: uuid('id').defaultRandom().primaryKey(),
  establecimiento: text('establecimiento').notNull(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuario.id),
  asignatura: text('asignatura').notNull(),
  nivel: text('nivel').notNull(),
  anio: integer('anio').notNull(),
  corpusVersionId: uuid('corpus_version_id')
    .notNull()
    .references(() => corpusVersion.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// unidad_planificada — una unidad dentro de una planificacion_anual
// oa_codigos es text[] porque los OA se referencian por código (corpus_version fija el contexto)
// inicio/fin y semanas son opcionales (P1: ninguno es obligatorio — docente puede usar ambos o ninguno)
// ---------------------------------------------------------------------------
export const unidadPlanificada = pgTable('unidad_planificada', {
  id: uuid('id').defaultRandom().primaryKey(),
  planificacionAnualId: uuid('planificacion_anual_id')
    .notNull()
    .references(() => planificacionAnual.id),
  orden: integer('orden').notNull(),
  titulo: text('titulo').notNull(),
  // Almacenados como text[] nativo de Postgres (no jsonb) para consultas simples con @> y ANY()
  oaCodigos: text('oa_codigos').array().notNull().default(sql`ARRAY[]::text[]`),
  inicio: date('inicio'),
  fin: date('fin'),
  semanas: integer('semanas'),
});

// ---------------------------------------------------------------------------
// documento_generado — artefacto producido por la cascada (Unidad/Clase/Prueba/Deck)
// INV-3: estado_revision DEFAULT 'borrador'; CHECK impide 'aprobado' sin autor_humano.
// origen_id self-ref para trazar la cascada (clase.origen_id = unidad generada, etc.)
// ---------------------------------------------------------------------------
export const documentoGenerado = pgTable('documento_generado', {
  id: uuid('id').defaultRandom().primaryKey(),
  // planificacion_unidad | planificacion_clase | prueba | clase_deck
  tipo: text('tipo').notNull(),
  establecimiento: text('establecimiento').notNull(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuario.id),
  corpusVersionId: uuid('corpus_version_id')
    .notNull()
    .references(() => corpusVersion.id),
  // FK self-referencial declarada en extraConfig (ver abajo) para evitar la referencia circular de TS.
  // Semántica: clase.origen_id = id de la planificacion_unidad que la originó (trazabilidad cascada).
  origenId: uuid('origen_id'),
  unidadPlanificadaId: uuid('unidad_planificada_id').references(() => unidadPlanificada.id),
  // HIL: la revisión comienza siempre en borrador (DEFAULT forzado por DB)
  estadoRevision: text('estado_revision').notNull().default('borrador'),
  // Estado técnico del trabajo de generación
  estadoGeneracion: text('estado_generacion').notNull().default('pendiente'),
  // Contenido generado (JSON arbitrario según el tipo de artefacto)
  payload: jsonb('payload'),
  // Resultado de los gates deterministas (planificacionGate, pedagogicalGate, citationGate)
  resultadoGates: jsonb('resultado_gates'),
  // Registrado por la superficie de revisión al aprobar (RF-PA.12)
  autorHumano: text('autor_humano'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
},
// INV-3: el CHECK garantiza que ninguna ruta de código pueda aprobar sin autor_humano,
// incluso si se salta la lógica de aplicación.
// La FK self-referencial se declara aquí (tabla extra config) para evitar la referencia circular de TS.
(t) => [
  check(
    'chk_aprobado_requiere_humano',
    sql`${t.estadoRevision} <> 'aprobado' OR ${t.autorHumano} IS NOT NULL`,
  ),
  foreignKey({
    columns: [t.origenId],
    foreignColumns: [t.id],
    name: 'documento_generado_origen_id_fk',
  }),
]);

// ---------------------------------------------------------------------------
// traza_ia — registro de auditoría por llamada al LLM (INV-4, Art. 8 bis)
// corpus_version_id congela la versión exacta del corpus vista en cada generación.
// ---------------------------------------------------------------------------
export const trazaIa = pgTable('traza_ia', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentoId: uuid('documento_id')
    .notNull()
    .references(() => documentoGenerado.id),
  corpusVersionId: uuid('corpus_version_id')
    .notNull()
    .references(() => corpusVersion.id),
  // Identificador del modelo usado (p. ej. 'claude-sonnet-4-6', 'samples/fake')
  modelo: text('modelo').notNull(),
  // Identificador de la rama de lógica tomada (para reproducibilidad y auditoría)
  rutaDecision: text('ruta_decision'),
  // Tokens de entrada/salida (jsonb para poder añadir campos sin migración)
  usage: jsonb('usage'),
  // Resultado de los gates serializado (para auditoría sin tener que releer documento_generado)
  gates: jsonb('gates'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// job_generacion — cola de trabajos asíncrona (ADR-003)
// SELECT … FOR UPDATE SKIP LOCKED garantiza exclusión mutua sin coordinador externo.
// ---------------------------------------------------------------------------
export const jobGeneracion = pgTable('job_generacion', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Nulos hasta que el worker crea los documentos (puede ser null en el encolado inicial)
  documentoId: uuid('documento_id').references(() => documentoGenerado.id),
  unidadPlanificadaId: uuid('unidad_planificada_id').references(() => unidadPlanificada.id),
  // 'cascada_unidad' es el único tipo de trabajo en M0 Aula
  tipoTrabajo: text('tipo_trabajo').notNull(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuario.id),
  // pendiente | en_proceso | hecho | fallido
  estado: text('estado').notNull().default('pendiente'),
  intentos: integer('intentos').notNull().default(0),
  // Identificador del worker que tomó el job (para diagnóstico de bloqueos)
  lockedBy: text('locked_by'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  // Input del trabajo serializado (ContextoCascada, parámetros de generación, etc.)
  payload: jsonb('payload'),
  // Mensaje de error del último intento fallido
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Re-exports para uso externo sin tener que conocer la ruta interna
// ---------------------------------------------------------------------------
export type CorpusVersion = typeof corpusVersion.$inferSelect;
export type NuevaCorpusVersion = typeof corpusVersion.$inferInsert;

export type ObjetivoAprendizaje = typeof objetivoAprendizaje.$inferSelect;
export type NuevoObjetivoAprendizaje = typeof objetivoAprendizaje.$inferInsert;

export type PlanificacionAnualRow = typeof planificacionAnual.$inferSelect;
export type NuevaPlanificacionAnualRow = typeof planificacionAnual.$inferInsert;

export type UnidadPlanificadaRow = typeof unidadPlanificada.$inferSelect;
export type NuevaUnidadPlanificadaRow = typeof unidadPlanificada.$inferInsert;

export type DocumentoGenerado = typeof documentoGenerado.$inferSelect;
export type NuevoDocumentoGenerado = typeof documentoGenerado.$inferInsert;

export type TrazaIa = typeof trazaIa.$inferSelect;
export type NuevaTrazaIa = typeof trazaIa.$inferInsert;

export type JobGeneracion = typeof jobGeneracion.$inferSelect;
export type NuevoJobGeneracion = typeof jobGeneracion.$inferInsert;

export type Usuario = typeof usuario.$inferSelect;
export type NuevoUsuario = typeof usuario.$inferInsert;
