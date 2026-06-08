import { describe, expect, it } from 'vitest';
import type { PlanificacionClase } from '../schemas/planificacionClase.js';
import type { PlanificacionUnidad } from '../schemas/planificacionUnidad.js';
import type { Prueba } from '../schemas/prueba.js';
import type { ClaseDeck } from '../schemas/claseDeck.js';
import type { OaVigencia } from './citationGate.js';
import { citationGate, correrGatesCascada, pedagogicalGate, planificacionGate } from './index.js';

// --- Fixtures válidos (todo verde) — funciones para poder clonar y romper en cada caso ---

function unidad(): PlanificacionUnidad {
  return {
    plantilla: 'A',
    establecimiento: 'Colegio Demo',
    asignatura: 'Matemática',
    nivel: '1º básico',
    unidad: 'Unidad demo',
    proposito: 'Propósito demo.',
    duracion_semanas: 1,
    horas_pedagogicas: 2, // 2 × 45 = 90 min → coherente con 1 clase de 90 min
    oa: [
      { codigo: 'MA01 OA 03', categoria: 'basal', descripcion: 'Leer números del 0 al 20.', habilidades: ['Representar'] },
      { codigo: 'MA01 OA 04', categoria: 'basal', descripcion: 'Comparar y ordenar números del 0 al 20.', habilidades: [] },
    ],
    experiencias: ['Cuentan colecciones.'],
    indicadores_evaluacion: [
      { oa: 'MA01 OA 03', texto: 'Leen números del 0 al 20.', fuente: 'ia_borrador' },
      { oa: 'MA01 OA 04', texto: 'Comparan dos cantidades hasta 20.', fuente: 'ia_borrador' },
    ],
    evaluacion: { tipo: ['diagnostica', 'formativa', 'sumativa'], instrumentos: ['Lista de cotejo'] },
    extras: {},
  };
}

function clase(): PlanificacionClase {
  return {
    unidad_ref: 'Unidad demo',
    clases: [
      {
        numero: 1,
        oa: ['MA01 OA 03'],
        objetivo_clase: 'Leer y representar números.',
        inicio: 'Conteo colectivo.',
        desarrollo: 'Representación concreta.',
        cierre: 'Ticket de salida.',
        recursos: ['Tapitas'],
        evaluacion_formativa: 'Lista de cotejo.',
        indicadores: ['Leen números.'],
        duracion_min: 90,
      },
    ],
  };
}

function prueba(): Prueba {
  return {
    asignatura: 'Matemática',
    curso: '1º básico',
    perfil_nivel: '1B',
    tabla_especificaciones: [
      { oa: 'MA01 OA 03', n_items: 1, puntaje: 2 },
      { oa: 'MA01 OA 04', n_items: 1, puntaje: 2 },
    ],
    items: [
      {
        oa: 'MA01 OA 03',
        habilidad: 'recordar',
        tipo: 'seleccion_multiple',
        enunciado: 'Cuenta y marca.',
        alternativas: [
          { texto: '6', correcta: false },
          { texto: '7', correcta: true },
        ],
        puntaje: 2,
      },
      {
        oa: 'MA01 OA 04',
        habilidad: 'aplicar',
        tipo: 'seleccion_multiple',
        enunciado: '¿Cuál es mayor?',
        alternativas: [
          { texto: '5', correcta: false },
          { texto: '8', correcta: true },
        ],
        puntaje: 2,
      },
    ],
    pauta_correccion: 'Cada ítem 2 puntos.',
    alineada_reglamento: false,
    version_nee_dua: false,
  };
}

function deck(): ClaseDeck {
  return {
    titulo: 'Clase 1',
    asignatura: 'Matemática',
    nivel: '1º básico',
    oa: ['MA01 OA 03'],
    slides: [{ momento: 'inicio', titulo: 'Inicio', contenido: ['Contemos'], notas_docente: 'Rutina.' }],
  };
}

const corpus: OaVigencia[] = [
  { codigo: 'MA01 OA 03', vigente: true },
  { codigo: 'MA01 OA 04', vigente: true },
];

