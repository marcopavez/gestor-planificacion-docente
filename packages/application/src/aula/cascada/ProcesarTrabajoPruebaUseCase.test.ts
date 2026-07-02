// Test del worker de prueba formativa (Fase 4) sin red: fakes de JobRepository/DocumentoRepository/uow.
// Verifica el camino feliz (carga la unidad de origen → genera → persiste borrador 'prueba' con
// origen_id = la planificación → marcarHecho), el error permanente (planificación no encontrada → fallido,
// sin generar) y la cola vacía. La generación se stubea (el motor tiene su propio test).

import type {
  DocumentoGenerado,
  DocumentoRepository,
  JobRepository,
  NuevoDocumento,
  PlanificacionUnidad,
  Prueba,
  ReposTransaccion,
  TrabajoPrueba,
  UnidadDeTrabajo,
} from '@faro/domain';
import { describe, expect, it, vi } from 'vitest';
import type { GenerarPruebaFormativaUseCase } from './GenerarPruebaFormativaUseCase.js';
import { ProcesarTrabajoPruebaUseCase } from './ProcesarTrabajoPruebaUseCase.js';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';

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

const pruebaGenerada: Prueba = {
  asignatura: 'Ciencias Naturales',
  curso: '5º básico',
  tabla_especificaciones: [{ oa: 'CN05 OA 01', n_items: 1 }],
  items: [
    {
      oa: 'CN05 OA 01',
      habilidad: 'comprender',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuál es un ser vivo?',
      alternativas: [
        { texto: 'Un árbol', correcta: true },
        { texto: 'Una roca', correcta: false },
      ],
      retroalimentacion: 'Observa cuál crece y se alimenta.',
    },
    {
      oa: 'CN05 OA 01',
      habilidad: 'comprender',
      tipo: 'pictorico',
      enunciado: '¿Cuántos árboles ves? Escribe el número.',
      imagen: 'tres árboles en un patio',
      retroalimentacion: 'Cuenta uno por uno.',
    },
  ],
  pauta_correccion: 'Refuerza las características de los seres vivos.',
  tipo_evaluacion: 'formativa',
  perfil_nivel: '5-6',
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
  porId: Array<{ id: string; usuarioId: string }>;
}

function montar(opts: { doc: DocumentoGenerado | null; trabajos: (TrabajoPrueba | null)[]; claveIlustracion?: string | null }) {
  const llamadas: Llamadas = { generar: 0, hecho: [], fallido: [], crearBorrador: [], porId: [] };
  let i = 0;

  const jobs = {
    async tomarSiguientePrueba(): Promise<TrabajoPrueba | null> {
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
    // porId acota al dueño: el worker debe pasar el usuarioId del job (INV-5, tenancy).
    async porId(id: string, usuarioId: string): Promise<DocumentoGenerado | null> {
      llamadas.porId.push({ id, usuarioId });
      return id === PLAN_DOC_ID ? opts.doc : null;
    },
  } as unknown as DocumentoRepository;

  const generar = {
    async ejecutarConMeta(_u: PlanificacionUnidad) {
      llamadas.generar++;
      return {
        valor: pruebaGenerada,
        meta: { modelo: 'muestras', stopReason: 'end_turn', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 } },
      };
    },
  } as unknown as GenerarPruebaFormativaUseCase;

  // uow: ejecuta la fn con repos fake; crearBorrador devuelve un doc con id fijo.
  const uow: UnidadDeTrabajo = {
    async enTransaccion<T>(fn: (repos: ReposTransaccion) => Promise<T>): Promise<T> {
      const repos = {
        documentos: {
          async crearBorrador(input: NuevoDocumento): Promise<DocumentoGenerado> {
            llamadas.crearBorrador.push(input);
            return { ...planDoc(), id: 'prueba-doc-1', tipo: input.tipo, origenId: input.origenId ?? null };
          },
        } as unknown as DocumentoRepository,
        trazas: { async registrar(): Promise<void> {} },
        jobs,
      } as unknown as ReposTransaccion;
      return fn(repos);
    },
  };

  const ilustrador = {
    resolver: vi.fn(async () => opts.claveIlustracion ?? null),
  } as unknown as ResolverIlustracionUseCase;

  const uc = new ProcesarTrabajoPruebaUseCase({ jobs, documentos, generar, uow, ilustrador });
  return { uc, llamadas, ilustrador };
}

describe('ProcesarTrabajoPruebaUseCase (Fase 4, worker sin red)', () => {
  it('camino feliz: carga la unidad, genera, persiste borrador "prueba" con origen_id = la planificación', async () => {
    const job: TrabajoPrueba = { id: 'job-1', payload: { planificacionDocumentoId: PLAN_DOC_ID }, intentos: 1, usuarioId: 'u1' };
    const { uc, llamadas } = montar({ doc: planDoc(), trabajos: [job] });

    const r = await uc.ejecutarSiguiente('worker-1');

    expect(r).toEqual({ tipo: 'hecho', jobId: 'job-1', documentoId: 'prueba-doc-1' });
    expect(llamadas.generar).toBe(1);
    expect(llamadas.hecho).toEqual([{ id: 'job-1', docId: 'prueba-doc-1' }]);
    // El borrador nace tipo 'prueba', cuelga de la planificación (origen_id) y reusa su corpus_version.
    const creado = llamadas.crearBorrador[0];
    expect(creado?.tipo).toBe('prueba');
    expect(creado?.origenId).toBe(PLAN_DOC_ID);
    expect(creado?.corpusVersionId).toBe('cv-2026.1');
    expect(creado?.establecimientoId).toBe('Colegio Demo');
    expect(creado?.payload).toEqual(pruebaGenerada);
    // Tenancy: el documento nace con el usuarioId del job y la lectura del plan se acota al dueño.
    expect(creado?.usuarioId).toBe('u1');
    expect(llamadas.porId).toEqual([{ id: PLAN_DOC_ID, usuarioId: 'u1' }]);
  });

  it('planificación de origen no encontrada → fallido (permanente), sin generar', async () => {
    const job: TrabajoPrueba = { id: 'job-2', payload: { planificacionDocumentoId: PLAN_DOC_ID }, intentos: 1, usuarioId: 'u1' };
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

  it('resuelve las imágenes de los ítems pictóricos y persiste imagen_clave (#3 imágenes)', async () => {
    const job: TrabajoPrueba = { id: 'job-img', payload: { planificacionDocumentoId: PLAN_DOC_ID }, intentos: 1, usuarioId: 'u1' };
    const { uc, llamadas, ilustrador } = montar({ doc: planDoc(), trabajos: [job], claveIlustracion: 'cafe1234' });

    const r = await uc.ejecutarSiguiente('worker-1');

    expect(r.tipo).toBe('hecho');
    // El ilustrador se llamó con la descripción del ítem pictórico y el primer OA de la unidad.
    expect(ilustrador.resolver).toHaveBeenCalledWith('tres árboles en un patio', 'CN05 OA 01');
    // El payload persistido lleva la clave resuelta en el ítem pictórico.
    const payload = llamadas.crearBorrador[0]?.payload as { items: Array<{ tipo: string; imagen_clave?: string }> };
    const pictorico = payload.items.find((i) => i.tipo === 'pictorico');
    expect(pictorico?.imagen_clave).toBe('cafe1234');
  });
});
