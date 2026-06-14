// apps/worker/src/main.ts
// Worker de generación asíncrona (H-PA.8, ADR-003): composition root + loop de consumo de jobs.
// Es el ÚNICO lugar que conoce los adapters concretos (INV-5). La orquestación vive en
// ProcesarTrabajoCascadaUseCase (@faro/application), que depende solo de puertos.
//
// LLM: selección de proveedor vía crearLlm (RF-PA.14): claude-code si hay CLAUDE_CODE_OAUTH_TOKEN,
// anthropic-api si hay ANTHROPIC_API_KEY, si no samples (plomería gratis/determinista — plan §1.3).

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CascadaAulaUseCase,
  GenerarGuiaUseCase,
  GenerarPlanificacionUseCase,
  GenerarPptInfantilUseCase,
  GenerarPruebaFormativaUseCase,
  ProcesarTrabajoCascadaUseCase,
  ProcesarTrabajoGuiaUseCase,
  ProcesarTrabajoPlanificacionUseCase,
  ProcesarTrabajoPptInfantilUseCase,
  ProcesarTrabajoPruebaUseCase,
} from '@faro/application';
import type { ClockPort } from '@faro/domain';
import { crearLlm } from '@faro/infra-ai';
import { CatalogoRepositoryCorpus, PlantillaRepositoryCorpus } from '@faro/infra-corpus';
import {
  crearDb,
  DocumentoRepositoryDrizzle,
  JobRepositoryDrizzle,
  OaRepositoryDrizzle,
  PlanificacionAnualRepositoryDrizzle,
  UnidadDeTrabajoDrizzle,
} from '@faro/infra-db';
import { PptxExportAdapter } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';

const log = crearLoggerHijo('worker');

// Reloj de sistema (INV-1: el dominio recibe la fecha; aquí proveemos la real).
const relojSistema: ClockPort = { hoy: () => new Date() };

// Intervalo de sondeo cuando la cola está vacía; subir reduce carga, bajar reduce latencia.
const INTERVALO_VACIO_MS = Number(process.env['WORKER_POLL_MS'] ?? 2000);

