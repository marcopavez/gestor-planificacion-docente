// packages/infra-db/src/repos/JobRepositoryDrizzle.ts
// Adapter Drizzle para JobRepository (RF-PA.3, ADR-003).
// La exclusión mutua de workers se garantiza con FOR UPDATE SKIP LOCKED en tomarSiguiente.

import { eq, sql } from 'drizzle-orm';
import type { JobRepository } from '@faro/domain';
import type { DrizzleDb } from '../db.js';
import { jobGeneracion } from '../schema/index.js';

export class JobRepositoryDrizzle implements JobRepository {
  constructor(private readonly db: DrizzleDb) {}

  async encolar(documentoId: string): Promise<void> {
    await this.db.insert(jobGeneracion).values({
      documentoId,
      tipoTrabajo: 'cascada_unidad',
      estado: 'pendiente',
    });
  }

  /**
   * Toma el siguiente job pendiente con exclusión mutua (ADR-003).
   * FOR UPDATE SKIP LOCKED evita bloqueos entre workers concurrentes.
   * Drizzle no soporta FOR UPDATE SKIP LOCKED directamente → sql`` tag.
   */
  async tomarSiguiente(workerId: string): Promise<{ id: string; documentoId: string } | null> {
    // Transacción necesaria: el SELECT y el UPDATE deben ser atómicos.
    return this.db.transaction(async (tx) => {
      // Drizzle no tiene API de primer nivel para FOR UPDATE SKIP LOCKED;
      // usamos sql`` para la cláusula de bloqueo (aceptado por el proyecto per ADR-003).
      const rows = await tx.execute<{ id: string; documento_id: string }>(
        sql`SELECT id, documento_id FROM job_generacion
            WHERE estado = 'pendiente'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      // pglite / pg devuelven las filas en .rows
      const row = (rows as unknown as { rows: Array<{ id: string; documento_id: string }> }).rows[0];
      if (!row) return null;

      await tx
        .update(jobGeneracion)
        .set({
          estado: 'en_proceso',
          lockedBy: workerId,
          lockedAt: new Date(),
          intentos: sql`${jobGeneracion.intentos} + 1`,
        })
        .where(eq(jobGeneracion.id, row.id));

      return { id: row.id, documentoId: row.documento_id };
    });
  }

  async marcar(id: string, estado: 'hecho' | 'fallido'): Promise<void> {
    await this.db
      .update(jobGeneracion)
      .set({ estado })
      .where(eq(jobGeneracion.id, id));
  }
}
