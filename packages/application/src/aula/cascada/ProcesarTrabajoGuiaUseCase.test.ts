// Test del worker de guía del alumno (Tanda 1) sin red: doubles de JobRepository/OaRepository/uow.
// Verifica: camino feliz (toma job → carga OA del corpus → genera → persiste borrador 'guia' con
// origenId omitido → marcarHecho), error permanente (OA inexistente en corpus → fallido) y cola vacía.
// La generación se stubea (el motor tiene su propio test).

import type {
  DocumentoGenerado,
  JobRepository,
  NuevoDocumento,
  OaRepository,
  ObjetivoAprendizaje,
  ReposTransaccion,
  TrabajoGuia,
  UnidadDeTrabajo,
} from '@faro/domain';
import { describe, expect, it, vi } from 'vitest';
import { GenerarGuiaUseCase } from './GenerarGuiaUseCase.js';
import { ProcesarTrabajoGuiaUseCase } from './ProcesarTrabajoGuiaUseCase.js';

const OA: ObjetivoAprendizaje = {
  id: 'oa-1',
  corpusVersionId: 'cv-1',
  codigo: 'CN03 OA 01',
  asignatura: 'Ciencias Naturales',
  nivel: '3º básico',
  descripcion: 'Observar y describir los seres vivos.',
  indicadores: [],
  vigenciaDesde: null,
  vigenciaHasta: null,
};

const guiaIa = {
  asignatura: 'x',
  curso: 'x',
  oa: { codigo: 'x', descripcion: 'x' },
  conocimiento: 'x',
  perfil_nivel: '3-4' as const,
  titulo: 'x',
  explicacion: 'Los seres vivos nacen y crecen.',
  ejemplo: 'Un perro crece.',
  ejercicios: [
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender' as const,
      tipo: 'verdadero_falso' as const,
      enunciado: 'Un árbol es un ser vivo.',
      alternativas: [
        { texto: 'Verdadero', correcta: true },
        { texto: 'Falso', correcta: false },
      ],
      retroalimentacion: 'Los árboles crecen.',
    },
    {
      oa: 'CN03 OA 01',
      habilidad: 'recordar' as const,
      tipo: 'pictorico' as const,
      enunciado: '¿Cuántas hojas hay? Escribe el número.',
      imagen: 'cuatro hojas de árbol',
      retroalimentacion: 'Cuenta una por una.',
    },
  ],
};

function dobles() {
  const tomado: TrabajoGuia = {
    id: 'job-1',
    intentos: 1,
    usuarioId: 'u1',
    payload: {
      asignatura: 'Ciencias Naturales',
      nivel: '3º básico',
      oaCodigo: 'CN03 OA 01',
      conocimiento: 'Los seres vivos',
      establecimiento: 'Colegio Demo',
    },
  };
  let entregado = false;
  const jobs: Partial<JobRepository> = {
    tomarSiguienteGuia: vi.fn(async () => {
      if (entregado) return null;
      entregado = true;
      return tomado;
    }),
    marcarHecho: vi.fn(async () => {}),
    reintentar: vi.fn(async () => {}),
    marcarFallido: vi.fn(async () => {}),
  };
  const oas: OaRepository = {
    porAsignaturaCurso: vi.fn(async () => [OA]),
    porAsignaturaNivel: vi.fn(async () => [OA]),
    porIds: vi.fn(async () => [OA]),
  };
  // Captura los borradores creados con su tipo real (NuevoDocumento) para aseverar sin `any`.
  const borradores: NuevoDocumento[] = [];
  const crearBorrador = vi.fn(async (input: NuevoDocumento): Promise<DocumentoGenerado> => {
    borradores.push(input);
    return { id: 'doc-1' } as unknown as DocumentoGenerado;
  });
  const registrar = vi.fn(async () => {});
  const marcarHechoTx = vi.fn(async () => {});
  const uow: UnidadDeTrabajo = {
    enTransaccion: vi.fn(async (fn) =>
      fn({
        documentos: { crearBorrador },
        trazas: { registrar },
        jobs: { marcarHecho: marcarHechoTx },
      } as unknown as ReposTransaccion),
    ),
  };
  const ilustrador = { resolver: vi.fn(async () => null) } as unknown as import('./ResolverIlustracionUseCase.js').ResolverIlustracionUseCase;
  return { jobs, oas, uow, crearBorrador, registrar, borradores, ilustrador };
}

