// packages/infra-db/src/repos/UnidadDeTrabajoDrizzle.ts
// Adapter Drizzle para UnidadDeTrabajo (atomicidad de la persistencia de la cascada — FIX H-PA.8).
// INV-5: implementa el puerto de @faro/domain; la transacción es un detalle de infra (Drizzle/pg).
// Si fn lanza, db.transaction revierte TODAS las escrituras → el reintento del job parte limpio.

import type { ReposTransaccion, UnidadDeTrabajo } from '@faro/domain';
import type { DrizzleDb } from '../db.js';
import { DocumentoRepositoryDrizzle } from './DocumentoRepositoryDrizzle.js';
import { TrazaRepositoryDrizzle } from './TrazaRepositoryDrizzle.js';
import { JobRepositoryDrizzle } from './JobRepositoryDrizzle.js';

export class UnidadDeTrabajoDrizzle implements UnidadDeTrabajo {
  constructor(private readonly db: DrizzleDb) {}

  async enTransaccion<T>(fn: (repos: ReposTransaccion) => Promise<T>): Promise<T> {
    // tx se inyecta a cada repo: todas las escrituras de fn comparten la misma transacción.
    return this.db.transaction(async (tx) =>
      fn({
        documentos: new DocumentoRepositoryDrizzle(tx),
        trazas: new TrazaRepositoryDrizzle(tx),
        jobs: new JobRepositoryDrizzle(tx),
      }),
    );
  }
}
