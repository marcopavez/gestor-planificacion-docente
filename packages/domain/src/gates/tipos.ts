// packages/domain/src/gates/tipos.ts
// Tipos compartidos de los gates deterministas (INV-1: lógica de dominio, testeable sin red).
// Un gate nunca lanza: devuelve hallazgos clasificados por severidad. 'bloquea' impide aprobar
// el documento (INV-2/INV-3); 'marca' es advertencia para la revisión humana (HIL).

export type Severidad = 'bloquea' | 'marca';

export interface Hallazgo {
  readonly gate: string;
  readonly regla: string;
  readonly severidad: Severidad;
  readonly mensaje: string;
  readonly ref?: string; // código OA / referencia normativa relacionada
}

export interface ResultadoGate {
  readonly ok: boolean; // true si ningún hallazgo es 'bloquea'
  readonly hallazgos: readonly Hallazgo[];
}

export function construirResultado(hallazgos: Hallazgo[]): ResultadoGate {
  return { ok: hallazgos.every((h) => h.severidad !== 'bloquea'), hallazgos };
}
