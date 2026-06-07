// packages/domain/src/utils/vigencia.ts
// Función pura para determinar si una entidad con ventana de vigencia está vigente
// en una fecha dada (INV-1: determinista, sin red, testeable en aislado).
// Usada tanto por derivarContextoCascada (application) como potencialmente por gates.

/**
 * Retorna true si la entidad está vigente en `hoy`, según sus fechas de vigencia.
 * Regla: vigente si desde <= hoy <= hasta (extremos incluidos).
 * null en desde = sin fecha de inicio (vigente desde siempre).
 * null en hasta = sin fecha de término (vigente indefinidamente).
 */
export function estaVigente(
  vigenciaDesde: Date | null,
  vigenciaHasta: Date | null,
  hoy: Date,
): boolean {
  if (vigenciaDesde !== null && hoy < vigenciaDesde) return false;
  if (vigenciaHasta !== null && hoy > vigenciaHasta) return false;
  return true;
}
