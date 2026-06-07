// packages/infra-db/src/repos/DocumentoRepositoryDrizzle.ts
// Adapter Drizzle para DocumentoRepository (RF-PA.3, INV-3).
// INV-3: los documentos nacen siempre en estado 'borrador' (default de DB + lógica de dominio).

import { eq, sql } from 'drizzle-orm';
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

// Fila cruda devuelta por `SELECT *` (snake_case + tipos del driver) — el CTE recursivo no pasa
// por el mapeo de columnas de Drizzle, así que tipamos lo que realmente llega.
interface DocumentoRowSql {
  id: string;
  tipo: string;
  establecimiento: string;
  corpus_version_id: string;
  origen_id: string | null;
  unidad_planificada_id: string | null;
  estado_revision: string;
  estado_generacion: string;
  payload: unknown;
  resultado_gates: unknown;
  autor_humano: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

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

// Variante para filas crudas del CTE recursivo (snake_case) — mismo dominio que filaADominio.
function filaSqlADominio(row: DocumentoRowSql): DocumentoGenerado {
  return {
    id: row.id,
    establecimientoId: row.establecimiento,
    tipo: row.tipo,
    contenido: row.payload,
    citas: [],
    estadoRevision: row.estado_revision as EstadoRevision,
    estadoGeneracion: row.estado_generacion as EstadoGeneracion,
    autorHumano: row.autor_humano,
    resultadoGates: row.resultado_gates,
    // El driver puede devolver created_at como Date (pg) o string ISO (pglite) — normalizamos.
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
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

  /**
   * Cascada completa desde la raíz (H-PA.9): documento raíz + todos los descendientes por origen_id.
   * La cascada tiene 2 niveles (deck → clase → unidad), así que origen_id = raizId no basta:
   * el deck cuelga de la clase, no de la unidad. Recorremos transitivamente con un CTE recursivo
   * (Postgres y pglite lo soportan). Orden estable por created_at, luego tipo, para una salida
   * determinista en la UI.
   */
  async listarPorRaiz(raizId: string): Promise<DocumentoGenerado[]> {
    const result = await this.db.execute(
      // WITH RECURSIVE recorre la cadena origen_id partiendo del documento raíz.
      sql`
        WITH RECURSIVE cascada AS (
          SELECT * FROM documento_generado WHERE id = ${raizId}
          UNION ALL
          SELECT d.* FROM documento_generado d
          JOIN cascada c ON d.origen_id = c.id
        )
        SELECT * FROM cascada
        ORDER BY created_at ASC, tipo ASC
      `,
    );

    const filas = (result as unknown as { rows: DocumentoRowSql[] }).rows;
    return filas.map(filaSqlADominio);
  }
}
