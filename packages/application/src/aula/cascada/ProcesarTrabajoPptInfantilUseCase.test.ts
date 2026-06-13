// Test del worker de PPT infantil (Fase 3) sin red: fakes de JobRepository/DocumentoRepository/uow.
// Verifica el camino feliz (carga la unidad de origen → genera → persiste borrador 'clase_deck' con
// origen_id = la planificación → marcarHecho), el error permanente (planificación no encontrada → fallido,
// sin generar) y la cola vacía. La generación se stubea (el motor tiene su propio test). Sin gate: el
// deck lo valida su propio schema, por eso el borrador nace 'validado' y sin resultadoGates.

import type {
  ClaseDeck,
  DocumentoGenerado,
  DocumentoRepository,
  JobRepository,
  NuevoDocumento,
  PlanificacionUnidad,
  ReposTransaccion,
  TrabajoPptInfantil,
  UnidadDeTrabajo,
} from '@faro/domain';
import { describe, expect, it } from 'vitest';
import type { GenerarPptInfantilUseCase } from './GenerarPptInfantilUseCase.js';
import { ProcesarTrabajoPptInfantilUseCase } from './ProcesarTrabajoPptInfantilUseCase.js';

const PLAN_DOC_ID = '11111111-1111-1111-1111-111111111111';

function unidadMuestra(): PlanificacionUnidad {
  return {
    plantilla: 'A',
    establecimiento: 'Colegio Demo',
    asignatura: 'Ciencias Naturales',
    nivel: '5º básico',
    unidad: 'Unidad 1: Los seres vivos',
    proposito: 'Reconocer características de los seres vivos.',
    duracion_semanas: 4,
    horas_pedagogicas: 8,
    oa: [
      { codigo: 'CN05 OA 01', categoria: 'basal', descripcion: 'Reconocer seres vivos.', detalle: [], habilidades: ['Observar'] },
    ],
    experiencias: ['Observación en el patio.'],
    indicadores_evaluacion: [{ oa: 'CN05 OA 01', texto: 'Distinguen seres vivos.', fuente: 'ia_borrador' }],
    evaluacion: { tipo: ['formativa'], instrumentos: ['Lista de cotejo'] },
    extras: {},
  };
}

const deckGenerado: ClaseDeck = {
  titulo: 'Unidad 1: Los seres vivos · PPT infantil',
  asignatura: 'Ciencias Naturales',
  nivel: '5º básico',
  oa: ['CN05 OA 01'],
  tramo_edad: '5-6',
  slides: [
    {
      momento: 'inicio',
      titulo: '¿Qué es un ser vivo?',
      contenido: ['Crece y cambia', 'Se alimenta'],
      notas_docente: 'Activa conocimientos previos con ejemplos del patio.',
      tipo: 'contenido',
      opciones: [],
    },
  ],
};

/** Documento de planificación de origen (tipo correcto, contenido válido, corpus_version presente). */
function planDoc(): DocumentoGenerado {
  return {
    id: PLAN_DOC_ID,
    establecimientoId: 'Colegio Demo',
    tipo: 'planificacion_unidad',
    corpusVersionId: 'cv-2026.1',
    origenId: null,
    contenido: unidadMuestra(),
    citas: [],
    estadoRevision: 'borrador',
    estadoGeneracion: 'validado',
    autorHumano: null,
    resultadoGates: null,
    createdAt: new Date(0),
    aprobadoAt: null,
  };
}

interface Llamadas {
  generar: number;
  hecho: Array<{ id: string; docId: string }>;
  fallido: Array<{ id: string; error: string }>;
  crearBorrador: NuevoDocumento[];
}

