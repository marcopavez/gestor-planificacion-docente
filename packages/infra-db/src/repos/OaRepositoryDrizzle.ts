// packages/infra-db/src/repos/OaRepositoryDrizzle.ts
// Adapter Drizzle para OaRepository (RF-PA.3, RF-PA.2).
// INV-5: importa de @faro/domain (puerto) y del schema local; nunca al revés.

import { and, eq, inArray } from 'drizzle-orm';
import type { OaRepository, ObjetivoAprendizaje } from '@faro/domain';
import type { DrizzleDb } from '../db.js';
import { objetivoAprendizaje } from '../schema/index.js';

// Tipo de fila inferido del schema Drizzle para el mapeo interno.
type OaRow = typeof objetivoAprendizaje.$inferSelect;

/**
 * Mapea una fila de Postgres al tipo de dominio ObjetivoAprendizaje.
 * indicadores: jsonb → string[]; fechas: string ISO → Date | null.
 */
function filaADominio(row: OaRow): ObjetivoAprendizaje {
  // indicadores puede ser null (OA sin indicadores registrados en el corpus) o string[]
  const indicadoresRaw = row.indicadores;
  const indicadores: string[] =
    Array.isArray(indicadoresRaw) ? (indicadoresRaw as string[]) : [];

  return {
    id: row.id,
    corpusVersionId: row.corpusVersionId,
    codigo: row.codigo,
    asignatura: row.asignatura,
    nivel: row.nivel,
    descripcion: row.descripcion,
    indicadores,
    // date columns llegan como strings ISO 'YYYY-MM-DD' desde pg; convertimos a Date.
    vigenciaDesde: row.vigenciaDesde !== null ? new Date(row.vigenciaDesde) : null,
    vigenciaHasta: row.vigenciaHasta !== null ? new Date(row.vigenciaHasta) : null,
  };
}

export class OaRepositoryDrizzle implements OaRepository {
  constructor(private readonly db: DrizzleDb) {}

  async porAsignaturaCurso(
    asignatura: string,
    curso: string,
    corpusVersionId: string,
  ): Promise<ObjetivoAprendizaje[]> {
    const rows = await this.db
      .select()
      .from(objetivoAprendizaje)
      .where(
        and(
          eq(objetivoAprendizaje.asignatura, asignatura),
          eq(objetivoAprendizaje.nivel, curso),
          eq(objetivoAprendizaje.corpusVersionId, corpusVersionId),
        ),
      );

    return rows.map(filaADominio);
  }

  async porIds(ids: readonly string[]): Promise<ObjetivoAprendizaje[]> {
    if (ids.length === 0) return [];

    const rows = await this.db
      .select()
      .from(objetivoAprendizaje)
      .where(inArray(objetivoAprendizaje.id, ids as string[]));

    return rows.map(filaADominio);
  }

  /**
   * Ingesta idempotente: upsert por unique(corpus_version_id, codigo).
   * Si el par (versión, código) ya existe, actualiza todos los campos de contenido
   * sin cambiar el id (RF-PA.2, INV-4).
   * Esta firma no está en el puerto OaRepository (que es de lectura), pero se expone
   * como método extra para el script de ingesta (apps/ingest o worker).
   */
  async ingestar(
    oas: ReadonlyArray<{
      corpusVersionId: string;
      codigo: string;
      asignatura: string;
      nivel: string;
      descripcion: string;
      eje?: string | null;
      tipo?: string | null;
      indicadores?: string[] | null;
      vigenciaDesde?: string | null;
      vigenciaHasta?: string | null;
    }>,
  ): Promise<void> {
    if (oas.length === 0) return;

    for (const oa of oas) {
      await this.db
        .insert(objetivoAprendizaje)
        .values({
          corpusVersionId: oa.corpusVersionId,
          codigo: oa.codigo,
          asignatura: oa.asignatura,
          nivel: oa.nivel,
          descripcion: oa.descripcion,
          eje: oa.eje ?? null,
          tipo: oa.tipo ?? null,
          indicadores: oa.indicadores ?? null,
          vigenciaDesde: oa.vigenciaDesde ?? null,
          vigenciaHasta: oa.vigenciaHasta ?? null,
        })
        .onConflictDoUpdate({
          target: [objetivoAprendizaje.corpusVersionId, objetivoAprendizaje.codigo],
          set: {
            asignatura: oa.asignatura,
            nivel: oa.nivel,
            descripcion: oa.descripcion,
            eje: oa.eje ?? null,
            tipo: oa.tipo ?? null,
            indicadores: oa.indicadores ?? null,
            vigenciaDesde: oa.vigenciaDesde ?? null,
            vigenciaHasta: oa.vigenciaHasta ?? null,
          },
        });
    }
  }
}
