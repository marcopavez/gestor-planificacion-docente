// packages/domain/src/gates/secuenciaAnualGate.test.ts
// Tests unitarios del gate de la secuencia anual (RF-PA.5, CA-PA.3).
// INV-1: deterministas, sin DB ni LLM — el corpus se pasa como dato.

import { describe, expect, it } from 'vitest';
import type { OaCorpus } from './secuenciaAnualGate.js';
import { secuenciaAnualGate } from './secuenciaAnualGate.js';
import type { PlanificacionAnual } from '../schemas/planificacionAnual.js';

// --- Corpus de referencia (Matemática 1º básico) ---
const corpus: OaCorpus[] = [
  { codigo: 'MA01 OA 01', asignatura: 'Matemática', nivel: '1° básico', vigente: true },
  { codigo: 'MA01 OA 02', asignatura: 'Matemática', nivel: '1° básico', vigente: true },
  { codigo: 'MA01 OA 03', asignatura: 'Matemática', nivel: '1° básico', vigente: true },
  { codigo: 'MA01 OA 04', asignatura: 'Matemática', nivel: '1° básico', vigente: false }, // derogado
];

// --- Plan base válido (cubre OA 01, 02, 03; OA 04 está derogado y no se asigna) ---
function planValido(): PlanificacionAnual {
  return {
    establecimiento: 'Colegio Demo',
    asignatura: 'Matemática',
    nivel: '1° básico',
    anio: 2025,
    unidades: [
      { orden: 1, titulo: 'Unidad 1 — Números al 10', oaCodigos: ['MA01 OA 01', 'MA01 OA 02'] },
      { orden: 2, titulo: 'Unidad 2 — Números al 20', oaCodigos: ['MA01 OA 03'] },
    ],
  };
}

describe('secuenciaAnualGate (H-PA.4)', () => {
  it('plan válido: sin hallazgos bloqueantes cuando todos los OA existen, están vigentes y hay cobertura', () => {
    // OA 04 está derogado; el plan no lo asigna → no se busca cobertura de OA derogados
    // (el gate solo reporta cobertura de OA vigentes del curso)
    const corpusSoloVigentes: OaCorpus[] = corpus.filter((o) => o.vigente);
    const r = secuenciaAnualGate(planValido(), corpusSoloVigentes);
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toHaveLength(0);
  });

  it('bloquea cuando un oaCodigo no existe en el corpus', () => {
    const plan = planValido();
    const unidad0 = plan.unidades[0];
    if (!unidad0) throw new Error('fixture inválido');
    unidad0.oaCodigos.push('MA01 OA 99'); // OA inexistente
    const r = secuenciaAnualGate(plan, corpus);
    expect(r.ok).toBe(false);
    const hallazgo = r.hallazgos.find((h) => h.regla === 'oa_existe' && h.ref === 'MA01 OA 99');
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.severidad).toBe('bloquea');
  });

  it('bloquea cuando un oaCodigo está derogado (vigente: false)', () => {
    const plan = planValido();
    const unidad0 = plan.unidades[0];
    if (!unidad0) throw new Error('fixture inválido');
    unidad0.oaCodigos.push('MA01 OA 04'); // derogado en el corpus
    const r = secuenciaAnualGate(plan, corpus);
    expect(r.ok).toBe(false);
    const hallazgo = r.hallazgos.find((h) => h.regla === 'oa_vigente' && h.ref === 'MA01 OA 04');
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.severidad).toBe('bloquea');
  });

  it('marca (no bloquea) cobertura incompleta — OA del curso no asignado a ninguna unidad', () => {
    // El plan solo cubre OA 01; OA 02 y OA 03 quedan sin asignar
    const plan: PlanificacionAnual = {
      establecimiento: 'Colegio Demo',
      asignatura: 'Matemática',
      nivel: '1° básico',
      anio: 2025,
      unidades: [{ orden: 1, titulo: 'Unidad 1', oaCodigos: ['MA01 OA 01'] }],
    };
    const corpusSoloVigentes = corpus.filter((o) => o.vigente);
    const r = secuenciaAnualGate(plan, corpusSoloVigentes);
    // No bloquea (solo marcas de cobertura)
    expect(r.ok).toBe(true);
    const cobertura02 = r.hallazgos.find((h) => h.regla === 'cobertura_oa' && h.ref === 'MA01 OA 02');
    const cobertura03 = r.hallazgos.find((h) => h.regla === 'cobertura_oa' && h.ref === 'MA01 OA 03');
    expect(cobertura02).toBeDefined();
    expect(cobertura02?.severidad).toBe('marca');
    expect(cobertura03).toBeDefined();
  });

  it('marca (no bloquea) cuando un OA aparece en más de una unidad', () => {
    const plan: PlanificacionAnual = {
      establecimiento: 'Colegio Demo',
      asignatura: 'Matemática',
      nivel: '1° básico',
      anio: 2025,
      unidades: [
        { orden: 1, titulo: 'Unidad 1', oaCodigos: ['MA01 OA 01', 'MA01 OA 02'] },
        { orden: 2, titulo: 'Unidad 2', oaCodigos: ['MA01 OA 01', 'MA01 OA 03'] }, // OA 01 repetido
      ],
    };
    const corpusSoloVigentes = corpus.filter((o) => o.vigente);
    const r = secuenciaAnualGate(plan, corpusSoloVigentes);
    // OA 01 repetido → marca; no bloquea (P2 del plan: revisita pedagógica es válida)
    expect(r.ok).toBe(true);
    const repeticion = r.hallazgos.find((h) => h.regla === 'oa_repetido' && h.ref === 'MA01 OA 01');
    expect(repeticion).toBeDefined();
    expect(repeticion?.severidad).toBe('marca');
  });

  it('no marca repetición cuando marcarRepeticion=false', () => {
    const plan: PlanificacionAnual = {
      establecimiento: 'Colegio Demo',
      asignatura: 'Matemática',
      nivel: '1° básico',
      anio: 2025,
      unidades: [
        { orden: 1, titulo: 'Unidad 1', oaCodigos: ['MA01 OA 01', 'MA01 OA 02'] },
        { orden: 2, titulo: 'Unidad 2', oaCodigos: ['MA01 OA 01', 'MA01 OA 03'] },
      ],
    };
    const corpusSoloVigentes = corpus.filter((o) => o.vigente);
    const r = secuenciaAnualGate(plan, corpusSoloVigentes, { marcarRepeticion: false });
    expect(r.hallazgos.find((h) => h.regla === 'oa_repetido')).toBeUndefined();
  });
});