function montar(opts: { doc: DocumentoGenerado | null; trabajos: (TrabajoPptInfantil | null)[] }) {
  const llamadas: Llamadas = { generar: 0, hecho: [], fallido: [], crearBorrador: [] };
  let i = 0;

  const jobs = {
    async tomarSiguientePptInfantil(): Promise<TrabajoPptInfantil | null> {
      return opts.trabajos[i++] ?? null;
    },
    async marcarHecho(id: string, docId: string): Promise<void> {
      llamadas.hecho.push({ id, docId });
    },
    async marcarFallido(id: string, error: string): Promise<void> {
      llamadas.fallido.push({ id, error });
    },
    async reintentar(): Promise<void> {},
  } as unknown as JobRepository;

  const documentos = {
    async porId(id: string): Promise<DocumentoGenerado | null> {
      return id === PLAN_DOC_ID ? opts.doc : null;
    },
  } as unknown as DocumentoRepository;

  const generar = {
    async ejecutarConMeta(_u: PlanificacionUnidad) {
      llamadas.generar++;
      return {
        valor: deckGenerado,
        meta: { modelo: 'muestras', stopReason: 'end_turn', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 } },
      };
    },
  } as unknown as GenerarPptInfantilUseCase;

  // uow: ejecuta la fn con repos fake; crearBorrador devuelve un doc con id fijo.
  const uow: UnidadDeTrabajo = {
    async enTransaccion<T>(fn: (repos: ReposTransaccion) => Promise<T>): Promise<T> {
      const repos = {
        documentos: {
          async crearBorrador(input: NuevoDocumento): Promise<DocumentoGenerado> {
            llamadas.crearBorrador.push(input);
            return { ...planDoc(), id: 'deck-doc-1', tipo: input.tipo, origenId: input.origenId ?? null };
          },
        } as unknown as DocumentoRepository,
        trazas: { async registrar(): Promise<void> {} },
        jobs,
      } as unknown as ReposTransaccion;
      return fn(repos);
    },
  };

  const uc = new ProcesarTrabajoPptInfantilUseCase({ jobs, documentos, generar, uow });
  return { uc, llamadas };
}

describe('ProcesarTrabajoPptInfantilUseCase (Fase 3, worker sin red)', () => {
  it('camino feliz: carga la unidad, genera, persiste borrador "clase_deck" con origen_id = la planificación', async () => {
    const job: TrabajoPptInfantil = { id: 'job-1', payload: { planificacionDocumentoId: PLAN_DOC_ID }, intentos: 1 };
    const { uc, llamadas } = montar({ doc: planDoc(), trabajos: [job] });

    const r = await uc.ejecutarSiguiente('worker-1');

    expect(r).toEqual({ tipo: 'hecho', jobId: 'job-1', documentoId: 'deck-doc-1' });
    expect(llamadas.generar).toBe(1);
    expect(llamadas.hecho).toEqual([{ id: 'job-1', docId: 'deck-doc-1' }]);
    // El borrador nace tipo 'clase_deck', cuelga de la planificación (origen_id) y reusa su corpus_version.
    const creado = llamadas.crearBorrador[0];
    expect(creado?.tipo).toBe('clase_deck');
    expect(creado?.origenId).toBe(PLAN_DOC_ID);
    expect(creado?.corpusVersionId).toBe('cv-2026.1');
    expect(creado?.establecimientoId).toBe('Colegio Demo');
    expect(creado?.payload).toBe(deckGenerado);
    // Sin gate del deck: nace 'validado' y sin resultadoGates.
    expect(creado?.estadoGeneracion).toBe('validado');
    expect(creado?.resultadoGates).toBeUndefined();
  });

  it('planificación de origen no encontrada → fallido (permanente), sin generar', async () => {
    const job: TrabajoPptInfantil = { id: 'job-2', payload: { planificacionDocumentoId: PLAN_DOC_ID }, intentos: 1 };
    const { uc, llamadas } = montar({ doc: null, trabajos: [job] });

    const r = await uc.ejecutarSiguiente('worker-1');

    expect(r.tipo).toBe('fallido');
    expect(llamadas.generar).toBe(0);
    expect(llamadas.fallido[0]?.id).toBe('job-2');
  });

  it('cola vacía → sin_trabajo', async () => {
    const { uc } = montar({ doc: planDoc(), trabajos: [null] });
    expect(await uc.ejecutarSiguiente('worker-1')).toEqual({ tipo: 'sin_trabajo' });
  });
});
