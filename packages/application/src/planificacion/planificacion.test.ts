// packages/application/src/planificacion/planificacion.test.ts
// Tests puros (sin DB, sin LLM) para derivarContextoCascada y CrearPlanificacionAnualUseCase.
// Usa dobles (fakes) de los puertos para cumplir B.4.

import { describe, it, expect, vi } from 'vitest';
import type {
  ClockPort,
  CorpusVersion,
  CorpusVersionRepository,
  OaRepository,
  ObjetivoAprendizaje,
  PlanificacionAnual,
  PlanificacionAnualGuardada,
  PlanificacionAnualRepository,
} from '@faro/domain';
import { ReglaDominioError } from '@faro/domain';
import { derivarContextoCascada } from '../aula/cascada/derivarContextoCascada.js';
import { CrearPlanificacionAnualUseCase } from './CrearPlanificacionAnualUseCase.js';
import { EditarPlanificacionAnualUseCase } from './EditarPlanificacionAnualUseCase.js';

// ---------------------------------------------------------------------------
// Fixtures reutilizables
// ---------------------------------------------------------------------------

const HOY = new Date('2026-06-06');

const OA_CORPUS: ObjetivoAprendizaje[] = [
  {
    id: 'id-oa-01',
    corpusVersionId: 'cv-1',
    codigo: 'MA01 OA 01',
    asignatura: 'Matemática',
    nivel: '1º básico',
    descripcion: 'Contar números del 0 al 100.',
    indicadores: ['Cuenta hacia adelante.', 'Cuenta hacia atrás.'],
    vigenciaDesde: null,
    vigenciaHasta: null, // vigente indefinidamente
  },
  {
    id: 'id-oa-02',
    corpusVersionId: 'cv-1',
    codigo: 'MA01 OA 02',
    asignatura: 'Matemática',
    nivel: '1º básico',
    descripcion: 'Identificar el orden de los elementos.',
    indicadores: [],
    vigenciaDesde: null,
    vigenciaHasta: new Date('2020-12-31'), // derogado en 2020
  },
  {
    id: 'id-oa-03',
    corpusVersionId: 'cv-1',
    codigo: 'MA01 OA 03',
    asignatura: 'Matemática',
    nivel: '1º básico',
    descripcion: 'Leer números del 0 al 20.',
    indicadores: [],
    vigenciaDesde: null,
    vigenciaHasta: null,
  },
];

const UNIDAD_VALIDA = {
  orden: 1,
  titulo: 'Unidad 1 — Contar',
  oaCodigos: ['MA01 OA 01', 'MA01 OA 03'],
};

const CABECERA = {
  establecimiento: 'Colegio Faro',
  asignatura: 'Matemática',
  nivel: '1º básico',
  corpusVersionId: 'cv-1',
};

// ---------------------------------------------------------------------------
// derivarContextoCascada
// ---------------------------------------------------------------------------