/** Resuelve la raíz del monorepo (donde vive pnpm-workspace.yaml) con independencia del cwd. */
function raizRepo(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const padre = dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  return process.cwd();
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('worker: falta DATABASE_URL (configúrala en .env).');
  }
  const workerId = process.env['WORKER_ID'] ?? `worker-${process.pid}`;

  const { db, pool } = crearDb({ DATABASE_URL: databaseUrl });

  // Adapters concretos (composition root). LLM elegido por entorno (claude-code | anthropic-api | samples).
  // LIMITACIÓN demo: samples sirve UNA materia; el dir se resuelve por env (default: matemática 1º básico).
  const samplesDir =
    process.env['WORKER_SAMPLES_DIR'] ?? join(raizRepo(), 'samples', 'aula-matematica-1b');

  const { llm, modo } = crearLlm(
    {
      CLAUDE_CODE_OAUTH_TOKEN: process.env['CLAUDE_CODE_OAUTH_TOKEN'],
      ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
      samplesDir,
    },
    crearLoggerHijo('infra-ai'),
  );

  const oas = new OaRepositoryDrizzle(db);
  const useCase = new ProcesarTrabajoCascadaUseCase({
    // jobs top-level: tomarSiguiente/reintentar/marcarFallido corren fuera de la unidad de trabajo.
    jobs: new JobRepositoryDrizzle(db),
    planes: new PlanificacionAnualRepositoryDrizzle(db),
    oas,
    // uow: persiste los 4 documentos + 4 trazas + marcarHecho en UNA transacción (atomicidad).
    uow: new UnidadDeTrabajoDrizzle(db),
    export: new PptxExportAdapter(join(raizRepo(), 'generated'), crearLoggerHijo('infra-export')),
    cascada: new CascadaAulaUseCase(llm),
    clock: relojSistema,
  });

  // --- Cola de planificación híbrida (H-2.7), en paralelo a la cascada (no la toca) ---
  // Datos fijos: OA desde la DB (corpus_version publicada); plantillas y catálogos file-based.
  const corpusDir = join(raizRepo(), 'corpus');
  const catalogos = await new CatalogoRepositoryCorpus(corpusDir, crearLoggerHijo('infra-corpus')).catalogos();
  const generarPlanificacion = new GenerarPlanificacionUseCase({
    oas,
    plantillas: new PlantillaRepositoryCorpus(corpusDir, crearLoggerHijo('infra-corpus')),
    llm,
    catalogos,
  });
  const planificacionUseCase = new ProcesarTrabajoPlanificacionUseCase({
    jobs: new JobRepositoryDrizzle(db),
    generar: generarPlanificacion,
    catalogos,
    uow: new UnidadDeTrabajoDrizzle(db),
  });

  // --- Cola de prueba formativa (Fase 4), en paralelo a las otras dos (no las toca) ---
  // Genera la prueba desde la unidad ya planificada (su documento); el gate pedagógico corre dentro.
  const pruebaUseCase = new ProcesarTrabajoPruebaUseCase({
    jobs: new JobRepositoryDrizzle(db),
    documentos: new DocumentoRepositoryDrizzle(db),
    generar: new GenerarPruebaFormativaUseCase(llm),
    uow: new UnidadDeTrabajoDrizzle(db),
  });

  // --- Cola de PPT infantil (Fase 3), en paralelo a las otras tres (no las toca) ---
  // Genera el deck infantil desde la unidad ya planificada (su documento); el deck lo valida su schema
  // (sin gate determinista). El export .pptx es bajo demanda en la web, no aquí.
  const pptInfantilUseCase = new ProcesarTrabajoPptInfantilUseCase({
    jobs: new JobRepositoryDrizzle(db),
    documentos: new DocumentoRepositoryDrizzle(db),
    generar: new GenerarPptInfantilUseCase(llm),
    uow: new UnidadDeTrabajoDrizzle(db),
  });

  // --- Cola de guías del alumno (Tanda 1), en paralelo a las otras (no las toca) ---
  // La guía es standalone desde un OA: carga el OA del corpus publicado (vía oas), no de una unidad.
  // El export .docx es bajo demanda en la web, no aquí.
  const guiaUseCase = new ProcesarTrabajoGuiaUseCase({
    jobs: new JobRepositoryDrizzle(db),
    oas,
    generar: new GenerarGuiaUseCase(llm),
    uow: new UnidadDeTrabajoDrizzle(db),
  });

  let corriendo = true;
  const apagar = (senal: string): void => {
    if (!corriendo) return;
    corriendo = false;
    log.info({ senal }, 'worker: apagado solicitado, terminando el job en curso');
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));

  log.info({ workerId, modo, samplesDir }, 'worker: iniciado (H-PA.8)');

  // Loop principal: en CADA iteración intenta las cinco colas (cascada, planificación, prueba, PPT
  // infantil y guías) para que una cola con trabajo continuo no inanice a las otras; el backoff solo
  // aplica si TODAS están vacías.
  while (corriendo) {
    const r = await useCase.ejecutarSiguiente(workerId);
    switch (r.tipo) {
      case 'sin_trabajo':
        break;
      case 'hecho':
        log.info({ jobId: r.jobId, documentoRaizId: r.documentoRaizId }, 'worker: cascada hecha');
        break;
      case 'reintenta':
        log.warn({ jobId: r.jobId, error: r.error }, 'worker: cascada reencolada para reintento');
        break;
      case 'fallido':
        log.error({ jobId: r.jobId, error: r.error }, 'worker: cascada fallida (reintentos agotados)');
        break;
    }

    const rp = await planificacionUseCase.ejecutarSiguiente(workerId);
    switch (rp.tipo) {
      case 'sin_trabajo':
        break;
      case 'hecho':
        log.info({ jobId: rp.jobId, documentoId: rp.documentoId }, 'worker: planificación hecha');
        break;
      case 'reintenta':
        log.warn({ jobId: rp.jobId, error: rp.error }, 'worker: planificación reencolada para reintento');
        break;
      case 'fallido':
        log.error({ jobId: rp.jobId, error: rp.error }, 'worker: planificación fallida');
        break;
    }

    const rt = await pruebaUseCase.ejecutarSiguiente(workerId);
    switch (rt.tipo) {
      case 'sin_trabajo':
        break;
      case 'hecho':
        log.info({ jobId: rt.jobId, documentoId: rt.documentoId }, 'worker: prueba formativa hecha');
        break;
      case 'reintenta':
        log.warn({ jobId: rt.jobId, error: rt.error }, 'worker: prueba reencolada para reintento');
        break;
      case 'fallido':
        log.error({ jobId: rt.jobId, error: rt.error }, 'worker: prueba fallida');
        break;
    }

    const rpp = await pptInfantilUseCase.ejecutarSiguiente(workerId);
    switch (rpp.tipo) {
      case 'sin_trabajo':
        break;
      case 'hecho':
        log.info({ jobId: rpp.jobId, documentoId: rpp.documentoId }, 'worker: PPT infantil hecho');
        break;
      case 'reintenta':
        log.warn({ jobId: rpp.jobId, error: rpp.error }, 'worker: PPT infantil reencolado para reintento');
        break;
      case 'fallido':
        log.error({ jobId: rpp.jobId, error: rpp.error }, 'worker: PPT infantil fallido');
        break;
    }

    const rg = await guiaUseCase.ejecutarSiguiente(workerId);
    switch (rg.tipo) {
      case 'sin_trabajo':
        break;
      case 'hecho':
        log.info({ jobId: rg.jobId, documentoId: rg.documentoId }, 'worker: guía hecha');
        break;
      case 'reintenta':
        log.warn({ jobId: rg.jobId, error: rg.error }, 'worker: guía reencolada para reintento');
        break;
      case 'fallido':
        log.error({ jobId: rg.jobId, error: rg.error }, 'worker: guía fallida');
        break;
    }

    // Backoff fijo solo si las cinco colas quedaron vacías (no saturar la DB cuando no hay trabajo).
    if (
      r.tipo === 'sin_trabajo' &&
      rp.tipo === 'sin_trabajo' &&
      rt.tipo === 'sin_trabajo' &&
      rpp.tipo === 'sin_trabajo' &&
      rg.tipo === 'sin_trabajo'
    ) {
      await esperar(INTERVALO_VACIO_MS);
    }
  }

  // Shutdown limpio: cerrar el pool de conexiones.
  await pool.end();
  log.info('worker: pool cerrado, fin');
}

main().catch((e: unknown) => {
  log.error({ err: e instanceof Error ? e.message : String(e) }, 'worker: error fatal');
  process.exitCode = 1;
});
