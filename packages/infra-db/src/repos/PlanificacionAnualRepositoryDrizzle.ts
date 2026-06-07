// packages/infra-db/src/repos/PlanificacionAnualRepositoryDrizzle.ts
// Adapter Drizzle para PlanificacionAnualRepository (RF-PA.3, RF-PA.4, INV-4).
// guardar/obtener/listar son transaccionales: cabecera + unidades en una sola transacción.

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type {
  PlanificacionAnual,
  PlanificacionAnualGuardada,
  PlanificacionAnualRepository,
  UnidadPlanificada,
} from '@faro/domain';
import type { DrizzleDb } from '../db.js';
import {
  planificacionAnual,
  unidadPlanificada,
} from '../schema/index.js';

type PlanificacionRow = typeof planificacionAnual.$inferSelect;
type UnidadRow = typeof unidadPlanificada.$inferSelect;

function unidadFilaADominio(row: UnidadRow): UnidadPlanificada {
  return {
    orden: row.orden,
    titulo: row.titulo,
    // oa_codigos: text[] nativo de Postgres → string[]
    oaCodigos: row.oaCodigos as string[],
    inicio: row.inicio ?? undefined,
    fin: row.fin ?? undefined,
    semanas: row.semanas ?? undefined,
  };
}

function filaAGuardada(
  cabecera: PlanificacionRow,
  unidades: UnidadRow[],
): PlanificacionAnualGuardada {
  return {
    id: cabecera.id,
    corpusVersionId: cabecera.corpusVersionId,
    establecimiento: cabecera.establecimiento,
    asignatura: cabecera.asignatura,
    nivel: cabecera.nivel,
    anio: cabecera.anio,
    // Unidades ordenadas por campo orden ASC (también garantizado por la query).
    unidades: unidades.map(unidadFilaADominio),
  };
}

export class PlanificacionAnualRepositoryDrizzle implements PlanificacionAnualRepository {
  constructor(private readonly db: DrizzleDb) {}

  /**
   * Inserta la cabecera + todas las unidades en una sola transacción (RF-PA.4).
   * corpusVersionId se recibe explícito para cumplir la firma autorizada en H-PA.3:
   *   guardar(p: PlanificacionAnual, corpusVersionId: string): Promise<PlanificacionAnualGuardada>
   */
  async guardar(
    p: PlanificacionAnual,
    corpusVersionId: string,
  ): Promise<PlanificacionAnualGuardada> {
    return this.db.transaction(async (tx) => {
      const [cabecera] = await tx
        .insert(planificacionAnual)
        .values({
          establecimiento: p.establecimiento,
          asignatura: p.asignatura,
          nivel: p.nivel,
          anio: p.anio,
          corpusVersionId,
        })
        .returning();

      if (!cabecera) throw new Error('No se pudo crear la planificacion_anual');

      const unidadesInsertadas =
        p.unidades.length > 0
          ? await tx
              .insert(unidadPlanificada)
              .values(
                p.unidades.map((u) => ({
                  planificacionAnualId: cabecera.id,
                  orden: u.orden,
                  titulo: u.titulo,
                  // text[] nativo: Drizzle acepta string[] directamente.
                  oaCodigos: u.oaCodigos,
                  inicio: u.inicio ?? null,
                  fin: u.fin ?? null,
                  semanas: u.semanas ?? null,
                })),
              )
              .returning()
          : [];

      // Ordenamos por campo orden para coherencia con obtener/listar.
      const unidadesOrdenadas = [...unidadesInsertadas].sort((a, b) => a.orden - b.orden);
      return filaAGuardada(cabecera, unidadesOrdenadas);
    });
  }

