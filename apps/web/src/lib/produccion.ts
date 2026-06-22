// apps/web/src/lib/produccion.ts
// Composition root de PRODUCCIÓN del flujo asíncrono de Aula (H-PA.9).
// ÚNICO módulo de la web que importa @faro/infra-db (INV-5): los route handlers consumen
// use cases / puertos, nunca Drizzle crudo.
//
// La web es un proceso de larga vida: NO cierra el pool. Cacheamos { db, pool } en un singleton
// de módulo (globalThis) para no fugar conexiones de pg.Pool en el hot-reload de Next (cada
// recarga re-evalúa el módulo; sin caché, abriría un Pool nuevo cada vez).
//
// No usamos cargarEnv() de @faro/config porque exige ANTHROPIC_API_KEY (la generación corre en el
// worker, no en la web). Validamos SOLO DATABASE_URL localmente, como apps/ingest/src/main.ts.

import { join } from 'node:path';
import { z } from 'zod';
import {
  CrearPlanificacionAnualUseCase,
  ListarPlanificacionAnualUseCase,
  RevisarDocumentoUseCase,
} from '@faro/application';
import type { ClockPort } from '@faro/domain';
import { CatalogoRepositoryCorpus, PlantillaRepositoryCorpus } from '@faro/infra-corpus';
import {
  DocxExportAdapter,
  GuiaExportAdapter,
  PdfExportAdapter,
  PptxExportAdapter,
  PruebaExportAdapter,
} from '@faro/infra-export';
import {
  crearDb,
  CorpusVersionRepositoryDrizzle,
  DocumentoRepositoryDrizzle,
  JobRepositoryDrizzle,
  OaRepositoryDrizzle,
  PlanificacionAnualRepositoryDrizzle,
} from '@faro/infra-db';
import { crearLoggerHijo } from '@faro/observability';
import { raizRepo } from './raiz';

// Tipo de la conexión cacheada (la inferimos de crearDb para no asumir su forma).
type Conexion = ReturnType<typeof crearDb>;

// Clave del singleton en globalThis: sobrevive al hot-reload de Next (que re-evalúa el módulo).
const CLAVE = Symbol.for('faro.web.produccion.db');
type GlobalConCache = typeof globalThis & { [CLAVE]?: Conexion };

const EnvWebSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida de Postgres'),
});

/** Crea o reutiliza la conexión Drizzle. El pool NO se cierra (proceso de larga vida). */
function conexion(): Conexion {
  const g = globalThis as GlobalConCache;
  if (g[CLAVE] !== undefined) return g[CLAVE];

  const parsed = EnvWebSchema.safeParse(process.env);
  if (!parsed.success) {
    const errores = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración de la web inválida: ${errores}`);
  }

  const conn = crearDb({ DATABASE_URL: parsed.data.DATABASE_URL });
  g[CLAVE] = conn;
  return conn;
}

// Reloj de sistema (INV-1: el dominio recibe la fecha; aquí proveemos la real).
const relojSistema: ClockPort = { hoy: () => new Date() };

/**
 * Factoría de adapters + use cases para los route handlers.
 * Devuelve puertos (no Drizzle) para que los handlers respeten INV-5.
 */
export function produccion() {
  const { db, pool } = conexion();

  const planes = new PlanificacionAnualRepositoryDrizzle(db);
  const oas = new OaRepositoryDrizzle(db);
  const corpus = new CorpusVersionRepositoryDrizzle(db);
  const documentos = new DocumentoRepositoryDrizzle(db);
  const jobs = new JobRepositoryDrizzle(db);

  // Adapters file-based (plantillas/catálogos) + export (.docx/.pdf) para el flujo de planificación
  // (H-2.7). Las plantillas/catálogos son config de archivo; el export es bajo demanda en la web.
  const corpusDir = join(raizRepo(), 'corpus');
  const dirExport = join(raizRepo(), 'generated');
  const logExport = crearLoggerHijo('infra-export');
  const plantillas = new PlantillaRepositoryCorpus(corpusDir, crearLoggerHijo('infra-corpus'));
  const catalogoRepo = new CatalogoRepositoryCorpus(corpusDir, crearLoggerHijo('infra-corpus'));

  return {
    // Repositorios (lectura / encolado) — los handlers leen puertos, no Drizzle.
    planes,
    documentos,
    jobs,
    plantillas,
    catalogoRepo,
    // Export bajo demanda de la planificación (.docx / .pdf vía LibreOffice).
    docxExport: new DocxExportAdapter(dirExport, logExport),
    pdfExport: new PdfExportAdapter(dirExport, logExport),
    // Export bajo demanda de la prueba formativa (.docx alumno/pauta; .pdf vía LibreOffice) — Fase 4.
    pruebaExport: new PruebaExportAdapter(dirExport, logExport),
    // Export bajo demanda de la guía del alumno (.docx/.pdf vía LibreOffice) — Tanda 1.
    guiaExport: new GuiaExportAdapter(dirExport, logExport),
    // Export bajo demanda del PPT infantil (.pptx; el deck es autocontenido) — Fase 3.
    pptxExport: new PptxExportAdapter(dirExport, logExport, join(raizRepo(), 'packages/infra-export/assets/imagenes')),
    // Use cases (escritura con gate) — encapsulan la lógica de dominio.
    crearPlan: new CrearPlanificacionAnualUseCase(planes, oas, corpus, relojSistema),
    listarPlanes: new ListarPlanificacionAnualUseCase(planes),
    // Revisión HIL (H-PA.10): toda transición de estado pasa por la máquina del dominio.
    revisar: new RevisarDocumentoUseCase(documentos),
    // Pool expuesto solo para el health check (SELECT 1); la web NO lo cierra.
    pool,
  };
}
