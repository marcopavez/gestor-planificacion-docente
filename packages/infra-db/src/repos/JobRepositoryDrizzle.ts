// packages/infra-db/src/repos/JobRepositoryDrizzle.ts
// Adapter Drizzle para JobRepository (RF-PA.3, ADR-003).
// La exclusión mutua de workers se garantiza con FOR UPDATE SKIP LOCKED en tomarSiguiente.
// El flujo es cascada-desde-unidad: el job referencia la unidad_planificada, no un documento.

import { eq, sql } from 'drizzle-orm';
import type {
  EstadoJob,
  JobRepository,
  PayloadFicha,
  PayloadGuia,
  PayloadMaterialColorear,
  PayloadPlanificacion,
  PayloadPptInfantil,
  PayloadPrueba,
  TrabajoCascada,
  TrabajoFicha,
  TrabajoGuia,
  TrabajoMaterialColorear,
  TrabajoPlanificacion,
  TrabajoPptInfantil,
  TrabajoPrueba,
} from '@faro/domain';
import {
  SchemaPayloadFicha,
  SchemaPayloadGuia,
  SchemaPayloadMaterialColorear,
  SchemaPayloadPlanificacion,
  SchemaPayloadPptInfantil,
  SchemaPayloadPrueba,
} from '@faro/domain';
import type { DbOTx } from '../db.js';
import { jobGeneracion } from '../schema/index.js';