describe('ProcesarTrabajoGuiaUseCase', () => {
  it('toma un job, carga el OA, genera y persiste un borrador de guía + traza', async () => {
    const { jobs, oas, uow, crearBorrador, registrar, borradores, ilustrador } = dobles();
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas,
      generar: new GenerarGuiaUseCase({
        async generar(args) {
          const parsed = args.schema.parse(guiaIa);
          return {
            parsed,
            stopReason: 'end_turn',
            usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
            modelo: 'muestras',
          };
        },
      }),
      uow,
      ilustrador,
    });

    const r = await uc.ejecutarSiguiente('w-1');
    expect(r.tipo).toBe('hecho');
    expect(crearBorrador).toHaveBeenCalledOnce();
    const creado = borradores[0];
    expect(creado?.tipo).toBe('guia');
    expect(creado?.corpusVersionId).toBe('cv-1');
    expect(creado?.usuarioId).toBe('u1'); // tenancy: el documento nace con el usuarioId del job
    expect(registrar).toHaveBeenCalledOnce();
  });

  it('sin trabajo devuelve sin_trabajo', async () => {
    const { jobs, oas, uow, ilustrador } = dobles();
    (jobs.tomarSiguienteGuia as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas,
      generar: new GenerarGuiaUseCase({ async generar() { throw new Error('no'); } }),
      uow,
      ilustrador,
    });
    expect((await uc.ejecutarSiguiente('w-1')).tipo).toBe('sin_trabajo');
  });

  it('falla permanente (sin reintentar) si el nivel es tramo 1-2 (no soportado en Tanda 1)', async () => {
    // Un docente puede pedir guía desde una planificación de 1º/2º (la UI no filtra por tramo). El motor
    // lanza GeneracionError('guia_tramo_no_soportado') ANTES de llamar al LLM: es input permanente, no se
    // reintenta. Con intentos=1 (< maxIntentos) el camino transitorio daría 'reintenta'; este caso debe
    // dar 'fallido' directo y NO llamar a reintentar.
    const { jobs, oas, uow, ilustrador } = dobles();
    (jobs.tomarSiguienteGuia as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'job-12',
      intentos: 1,
      usuarioId: 'u1',
      payload: {
        asignatura: 'Ciencias Naturales',
        nivel: '1º básico',
        oaCodigo: 'CN03 OA 01',
        conocimiento: 'Los seres vivos',
        establecimiento: 'Colegio Demo',
      },
    });
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas, // porAsignaturaNivel devuelve [OA] → el OA existe; falla por el tramo, no por OA ausente
      generar: new GenerarGuiaUseCase({
        async generar() {
          throw new Error('el LLM no debe llamarse: el guard de tramo corta antes');
        },
      }),
      uow,
      ilustrador,
    });
    const r = await uc.ejecutarSiguiente('w-1');
    expect(r.tipo).toBe('fallido');
    expect(jobs.reintentar).not.toHaveBeenCalled();
    expect(jobs.marcarFallido).toHaveBeenCalledOnce();
  });

  it('resuelve la imagen de un ejercicio pictórico y persiste imagen_clave', async () => {
    const { jobs, oas, uow, borradores } = dobles();
    const ilustrador = { resolver: vi.fn(async () => 'beef5678') } as unknown as import('./ResolverIlustracionUseCase.js').ResolverIlustracionUseCase;
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas,
      generar: new GenerarGuiaUseCase({
        async generar(args) {
          return { parsed: args.schema.parse(guiaIa), stopReason: 'end_turn', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, modelo: 'muestras' };
        },
      }),
      uow,
      ilustrador,
    });

    const r = await uc.ejecutarSiguiente('w-1');
    expect(r.tipo).toBe('hecho');
    expect(ilustrador.resolver).toHaveBeenCalledWith('cuatro hojas de árbol', 'CN03 OA 01');
    const payload = borradores[0]?.payload as { ejercicios: Array<{ tipo: string; imagen_clave?: string }> };
    const pictorico = payload.ejercicios.find((e) => e.tipo === 'pictorico');
    expect(pictorico?.imagen_clave).toBe('beef5678');
  });

  it('falla permanente si el OA no existe en el corpus publicado', async () => {
    const { jobs, uow, ilustrador } = dobles();
    const oasVacio: OaRepository = {
      porAsignaturaCurso: vi.fn(async () => []),
      porAsignaturaNivel: vi.fn(async () => []),
      porIds: vi.fn(async () => []),
    };
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas: oasVacio,
      generar: new GenerarGuiaUseCase({ async generar() { throw new Error('no'); } }),
      uow,
      ilustrador,
    });
    const r = await uc.ejecutarSiguiente('w-1');
    expect(r.tipo).toBe('fallido');
  });
});