describe('gates deterministas de la cascada (H-0.7)', () => {
  it('cascada válida: todos los gates ok, sin hallazgos bloqueantes', () => {
    const r = correrGatesCascada({ unidad: unidad(), clase: clase(), prueba: prueba(), deck: deck(), corpus });
    expect(r.ok).toBe(true);
    expect(r.planificacion.hallazgos).toHaveLength(0);
    expect(r.pedagogica.hallazgos).toHaveLength(0);
    expect(r.citas.hallazgos).toHaveLength(0);
  });

  it('planificacionGate bloquea un OA basal sin cobertura', () => {
    const u = unidad();
    // OA 04 deja de estar cubierto: sin clase y sin indicador.
    const r = planificacionGate(
      { ...u, indicadores_evaluacion: u.indicadores_evaluacion.filter((i) => i.oa !== 'MA01 OA 04') },
      clase(), // las clases solo cubren OA 03
    );
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'oa_basal_cubierto' && h.ref === 'MA01 OA 04')).toBe(true);
  });

  it('planificacionGate bloquea un indicador que no tributa a un OA de la unidad', () => {
    const u = unidad();
    u.indicadores_evaluacion.push({ oa: 'MA01 OA 99', texto: 'Indicador huérfano.', fuente: 'ia_borrador' });
    const r = planificacionGate(u, clase());
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'indicador_tributa_oa' && h.ref === 'MA01 OA 99')).toBe(true);
  });

  it('planificacionGate marca (no bloquea) duración incoherente', () => {
    const u = unidad();
    const r = planificacionGate({ ...u, horas_pedagogicas: 42 }, clase()); // 90 min vs 1890 min
    expect(r.ok).toBe(true);
    expect(r.hallazgos.some((h) => h.regla === 'duracion_coherente' && h.severidad === 'marca')).toBe(true);
  });

  it('pedagogicalGate bloquea cuando los puntajes no cuadran', () => {
    const p = prueba();
    const items = p.items.map((it, i) => (i === 0 ? { ...it, puntaje: 5 } : it));
    const r = pedagogicalGate({ ...p, items });
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'puntajes_cuadran')).toBe(true);
  });

  it('pedagogicalGate bloquea selección múltiple sin exactamente una correcta', () => {
    const p = prueba();
    const items = p.items.map((it, i) =>
      i === 0 ? { ...it, alternativas: [{ texto: 'a', correcta: true }, { texto: 'b', correcta: true }] } : it,
    );
    const r = pedagogicalGate({ ...p, items });
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'una_correcta')).toBe(true);
  });

  it('pedagogicalGate bloquea un ítem fuera de la tabla de especificaciones', () => {
    const p = prueba();
    const items = p.items.map((it, i) => (i === 0 ? { ...it, oa: 'MA01 OA 20' } : it));
    const r = pedagogicalGate({ ...p, items });
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'item_en_tabla' && h.ref === 'MA01 OA 20')).toBe(true);
  });

  it('citationGate bloquea un OA citado inexistente en el corpus', () => {
    const u = unidad();
    u.oa.push({ codigo: 'MA01 OA 77', categoria: 'complementario', descripcion: 'OA inventado.', habilidades: [] });
    const r = citationGate({ unidad: u, clase: clase(), prueba: prueba(), deck: deck(), corpus });
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'oa_existe' && h.ref === 'MA01 OA 77')).toBe(true);
  });

  it('citationGate bloquea un OA citado derogado / no vigente', () => {
    const r = citationGate({
      unidad: unidad(),
      clase: clase(),
      prueba: prueba(),
      deck: deck(),
      corpus: [{ codigo: 'MA01 OA 03', vigente: false }, { codigo: 'MA01 OA 04', vigente: true }],
    });
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === 'oa_vigente' && h.ref === 'MA01 OA 03')).toBe(true);
  });

  it('citationGate solo marca (no bloquea) los OAT transversales', () => {
    const u = unidad();
    u.oa.push({ codigo: 'OAT 9', categoria: 'transversal', descripcion: 'Resolver problemas reflexivamente.', habilidades: [] });
    const r = citationGate({ unidad: u, clase: clase(), prueba: prueba(), deck: deck(), corpus });
    expect(r.ok).toBe(true);
    expect(r.hallazgos.some((h) => h.regla === 'oa_transversal' && h.severidad === 'marca')).toBe(true);
  });
});