describe('derivarContextoCascada', () => {
  it('mapea correctamente los OA seleccionados', () => {
    const ctx = derivarContextoCascada(UNIDAD_VALIDA, CABECERA, OA_CORPUS, HOY);

    expect(ctx.establecimiento).toBe('Colegio Faro');
    expect(ctx.asignatura).toBe('Matemática');
    expect(ctx.nivel).toBe('1º básico');
    expect(ctx.unidadTitulo).toBe('Unidad 1 — Contar');
    expect(ctx.corpusVersionId).toBe('cv-1');
    expect(ctx.oaSeleccionados).toHaveLength(2);
    expect(ctx.oaSeleccionados[0]?.codigo).toBe('MA01 OA 01');
    expect(ctx.oaSeleccionados[0]?.categoria).toBe('basal');
    expect(ctx.oaSeleccionados[0]?.descripcion).toBe('Contar números del 0 al 100.');
    // OA 01 tiene indicadores → se incluyen
    expect(ctx.oaSeleccionados[0]?.indicadores).toEqual(['Cuenta hacia adelante.', 'Cuenta hacia atrás.']);
    // OA 03 no tiene indicadores → indicadores omitido (undefined)
    expect(ctx.oaSeleccionados[1]?.indicadores).toBeUndefined();
  });

  it('filtra oaSeleccionados solo a los oaCodigos de la unidad', () => {
    const unidadParcial = { ...UNIDAD_VALIDA, oaCodigos: ['MA01 OA 01'] };
    const ctx = derivarContextoCascada(unidadParcial, CABECERA, OA_CORPUS, HOY);

    expect(ctx.oaSeleccionados).toHaveLength(1);
    expect(ctx.oaSeleccionados[0]?.codigo).toBe('MA01 OA 01');
  });

  it('calcula vigencia correctamente en oaCorpusValidacion', () => {
    const ctx = derivarContextoCascada(UNIDAD_VALIDA, CABECERA, OA_CORPUS, HOY);

    // corpus completo: 3 OA
    expect(ctx.oaCorpusValidacion).toHaveLength(3);
    const v01 = ctx.oaCorpusValidacion?.find((o) => o.codigo === 'MA01 OA 01');
    const v02 = ctx.oaCorpusValidacion?.find((o) => o.codigo === 'MA01 OA 02');

    // OA 01: sin vigenciaHasta → vigente
    expect(v01?.vigente).toBe(true);
    // OA 02: vigenciaHasta = 2020-12-31, hoy es 2026 → no vigente
    expect(v02?.vigente).toBe(false);
  });

  it('lanza ReglaDominioError si un oaCodigo de la unidad no está en el corpus', () => {
    const unidadConOaFaltante = { ...UNIDAD_VALIDA, oaCodigos: ['MA01 OA 99'] };

    expect(() =>
      derivarContextoCascada(unidadConOaFaltante, CABECERA, OA_CORPUS, HOY),
    ).toThrow(ReglaDominioError);
  });
});

// ---------------------------------------------------------------------------
// Fakes de puertos para CrearPlanificacionAnualUseCase
// ---------------------------------------------------------------------------

function crearReloj(fecha: Date): ClockPort {
  return { hoy: () => fecha };
}

function crearFakeCorpusRepo(version: CorpusVersion | null): CorpusVersionRepository {
  return {
    crear: vi.fn(),
    buscarPorEtiqueta: vi.fn(),
    publicar: vi.fn(),
    obtenerPublicadaVigente: vi.fn().mockResolvedValue(version),
  };
}

function crearFakeOaRepo(oas: ObjetivoAprendizaje[]): OaRepository {
  return {
    porAsignaturaCurso: vi.fn().mockResolvedValue(oas),
    porIds: vi.fn().mockResolvedValue([]),
  };
}

function crearFakePlanRepo(planGuardado: PlanificacionAnualGuardada): PlanificacionAnualRepository {
  return {
    guardar: vi.fn().mockResolvedValue(planGuardado),
    actualizar: vi.fn().mockResolvedValue(planGuardado),
    obtener: vi.fn().mockResolvedValue(null),
    listar: vi.fn().mockResolvedValue([]),
    obtenerUnidad: vi.fn().mockResolvedValue(null),
  };
}

const VERSION_PUBLICADA: CorpusVersion = {
  id: 'cv-1',
  etiqueta: 'matematica-1basico-v1',
  estado: 'publicada',
  createdAt: new Date('2026-01-01'),
  publicadaAt: new Date('2026-01-02'),
};