  /**
   * Actualiza la cabecera y reemplaza todas las unidades en una transacción (RF-PA.5).
   * Borra las unidades existentes del plan e inserta las nuevas (replace-all semántico).
   * Si el id no existe, lanza error claro para que el use case lo propague al caller.
   */
  async actualizar(
    id: string,
    p: PlanificacionAnual,
    corpusVersionId: string,
  ): Promise<PlanificacionAnualGuardada> {
    return this.db.transaction(async (tx) => {
      // Verificar existencia antes de actualizar para dar error claro (no silencioso).
      const [existente] = await tx
        .select({ id: planificacionAnual.id })
        .from(planificacionAnual)
        .where(eq(planificacionAnual.id, id));

      if (!existente) {
        throw new Error(`PlanificacionAnual con id '${id}' no encontrada`);
      }

      // Actualizar cabecera; updatedAt se renueva explícitamente (no tiene defaultNow en UPDATE).
      const [cabecera] = await tx
        .update(planificacionAnual)
        .set({
          establecimiento: p.establecimiento,
          asignatura: p.asignatura,
          nivel: p.nivel,
          anio: p.anio,
          corpusVersionId,
          updatedAt: sql`now()`,
        })
        .where(eq(planificacionAnual.id, id))
        .returning();

      if (!cabecera) throw new Error(`Error al actualizar cabecera de PlanificacionAnual '${id}'`);

      // Reemplazar unidades: borra las existentes e inserta las nuevas (semántica clear+insert).
      await tx.delete(unidadPlanificada).where(eq(unidadPlanificada.planificacionAnualId, id));

      const unidadesInsertadas =
        p.unidades.length > 0
          ? await tx
              .insert(unidadPlanificada)
              .values(
                p.unidades.map((u) => ({
                  planificacionAnualId: id,
                  orden: u.orden,
                  titulo: u.titulo,
                  oaCodigos: u.oaCodigos,
                  inicio: u.inicio ?? null,
                  fin: u.fin ?? null,
                  semanas: u.semanas ?? null,
                })),
              )
              .returning()
          : [];

      const unidadesOrdenadas = [...unidadesInsertadas].sort((a, b) => a.orden - b.orden);
      return filaAGuardada(cabecera, unidadesOrdenadas);
    });
  }

  async obtener(id: string): Promise<PlanificacionAnualGuardada | null> {
    const [cabecera] = await this.db
      .select()
      .from(planificacionAnual)
      .where(eq(planificacionAnual.id, id));

    if (!cabecera) return null;

    const unidades = await this.db
      .select()
      .from(unidadPlanificada)
      .where(eq(unidadPlanificada.planificacionAnualId, id))
      .orderBy(asc(unidadPlanificada.orden));

    return filaAGuardada(cabecera, unidades);
  }

  async listar(filtro: {
    establecimiento: string;
    asignatura?: string;
    nivel?: string;
    anio?: number;
  }): Promise<PlanificacionAnualGuardada[]> {
    // Construimos las condiciones de filtro de forma explícita (sin any).
    const condiciones = [eq(planificacionAnual.establecimiento, filtro.establecimiento)];
    if (filtro.asignatura !== undefined) {
      condiciones.push(eq(planificacionAnual.asignatura, filtro.asignatura));
    }
    if (filtro.nivel !== undefined) {
      condiciones.push(eq(planificacionAnual.nivel, filtro.nivel));
    }
    if (filtro.anio !== undefined) {
      condiciones.push(eq(planificacionAnual.anio, filtro.anio));
    }

    const cabeceras = await this.db
      .select()
      .from(planificacionAnual)
      .where(and(...condiciones));

    if (cabeceras.length === 0) return [];

    // Cargamos todas las unidades de las planificaciones encontradas en una sola query.
    const ids = cabeceras.map((c) => c.id);
    const todasUnidades = await this.db
      .select()
      .from(unidadPlanificada)
      .where(inArray(unidadPlanificada.planificacionAnualId, ids))
      .orderBy(asc(unidadPlanificada.orden));

    // Agrupamos unidades por planificacion_anual_id.
    const porPlanificacion = new Map<string, UnidadRow[]>();
    for (const u of todasUnidades) {
      const grupo = porPlanificacion.get(u.planificacionAnualId) ?? [];
      grupo.push(u);
      porPlanificacion.set(u.planificacionAnualId, grupo);
    }

    return cabeceras.map((c) => filaAGuardada(c, porPlanificacion.get(c.id) ?? []));
  }
}
