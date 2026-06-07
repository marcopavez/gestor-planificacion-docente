// apps/worker/src/main.ts
// Worker de generación asíncrona (H-PA.8, ADR-003): composition root + loop de consumo de jobs.
// Es el ÚNICO lugar que conoce los adapters concretos (INV-5). La orquestación vive en
// ProcesarTrabajoCascadaUseCase (@faro/application), que depende solo de puertos.
//
// LLM: en esta fase se usa el adapter de samples (la plomería se prueba con samples — plan §1.3).
// La selección `samples | claude-code` queda como costura para H-PA.7 (no implementada aquí).

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CascadaAulaUseCase, ProcesarTrabajoCascadaUseCase } from '@faro/application';
import type { ClockPort } from '@faro/domain';
import { crearSamplesLlm } from '@faro/infra-ai';
import {
  crearDb,
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

  // Adapters concretos (composition root). LLM de samples: prueba la plomería sin API key.
  // LIMITACIÓN demo: samples sirve UNA materia; el dir se resuelve por env (default: matemática 1º básico).
  const samplesDir =
    process.env['WORKER_SAMPLES_DIR'] ?? join(raizRepo(), 'samples', 'aula-matematica-1b');

  const useCase = new ProcesarTrabajoCascadaUseCase({
    // jobs top-level: tomarSiguiente/reintentar/marcarFallido corren fuera de la unidad de trabajo.
    jobs: new JobRepositoryDrizzle(db),
    planes: new PlanificacionAnualRepositoryDrizzle(db),
    oas: new OaRepositoryDrizzle(db),
    // uow: persiste los 4 documentos + 4 trazas + marcarHecho en UNA transacción (atomicidad).
    uow: new UnidadDeTrabajoDrizzle(db),
    export: new PptxExportAdapter(join(raizRepo(), 'generated'), crearLoggerHijo('infra-export')),
    cascada: new CascadaAulaUseCase(crearSamplesLlm(samplesDir)),
    clock: relojSistema,
  });

  let corriendo = true;
  const apagar = (senal: string): void => {
    if (!corriendo) return;
    corriendo = false;
    log.info({ senal }, 'worker: apagado solicitado, terminando el job en curso');
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));

  log.info({ workerId, samplesDir }, 'worker: iniciado (H-PA.8)');

  // Loop principal: procesa jobs hasta recibir señal de apagado.
  while (corriendo) {
    const r = await useCase.ejecutarSiguiente(workerId);
    switch (r.tipo) {
      case 'sin_trabajo':
        // Cola vacía: backoff fijo para no saturar la DB.
        await esperar(INTERVALO_VACIO_MS);
        break;
      case 'hecho':
        log.info({ jobId: r.jobId, documentoRaizId: r.documentoRaizId }, 'worker: job hecho');
        break;
      case 'reintenta':
        log.warn({ jobId: r.jobId, error: r.error }, 'worker: job reencolado para reintento');
        break;
      case 'fallido':
        log.error({ jobId: r.jobId, error: r.error }, 'worker: job fallido (reintentos agotados)');
        break;
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
