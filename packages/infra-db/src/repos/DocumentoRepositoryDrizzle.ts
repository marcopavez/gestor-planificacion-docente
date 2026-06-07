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
import type { DbOTx } from '../db.js';
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
  // DbOTx: acepta la instancia top-level o una transacción (para la unidad de trabajo atómica).
  constructor(private readonly db: DbOTx) {}

  async crearBorrador(input: NuevoDocumento): Promise<DocumentoGenerado> {
    const [row] = await this.db
      .insert(documentoGenerado)
      .values({
        tipo: input.tipo,
        // NuevoDocumento.establecimientoId → columna establecimiento
        establecimiento: input.establecimientoId,
        // corpus_version_id es la versión REAL del corpus vista en esta generación (INV-4, FK NOT NULL).
        corpusVersionId: input.corpusVersionId,
        unidadPlanificadaId: input.unidadPlanificadaId,
        // origen_id encadena la trazabilidad de la cascada (clase/prueba → unidad; deck → clase).
        origenId: input.origenId,
        payload: input.payload !== undefined ? (input.payload as Record<string, unknown>) : undefined,
        resultadoGates:
          input.resultadoGates !== undefined
            ? (input.resultadoGates as Record<string, unknown>)
            : undefined,
        // INV-3: el estado de revisión SIEMPRE nace en 'borrador'; ninguna ruta lo fuerza a 'aprobado'.
        estadoRevision: 'borrador',
        estadoGeneracion: input.estadoGeneracion ?? 'pendiente',
        autorHumano: input.autorHumano ?? null,
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