// OA para el corpus que cubra todos los OA del plan de prueba.
const OA_CORPUS_GATE: ObjetivoAprendizaje[] = [
  {
    id: 'id-ma01-01',
    corpusVersionId: 'cv-1',
    codigo: 'MA01 OA 01',
    asignatura: 'Matemática',
    nivel: '1º básico',
    descripcion: 'Contar números del 0 al 100.',
    indicadores: [],
    vigenciaDesde: null,
    vigenciaHasta: null,
  },
  {
    id: 'id-ma01-02',
    corpusVersionId: 'cv-1',
    codigo: 'MA01 OA 02',
    asignatura: 'Matemática',
    nivel: '1º básico',
    descripcion: 'Identificar el orden de los elementos.',
    indicadores: [],
    vigenciaDesde: null,
    vigenciaHasta: null,
  },
];

const PLAN_VALIDO: PlanificacionAnual = {
  establecimiento: 'Colegio Faro',
  asignatura: 'Matemática',
  nivel: '1º básico',
  anio: 2026,
  unidades: [
    { orden: 1, titulo: 'Unidad 1', oaCodigos: ['MA01 OA 01'] },
    { orden: 2, titulo: 'Unidad 2', oaCodigos: ['MA01 OA 02'] },
  ],
};

const PLAN_GUARDADO: PlanificacionAnualGuardada = {
  ...PLAN_VALIDO,
  id: 'plan-id-1',
  corpusVersionId: 'cv-1',
};

// ---------------------------------------------------------------------------
// CrearPlanificacionAnualUseCase
// ---------------------------------------------------------------------------

describe('CrearPlanificacionAnualUseCase', () => {
  it('happy path: gate pasa → guarda y devuelve {ok: true}', async () => {
    const planRepo = crearFakePlanRepo(PLAN_GUARDADO);
    const uc = new CrearPlanificacionAnualUseCase(
      planRepo,
      crearFakeOaRepo(OA_CORPUS_GATE),
      crearFakeCorpusRepo(VERSION_PUBLICADA),
      crearReloj(HOY),
    );

    const resultado = await uc.ejecutar(PLAN_VALIDO);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.planificacion.id).toBe('plan-id-1');
    }
    expect(planRepo.guardar).toHaveBeenCalledOnce();
  });

  it('gate bloquea con OA inexistente → no guarda, devuelve {ok: false}', async () => {
    const planConOaFaltante: PlanificacionAnual = {
      ...PLAN_VALIDO,
      unidades: [{ orden: 1, titulo: 'U1', oaCodigos: ['MA01 OA 99'] }],
    };
    const planRepo = crearFakePlanRepo(PLAN_GUARDADO);
    const uc = new CrearPlanificacionAnualUseCase(
      planRepo,
      // Corpus sin 'MA01 OA 99' → el gate detectará el OA inexistente y bloqueará.
      crearFakeOaRepo(OA_CORPUS_GATE),
      crearFakeCorpusRepo(VERSION_PUBLICADA),
      crearReloj(HOY),
    );

    const resultado = await uc.ejecutar(planConOaFaltante);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.razon).toBe('gate');
      if (resultado.razon === 'gate') {
        expect(resultado.gate.ok).toBe(false);
        expect(resultado.gate.hallazgos.some((h) => h.regla === 'oa_existe')).toBe(true);
      }
    }
    // El repositorio NO debe haberse llamado.
    expect(planRepo.guardar).not.toHaveBeenCalled();
  });

  it('lanza ReglaDominioError si no hay corpus publicado', async () => {
    const uc = new CrearPlanificacionAnualUseCase(
      crearFakePlanRepo(PLAN_GUARDADO),
      crearFakeOaRepo([]),
      crearFakeCorpusRepo(null), // sin corpus vigente
      crearReloj(HOY),
    );

    // Verificar que lanza ReglaDominioError con la regla correcta.
    const error = await uc.ejecutar(PLAN_VALIDO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReglaDominioError);
    expect((error as ReglaDominioError).regla).toBe('sin_corpus');
  });

  it('lanza ReglaDominioError si el input no cumple el schema', async () => {
    const planInvalido = { ...PLAN_VALIDO, anio: 'no-es-numero' } as unknown as PlanificacionAnual;
    const uc = new CrearPlanificacionAnualUseCase(
      crearFakePlanRepo(PLAN_GUARDADO),
      crearFakeOaRepo(OA_CORPUS_GATE),
      crearFakeCorpusRepo(VERSION_PUBLICADA),
      crearReloj(HOY),
    );

    await expect(uc.ejecutar(planInvalido)).rejects.toThrow(ReglaDominioError);
  });
});

