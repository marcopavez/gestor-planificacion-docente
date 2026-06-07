// packages/infra-db/src/repos/CorpusVersionRepositoryDrizzle.ts
// Adapter Drizzle para CorpusVersionRepository (RF-PA.2, INV-4, ADR-004).
// INV-5: importa de @faro/domain (puerto) y del schema local; nunca al revés.

import { desc, eq } from 'drizzle-orm';
import type { CorpusVersion, CorpusVersionRepository } from '@faro/domain';
import type { DrizzleDb } from '../db.js';
import { corpusVersion } from '../schema/index.js';

// Tipo de fila inferido del schema Drizzle para el mapeo interno.
type CorpusVersionRow = typeof corpusVersion.$inferSelect;

/** Mapea fila de Postgres al tipo de dominio CorpusVersion. */
function filaADominio(row: CorpusVersionRow): CorpusVersion {
  // publicadaAt llega como Date desde pg (columna timestamp); null si es null.
  const estado = row.estado as 'borrador' | 'publicada' | 'retirada';
  return {
    id: row.id,
    etiqueta: row.etiqueta,
    estado,
    createdAt: row.createdAt,
    publicadaAt: row.publicadaAt ?? null,
  };
}

export class CorpusVersionRepositoryDrizzle implements CorpusVersionRepository {
  constructor(private readonly db: DrizzleDb) {}

  async crear(etiqueta: string): Promise<CorpusVersion> {
    const [row] = await this.db
      .insert(corpusVersion)
      .values({ etiqueta, estado: 'borrador' })
      .returning();

    if (!row) throw new Error(`No se pudo crear la corpus_version con etiqueta '${etiqueta}'`);
    return filaADominio(row);
  }

  async buscarPorEtiqueta(etiqueta: string): Promise<CorpusVersion | null> {
    const [row] = await this.db
      .select()
      .from(corpusVersion)
      .where(eq(corpusVersion.etiqueta, etiqueta));

    return row !== undefined ? filaADominio(row) : null;
  }

  async publicar(id: string): Promise<CorpusVersion> {
    // Leer primero para aplicar reglas de estado sin un UPDATE ciego (INV-4: inmutabilidad).
    const [fila] = await this.db
      .select()
      .from(corpusVersion)
      .where(eq(corpusVersion.id, id));

    if (!fila) throw new Error(`No se encontró corpus_version con id '${id}'`);

    // Idempotente: si ya está publicada se conserva publicadaAt original (INV-4).
    if (fila.estado === 'publicada') return filaADominio(fila);

    // No se permite re-publicar una versión retirada; requeriría una nueva versión.
    if (fila.estado === 'retirada') {
      throw new Error(`No se puede publicar corpus_version '${id}': está retirada`);
    }

    // borrador → publicada
    const [actualizada] = await this.db
      .update(corpusVersion)
      .set({ estado: 'publicada', publicadaAt: new Date() })
      .where(eq(corpusVersion.id, id))
      .returning();

    if (!actualizada) throw new Error(`Fallo al publicar corpus_version '${id}'`);
    return filaADominio(actualizada);
  }

  /** Retorna la versión publicada más reciente (snapshot activo). null = no hay corpus listo. */
  async obtenerPublicadaVigente(): Promise<CorpusVersion | null> {
    const [row] = await this.db
      .select()
      .from(corpusVersion)
      .where(eq(corpusVersion.estado, 'publicada'))
      // La más reciente = la que se publicó último (publicada_at DESC).
      .orderBy(desc(corpusVersion.publicadaAt))
      .limit(1);

    return row !== undefined ? filaADominio(row) : null;
  }
}
