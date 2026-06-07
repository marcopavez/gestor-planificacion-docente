// packages/domain/src/evals/evalsLite.test.ts
// Evals-lite (opt-in): fidelidad de la cascada curada (samples) contra los gates y Decreto 67.
// INV-1: puro, sin DB, sin LLM, sin red. Lee samples y corpus por node:fs (permitido en domain),
// e importa gates/schemas por ruta relativa dentro del dominio (no por @faro/domain).
// Opt-in para no penalizar la suite normal: corre solo con EVALS_LITE=1.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { correrGatesCascada, type OaVigencia } from '../gates/index.js';
import { SchemaClaseDeck } from '../schemas/claseDeck.js';
import { SchemaPlanificacionClase } from '../schemas/planificacionClase.js';
import { SchemaPlanificacionUnidad } from '../schemas/planificacionUnidad.js';
import { SchemaPrueba } from '../schemas/prueba.js';

const evals = process.env['EVALS_LITE'] === '1' ? describe : describe.skip;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, '../../../../samples/aula-matematica-1b');
const CORPUS_PATH = join(__dirname, '../../../../corpus/curriculum/matematica-1-basico.json');

function leerJson(ruta: string): unknown {
  return JSON.parse(readFileSync(ruta, 'utf8'));
}

// Forma mínima del corpus que necesitamos (solo los códigos de OA).
interface CorpusCurriculum {
  readonly objetivos_aprendizaje: ReadonlyArray<{ readonly codigo: string }>;
}

evals('evals-lite — fidelidad de la cascada curada (Matemática 1º básico)', () => {
  // Paso 1: parsear cada sample con su schema Zod. Si alguno no valida, .parse lanza y el test falla.
  const unidad = SchemaPlanificacionUnidad.parse(leerJson(join(SAMPLES_DIR, 'planificacion-unidad.json')));
  const clase = SchemaPlanificacionClase.parse(leerJson(join(SAMPLES_DIR, 'planificacion-clase.json')));
  const prueba = SchemaPrueba.parse(leerJson(join(SAMPLES_DIR, 'prueba.json')));
  const deck = SchemaClaseDeck.parse(leerJson(join(SAMPLES_DIR, 'clase-deck.json')));

  // Paso 2: corpus de OA para los gates. Todos vigentes (vigencia null en el corpus ⇒ vigente).
  const corpusRaw = leerJson(CORPUS_PATH) as CorpusCurriculum;
  const codigosCorpus = new Set(corpusRaw.objetivos_aprendizaje.map((o) => o.codigo));
  const corpus: readonly OaVigencia[] = corpusRaw.objetivos_aprendizaje.map((o) => ({
    codigo: o.codigo,
    vigente: true,
  }));

  it('los 4 artefactos pasan los gates deterministas (planificación, pedagógica, citas)', () => {
    const reporte = correrGatesCascada({ unidad, clase, prueba, deck, corpus });
    expect(reporte.ok).toBe(true);
    expect(reporte.planificacion.ok && reporte.pedagogica.ok && reporte.citas.ok).toBe(true);
  });

  it('la prueba cumple Decreto 67 (≥16 ítems, ítem→OA, una correcta, puntajes)', () => {
    // ≥16 ítems (el sample tiene 16).
    expect(prueba.items.length).toBeGreaterThanOrEqual(16);
    // Cada ítem tributa a un OA que existe en el corpus.
    expect(prueba.items.every((it) => codigosCorpus.has(it.oa))).toBe(true);
    // Selección múltiple / verdadero-falso: exactamente una alternativa correcta.
    const cerrados = prueba.items.filter(
      (it) => it.tipo === 'seleccion_multiple' || it.tipo === 'verdadero_falso',
    );
    expect(cerrados.every((it) => (it.alternativas ?? []).filter((a) => a.correcta).length === 1)).toBe(true);
    // Puntaje presente en cada ítem.
    expect(prueba.items.every((it) => typeof it.puntaje === 'number')).toBe(true);
    // NO aseveramos prueba.alineada_reglamento: el prompt de producción lo fija en false a propósito,
    // porque la alineación real al reglamento exige el reglamento de evaluación del colegio (Fase 2+).
  });

  it('todos los OA citados en los 4 artefactos existen en el corpus (alineación a OA)', () => {
    // Reúne los OA citados igual que citationGate.codigosCitados (que es privado), excluyendo
    // transversales (OAT), que viven fuera del corpus de asignatura y son advisory en el gate.
    // Nota: clase.clases[].indicadores son texto libre (no códigos OA), así que no se recogen.
    const citados = new Set<string>();
    unidad.oa.forEach((o) => citados.add(o.codigo));
    unidad.indicadores_evaluacion.forEach((i) => citados.add(i.oa));
    clase.clases.forEach((cl) => cl.oa.forEach((x) => citados.add(x)));
    prueba.items.forEach((it) => citados.add(it.oa));
    prueba.tabla_especificaciones.forEach((t) => citados.add(t.oa));
    deck.oa.forEach((x) => citados.add(x));

    const noTransversales = [...citados].filter((c) => !/^OAT/i.test(c));
    const todosCitadosExistenEnCorpus = noTransversales.every((c) => codigosCorpus.has(c));
    expect(todosCitadosExistenEnCorpus).toBe(true);
  });
});