// ---------------------------------------------------------------------------
// EditarPlanificacionAnualUseCase
// ---------------------------------------------------------------------------

describe('EditarPlanificacionAnualUseCase', () => {
  it('no_encontrada: obtener devuelve null → resultado {ok:false, razon:"no_encontrada"} y NO se llama actualizar', async () => {
    const planRepo: PlanificacionAnualRepository = {
      guardar: vi.fn(),
      actualizar: vi.fn(),
      // obtener devuelve null → plan inexistente
      obtener: vi.fn().mockResolvedValue(null),
      listar: vi.fn().mockResolvedValue([]),
      obtenerUnidad: vi.fn().mockResolvedValue(null),
    };
    const uc = new EditarPlanificacionAnualUseCase(
      planRepo,
      crearFakeOaRepo(OA_CORPUS_GATE),
      crearFakeCorpusRepo(VERSION_PUBLICADA),
      crearReloj(HOY),
    );

    const resultado = await uc.ejecutar('id-inexistente', PLAN_VALIDO);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.razon).toBe('no_encontrada');
    }
    // actualizar NO debe llamarse si el plan no existe.
    expect(planRepo.actualizar).not.toHaveBeenCalled();
  });

  it('happy path: gate pasa → actualiza y devuelve {ok: true}', async () => {
    const planRepo: PlanificacionAnualRepository = {
      guardar: vi.fn(),
      actualizar: vi.fn().mockResolvedValue(PLAN_GUARDADO),
      // obtener devuelve el plan existente
      obtener: vi.fn().mockResolvedValue(PLAN_GUARDADO),
      listar: vi.fn().mockResolvedValue([]),
      obtenerUnidad: vi.fn().mockResolvedValue(null),
    };
    const uc = new EditarPlanificacionAnualUseCase(
      planRepo,
      crearFakeOaRepo(OA_CORPUS_GATE),
      crearFakeCorpusRepo(VERSION_PUBLICADA),
      crearReloj(HOY),
    );

    const resultado = await uc.ejecutar(PLAN_GUARDADO.id, PLAN_VALIDO);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.planificacion.id).toBe('plan-id-1');
    }
    expect(planRepo.actualizar).toHaveBeenCalledOnce();
  });

  it('gate bloquea → no actualiza, devuelve {ok:false, razon:"gate"}', async () => {
    const planConOaFaltante: PlanificacionAnual = {
      ...PLAN_VALIDO,
      unidades: [{ orden: 1, titulo: 'U1', oaCodigos: ['MA01 OA 99'] }],
    };
    const planRepo: PlanificacionAnualRepository = {
      guardar: vi.fn(),
      actualizar: vi.fn(),
      obtener: vi.fn().mockResolvedValue(PLAN_GUARDADO),
      listar: vi.fn().mockResolvedValue([]),
      obtenerUnidad: vi.fn().mockResolvedValue(null),
    };
    const uc = new EditarPlanificacionAnualUseCase(
      planRepo,
      crearFakeOaRepo(OA_CORPUS_GATE),
      crearFakeCorpusRepo(VERSION_PUBLICADA),
      crearReloj(HOY),
    );

    const resultado = await uc.ejecutar(PLAN_GUARDADO.id, planConOaFaltante);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.razon).toBe('gate');
      if (resultado.razon === 'gate') {
        expect(resultado.gate.ok).toBe(false);
      }
    }
    expect(planRepo.actualizar).not.toHaveBeenCalled();
  });
});
