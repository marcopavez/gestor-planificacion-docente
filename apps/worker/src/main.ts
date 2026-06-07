// apps/worker/src/main.ts
// Punto de entrada del worker de generación asíncrona — ADR-003.
// La lógica de consumo de jobs (FOR UPDATE SKIP LOCKED) se implementa en H-0.8.
// Este esqueleto prueba el cableado de dependencias (@faro/application, @faro/observability).

import { GenerarPruebaUseCase } from '@faro/application';
import { crearLoggerHijo } from '@faro/observability';

const log = crearLoggerHijo('worker');

// Verificar que el import de application funciona (cableado de workspace).
// Se referencia el nombre para que el import no sea eliminado por tree-shaking,
// pero sin instanciar (la composition root real va en H-0.8).
void GenerarPruebaUseCase; // confirma que el import funciona; se usa en H-0.8

log.info({ version: '0.0.1-fase0-skeleton' }, 'Worker Faro iniciado (esqueleto H-0.1)');

// TODO H-0.8: implementar el loop de consumo de jobs:
// while (running) {
//   const job = await jobs.tomarSiguiente(workerId);  // FOR UPDATE SKIP LOCKED
//   if (!job) { await esperar(intervalo); continue; }
//   try { await generarPrueba.ejecutar(job); await jobs.marcar(job.id, 'hecho'); }
//   catch (e) { log.error(e, 'job fallido'); await jobs.marcar(job.id, 'fallido'); }
// }
