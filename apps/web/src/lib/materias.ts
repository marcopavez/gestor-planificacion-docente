// apps/web/src/lib/materias.ts
// Registro de materias disponibles en el demo. Extensibilidad: agregar una materia = una entrada
// aquí + su corpus en corpus/curriculum/ + sus samples en samples/ (sin tocar código).

export interface MateriaDemo {
  readonly id: string;
  readonly asignatura: string;
  readonly nivel: string;
  readonly perfilNivel: '1-2' | '3-4' | '5-6' | 'generico';
  readonly corpusFile: string; // corpus/curriculum/<corpusFile>.json
  readonly samplesDir: string; // samples/<samplesDir>/
}

export const MATERIAS_DEMO: readonly MateriaDemo[] = [
  {
    id: 'matematica-1b',
    asignatura: 'Matemática',
    nivel: '1º básico',
    perfilNivel: '1-2',
    corpusFile: 'matematica-1-basico',
    samplesDir: 'aula-matematica-1b',
  },
];

export function materiaPorId(id: string): MateriaDemo | null {
  return MATERIAS_DEMO.find((m) => m.id === id) ?? null;
}
