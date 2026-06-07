// packages/infra-db/src/repos/TrazaRepositoryDrizzle.ts
// Adapter Drizzle para TrazaRepository (RF-PA.3, INV-4, Art. 8 bis).
// Cada llamada al LLM escribe una fila inmutable de auditoría; nunca se edita.

import type { NuevaTraza, TrazaRepository } from '@faro/domain';
import type { DbOTx } from '../db.js';
import { trazaIa } from '../schema/index.js';

export class TrazaRepositoryDrizzle implements TrazaRepository {
  // DbOTx: acepta la instancia top-level o una transacción (para la unidad de trabajo atómica).
  constructor(private readonly db: DbOTx) {}

  async registrar(traza: NuevaTraza): Promise<void> {
    // NuevaTraza.usage es UsoTokens (objeto tipado); se persiste como jsonb tal cual.
    // recuperado/citas/evals se guardan en gates jsonb para auditoría completa (INV-4).
    await this.db.insert(trazaIa).values({
      documentoId: traza.documentoId,
      corpusVersionId: traza.corpusVersionId,
      modelo: traza.modelo,
      rutaDecision: traza.rutaDecision,
      // UsoTokens no tiene index signature — se convierte via unknown para jsonb (sin any).
      usage: traza.usage as unknown as Record<string, unknown>,
      gates: {
        evals: traza.evals,
        citas: traza.citas,
        recuperado: traza.recuperado,
        promptHash: traza.promptHash,
        revisor: traza.revisor,
      } as Record<string, unknown>,
    });
  }
}
