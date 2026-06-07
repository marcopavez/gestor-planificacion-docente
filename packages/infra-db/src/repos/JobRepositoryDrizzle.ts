// packages/infra-db/src/repos/JobRepositoryDrizzle.ts
// Adapter Drizzle para JobRepository (RF-PA.3, ADR-003).
// La exclusión mutua de workers se garantiza con FOR UPDATE SKIP LOCKED en tomarSiguiente.
// El flujo es cascada-desde-unidad: el job referencia la unidad_planificada, no un documento.

import { eq, sql } from 'drizzle-orm';
import type { JobRepository, TrabajoCascada } from '@faro/domain';
import type { DbOTx } from '../db.js';
import { jobGeneracion } from '../schema/index.js';

export class JobRepositoryDrizzle implements JobRepository {
  // DbOTx: marcarHecho/reintentar/marcarFallido corren dentro de la unidad de trabajo (tx);
  // tomarSiguiente abre su propia tx (SKIP LOCKED) y por eso exige la instancia top-level.
  constructor(private readonly db: DbOTx) {}

  async encolarCascadaUnidad(unidadPlanificadaId: string): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        unidadPlanificadaId,
        tipoTrabajo: 'cascada_unidad',
        estado: 'pendiente',
      })
      .returning({ id: jobGeneracion.id });

    if (!row) throw new Error('No se pudo encolar el job de cascada');
    return row.id;
  }

  /**
   * Toma el siguiente job pendiente con exclusión mutua (ADR-003).
   * FOR UPDATE SKIP LOCKED evita bloqueos entre workers concurrentes.
   * Drizzle no soporta FOR UPDATE SKIP LOCKED directamente → sql`` tag.
   */
  async tomarSiguiente(workerId: string): Promise<TrabajoCascada | null> {
    // Transacción necesaria: el SELECT y el UPDATE deben ser atómicos.
    // tomarSiguiente nunca se llama desde la unidad de trabajo (abre su propia tx SKIP LOCKED),
    // así que la instancia inyectada es la top-level con .transaction disponible.
    return this.db.transaction(async (tx) => {
      // Drizzle no tiene API de primer nivel para FOR UPDATE SKIP LOCKED;
      // usamos sql`` para la cláusula de bloqueo (aceptado por el proyecto per ADR-003).
      const rows = await tx.execute<{ id: string; unidad_planificada_id: string }>(
        sql`SELECT id, unidad_planificada_id FROM job_generacion
            WHERE estado = 'pendiente'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      // pglite / pg devuelven las filas en .rows
      const row = (
        rows as unknown as { rows: Array<{ id: string; unidad_planificada_id: string }> }
      ).rows[0];
      if (!row) return null;

      // Marcamos en_proceso e incrementamos intentos en el mismo UPDATE para contar este intento.
      const [actualizado] = await tx
        .update(jobGeneracion)
        .set({
          estado: 'en_proceso',
          lockedBy: workerId,
          lockedAt: new Date(),
          intentos: sql`${jobGeneracion.intentos} + 1`,
        })
        .where(eq(jobGeneracion.id, row.id))
        .returning({ intentos: jobGeneracion.intentos });

      if (!actualizado) throw new Error('No se pudo bloquear el job tomado');

      return {
        id: row.id,
        unidadPlanificadaId: row.unidad_planificada_id,
        intentos: actualizado.intentos,
      };
    });
  }

  async marcarHecho(id: string, documentoRaizId: string): Promise<void> {
    // Libera el lock al cerrar el job para no dejar locked_by/locked_at colgados (diagnóstico limpio).
    await this.db
      .update(jobGeneracion)
      .set({ estado: 'hecho', documentoId: documentoRaizId, error: null, lockedBy: null, lockedAt: null })
      .where(eq(jobGeneracion.id, id));
  }

  async reintentar(id: string, error: string): Promise<void> {
    // Vuelve a 'pendiente' para que otro intento lo retome; conserva el último error como diagnóstico.
    // Libera el lock: otro worker debe poder tomarlo en el próximo tomarSiguiente.
    await this.db
      .update(jobGeneracion)
      .set({ estado: 'pendiente', error, lockedBy: null, lockedAt: null })
      .where(eq(jobGeneracion.id, id));
  }

  async marcarFallido(id: string, error: string): Promise<void> {
    await this.db
      .update(jobGeneracion)
      .set({ estado: 'fallido', error })
      .where(eq(jobGeneracion.id, id));
  }
}