// Estados posibles en la columna; estrechamos el text de DB al union del puerto sin asumir 'any'.
const ESTADOS_JOB = ['pendiente', 'en_proceso', 'hecho', 'fallido'] as const;
type EstadoJobValor = (typeof ESTADOS_JOB)[number];
function esEstadoJob(v: string): v is EstadoJobValor {
  return (ESTADOS_JOB as readonly string[]).includes(v);
}

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

  async encolarPlanificacion(payload: PayloadPlanificacion): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        tipoTrabajo: 'planificacion',
        estado: 'pendiente',
        // El payload (petición del docente) viaja en jsonb; el worker lo valida al tomarlo.
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning({ id: jobGeneracion.id });

    if (!row) throw new Error('No se pudo encolar el job de planificación');
    return row.id;
  }

  async encolarPrueba(payload: PayloadPrueba): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        tipoTrabajo: 'prueba_formativa',
        estado: 'pendiente',
        // Referencia al documento de planificación; el worker lo carga y valida al tomar el job.
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning({ id: jobGeneracion.id });

    if (!row) throw new Error('No se pudo encolar el job de prueba');
    return row.id;
  }

  async encolarPptInfantil(payload: PayloadPptInfantil): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        tipoTrabajo: 'ppt_infantil',
        estado: 'pendiente',
        // Referencia al documento de planificación; el worker lo carga y valida al tomar el job.
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning({ id: jobGeneracion.id });

    if (!row) throw new Error('No se pudo encolar el job de PPT infantil');
    return row.id;
  }

  /**
   * Estado del job para el polling de la web (H-PA.9). Solo lectura; null si el id no existe.
   * El union de estado se valida con esEstadoJob para no degradar el tipo a `string`.
   */
  async obtenerEstado(jobId: string): Promise<EstadoJob | null> {
    const [row] = await this.db
      .select({
        id: jobGeneracion.id,
        estado: jobGeneracion.estado,
        documentoId: jobGeneracion.documentoId,
        intentos: jobGeneracion.intentos,
        error: jobGeneracion.error,
      })
      .from(jobGeneracion)
      .where(eq(jobGeneracion.id, jobId));

    if (!row) return null;
    if (!esEstadoJob(row.estado)) {
      // Defensa: un estado fuera del union indica corrupción de datos, no un caso normal.
      throw new Error(`Estado de job desconocido en DB: '${row.estado}' (job ${jobId})`);
    }

    return {
      id: row.id,
      estado: row.estado,
      documentoId: row.documentoId,
      intentos: row.intentos,
      error: row.error,
    };
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
            WHERE estado = 'pendiente' AND tipo_trabajo = 'cascada_unidad'
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

  /** Análogo a tomarSiguiente para la cola 'planificacion' (H-2.7): valida el payload jsonb al tomarlo. */
  async tomarSiguientePlanificacion(workerId: string): Promise<TrabajoPlanificacion | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; payload: unknown }>(
        sql`SELECT id, payload FROM job_generacion
            WHERE estado = 'pendiente' AND tipo_trabajo = 'planificacion'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      const row = (rows as unknown as { rows: Array<{ id: string; payload: unknown }> }).rows[0];
      if (!row) return null;

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

      if (!actualizado) throw new Error('No se pudo bloquear el job de planificación tomado');

      // El payload se validó al encolar; lo revalidamos aquí (defensa: jsonb es opaco).
      const payload = SchemaPayloadPlanificacion.parse(row.payload);
      return { id: row.id, payload, intentos: actualizado.intentos };
    });
  }

  /** Análogo a tomarSiguientePlanificacion para la cola 'prueba_formativa' (Fase 4). */
  async tomarSiguientePrueba(workerId: string): Promise<TrabajoPrueba | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; payload: unknown }>(
        sql`SELECT id, payload FROM job_generacion
            WHERE estado = 'pendiente' AND tipo_trabajo = 'prueba_formativa'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      const row = (rows as unknown as { rows: Array<{ id: string; payload: unknown }> }).rows[0];
      if (!row) return null;

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

      if (!actualizado) throw new Error('No se pudo bloquear el job de prueba tomado');

      const payload = SchemaPayloadPrueba.parse(row.payload);
      return { id: row.id, payload, intentos: actualizado.intentos };
    });
  }

  /** Análogo a tomarSiguientePrueba para la cola 'ppt_infantil' (Fase 3). */
  async tomarSiguientePptInfantil(workerId: string): Promise<TrabajoPptInfantil | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; payload: unknown }>(
        sql`SELECT id, payload FROM job_generacion
            WHERE estado = 'pendiente' AND tipo_trabajo = 'ppt_infantil'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      const row = (rows as unknown as { rows: Array<{ id: string; payload: unknown }> }).rows[0];
      if (!row) return null;

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

      if (!actualizado) throw new Error('No se pudo bloquear el job de PPT infantil tomado');

      const payload = SchemaPayloadPptInfantil.parse(row.payload);
      return { id: row.id, payload, intentos: actualizado.intentos };
    });
  }

  async encolarGuia(payload: PayloadGuia): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        tipoTrabajo: 'guia',
        estado: 'pendiente',
        // Payload OA + conocimiento; el worker resuelve el OA completo vía OaRepository al tomarlo.
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning({ id: jobGeneracion.id });

    if (!row) throw new Error('No se pudo encolar el job de guía');
    return row.id;
  }

  /** Análogo a tomarSiguientePrueba para la cola 'guia' (Tanda 1). */
  async tomarSiguienteGuia(workerId: string): Promise<TrabajoGuia | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; payload: unknown }>(
        sql`SELECT id, payload FROM job_generacion
            WHERE estado = 'pendiente' AND tipo_trabajo = 'guia'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      const row = (rows as unknown as { rows: Array<{ id: string; payload: unknown }> }).rows[0];
      if (!row) return null;

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

      if (!actualizado) throw new Error('No se pudo bloquear el job de guía tomado');

      const payload = SchemaPayloadGuia.parse(row.payload);
      return { id: row.id, payload, intentos: actualizado.intentos };
    });
  }

  async encolarMaterialColorear(payload: PayloadMaterialColorear): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        tipoTrabajo: 'material_colorear',
        estado: 'pendiente',
        // Payload OA + contexto del material; el worker genera el line-art al tomarlo.
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning({ id: jobGeneracion.id });

    if (!row) throw new Error('No se pudo encolar el job de material para colorear');
    return row.id;
  }

  /** Análogo a tomarSiguienteGuia para la cola 'material_colorear'. */
  async tomarSiguienteMaterialColorear(workerId: string): Promise<TrabajoMaterialColorear | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; payload: unknown }>(
        sql`SELECT id, payload FROM job_generacion
            WHERE estado = 'pendiente' AND tipo_trabajo = 'material_colorear'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      const row = (rows as unknown as { rows: Array<{ id: string; payload: unknown }> }).rows[0];
      if (!row) return null;

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

      if (!actualizado) throw new Error('No se pudo bloquear el job de material para colorear tomado');

      const payload = SchemaPayloadMaterialColorear.parse(row.payload);
      return { id: row.id, payload, intentos: actualizado.intentos };
    });
  }

  async encolarFicha(payload: PayloadFicha): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        tipoTrabajo: 'ficha_colorear',
        estado: 'pendiente',
        // Payload OA + contexto de la ficha; el worker genera los ejercicios al tomarlo.
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning({ id: jobGeneracion.id });

    if (!row) throw new Error('No se pudo encolar el job de ficha para colorear');
    return row.id;
  }

  /** Análogo a tomarSiguienteMaterialColorear para la cola 'ficha_colorear' (Plan 2). */
  async tomarSiguienteFicha(workerId: string): Promise<TrabajoFicha | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; payload: unknown }>(
        sql`SELECT id, payload FROM job_generacion
            WHERE estado = 'pendiente' AND tipo_trabajo = 'ficha_colorear'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      const row = (rows as unknown as { rows: Array<{ id: string; payload: unknown }> }).rows[0];
      if (!row) return null;

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

      if (!actualizado) throw new Error('No se pudo bloquear el job de ficha para colorear tomado');

      const payload = SchemaPayloadFicha.parse(row.payload); // revalida el jsonb opaco
      return { id: row.id, payload, intentos: actualizado.intentos };
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
