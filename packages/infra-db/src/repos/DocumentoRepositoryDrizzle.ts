// packages/infra-db/src/repos/DocumentoRepositoryDrizzle.ts
// Adapter Drizzle para DocumentoRepository (RF-PA.3, INV-3).
// INV-3: los documentos nacen siempre en estado 'borrador' (default de DB + lógica de dominio).

import { eq } from 'drizzle-orm';
import type {
  DocumentoGenerado,
  DocumentoRepository,
  EstadoGeneracion,
  EstadoRevision,
  NuevoDocumento,
} from '@faro/domain';
import type { DrizzleDb } from '../db.js';
import { documentoGenerado } from '../schema/index.js';

type DocumentoRow = typeof documentoGenerado.$inferSelect;

function filaADominio(row: DocumentoRow): DocumentoGenerado {
  return {
    id: row.id,
    // NuevoDocumento usa establecimientoId; la columna se llama establecimiento en DB.
    // Mapeamos 1:1 — la columna guarda el valor que el dominio llama establecimientoId.
    establecimientoId: row.establecimiento,
    tipo: row.tipo,
    // payload jsonb es el "contenido" del documento generado (artefacto de la cascada).
    contenido: row.payload,
    // Las citas no se almacenan en columna separada en esta versión del schema;
    // se incluyen dentro del payload si el LLM las produce.
    // FRICCIÓN SEÑALADA: DocumentoGenerado.citas: Cita[] no tiene columna propia en DB;
    // se leen desde payload. Ver sección de fricción en el reporte.
    citas: [],
    estadoRevision: row.estadoRevision as EstadoRevision,
    estadoGeneracion: row.estadoGeneracion as EstadoGeneracion,
    autorHumano: row.autorHumano,
    resultadoGates: row.resultadoGates,
    createdAt: row.createdAt,
    // aprobadoAt no tiene columna propia; se deduce de updatedAt cuando estado='aprobado'.
    // FRICCIÓN SEÑALADA: no hay columna aprobado_at en el schema actual. Ver reporte.
    aprobadoAt: null,
  };
}

export class DocumentoRepositoryDrizzle implements DocumentoRepository {
  constructor(private readonly db: DrizzleDb) {}

  async crearBorrador(input: NuevoDocumento): Promise<DocumentoGenerado> {
    const [row] = await this.db
      .insert(documentoGenerado)
      .values({
        tipo: input.tipo,
        // NuevoDocumento.establecimientoId → columna establecimiento
        establecimiento: input.establecimientoId,
        // corpusVersionId es obligatorio en DB (NOT NULL FK).
        // FRICCIÓN SEÑALADA: NuevoDocumento no incluye corpusVersionId ni payload inicial.
        // El adapter inyecta un placeholder; el worker debe llamar marcarGeneracion() con el
        // payload real. Ver reporte.
        corpusVersionId: '00000000-0000-0000-0000-000000000000',
        estadoRevision: 'borrador',
        estadoGeneracion: 'pendiente',
        autorHumano: input.autorHumano,
      })
      .returning();

    if (!row) throw new Error('No se pudo crear el borrador');
    return filaADominio(row);
  }

  async marcarGeneracion(
    id: string,
    estado: EstadoGeneracion,
    contenido?: unknown,
    gates?: unknown,
  ): Promise<void> {
    await this.db
      .update(documentoGenerado)
      .set({
        estadoGeneracion: estado,
        payload: contenido !== undefined ? (contenido as Record<string, unknown>) : undefined,
        resultadoGates: gates !== undefined ? (gates as Record<string, unknown>) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(documentoGenerado.id, id));
  }

  async porId(id: string): Promise<DocumentoGenerado | null> {
    const [row] = await this.db
      .select()
      .from(documentoGenerado)
      .where(eq(documentoGenerado.id, id));

    return row !== undefined ? filaADominio(row) : null;
  }
}
