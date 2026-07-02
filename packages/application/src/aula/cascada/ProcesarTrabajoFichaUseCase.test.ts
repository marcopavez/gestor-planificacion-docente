import { describe, expect, it, vi } from 'vitest';
import type { JobRepository, OaRepository, ReposTransaccion, UnidadDeTrabajo, Ficha } from '@faro/domain';
import { GeneracionError } from '@faro/domain';
import { ProcesarTrabajoFichaUseCase } from './ProcesarTrabajoFichaUseCase.js';
import type { GenerarFichaUseCase } from './GenerarFichaUseCase.js';

const oa = { codigo: 'MA01 OA 01', descripcion: 'Contar.', indicadores: [] as string[], corpusVersionId: 'cv-1' };
const ficha = { asignatura: 'Matemática', curso: '1º básico', oa: { codigo: oa.codigo, descripcion: oa.descripcion }, concepto: 'frutas', perfil_nivel: '1-2', titulo: 'Ficha para colorear: frutas', consigna_dibujo: 'Colorea el dibujo.', ejercicios: [], descripcion_dibujo: 'apples', imagen_clave: 'abcd1234' } as unknown as Ficha;
const META = { modelo: 'fake', usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 }, stopReason: 'end_turn' };

function jobsCon(job: { id: string; payload: unknown; intentos: number; usuarioId: string } | null) {
  return {
    tomarSiguienteFicha: vi.fn(async () => job),
    marcarHecho: vi.fn(async () => {}),
    reintentar: vi.fn(async () => {}),
    marcarFallido: vi.fn(async () => {}),
  } as unknown as JobRepository;
}
const oas = { porAsignaturaNivel: vi.fn(async () => [oa]) } as unknown as OaRepository;
function uowQueCaptura(sink: { hecho?: { jobId: string; documentoId: string } }): UnidadDeTrabajo {
  return {
    enTransaccion: vi.fn(async (fn: (r: ReposTransaccion) => Promise<unknown>) => {
      const repos = {
        documentos: { crearBorrador: vi.fn(async () => ({ id: 'doc-1' })) },
        trazas: { registrar: vi.fn(async () => {}) },
        jobs: { marcarHecho: vi.fn(async (id: string, docId: string) => { sink.hecho = { jobId: id, documentoId: docId }; }) },
      } as unknown as ReposTransaccion;
      return fn(repos);
    }),
  } as unknown as UnidadDeTrabajo;
}
const generarOk = { ejecutarConMeta: vi.fn(async () => ({ valor: ficha, meta: META })) } as unknown as GenerarFichaUseCase;

const payload = { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: '1º básico', oaCodigo: 'MA01 OA 01' };

describe('ProcesarTrabajoFichaUseCase', () => {
  it('sin trabajo → sin_trabajo', async () => {
    const uc = new ProcesarTrabajoFichaUseCase({ jobs: jobsCon(null), oas, generar: generarOk, uow: uowQueCaptura({}) });
    expect(await uc.ejecutarSiguiente('w1')).toEqual({ tipo: 'sin_trabajo' });
  });

  it('happy path: persiste borrador + traza y marca el job hecho', async () => {
    const sink: { hecho?: { jobId: string; documentoId: string } } = {};
    const uc = new ProcesarTrabajoFichaUseCase({ jobs: jobsCon({ id: 'job-1', payload, intentos: 1, usuarioId: 'u1' }), oas, generar: generarOk, uow: uowQueCaptura(sink) });
    const r = await uc.ejecutarSiguiente('w1');
    expect(r).toEqual({ tipo: 'hecho', jobId: 'job-1', documentoId: 'doc-1' });
    expect(sink.hecho).toEqual({ jobId: 'job-1', documentoId: 'doc-1' });
  });

  it('OA inexistente → fallido permanente', async () => {
    const oasVacio = { porAsignaturaNivel: vi.fn(async () => []) } as unknown as OaRepository;
    const jobs = jobsCon({ id: 'job-2', payload, intentos: 1, usuarioId: 'u1' });
    const uc = new ProcesarTrabajoFichaUseCase({ jobs, oas: oasVacio, generar: generarOk, uow: uowQueCaptura({}) });
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('fallido');
    expect(jobs.marcarFallido).toHaveBeenCalledOnce();
  });

  it('ficha_tramo_no_soportado → fallido permanente (no reintenta)', async () => {
    const jobs = jobsCon({ id: 'job-3', payload, intentos: 0, usuarioId: 'u1' });
    const generar = { ejecutarConMeta: vi.fn(async () => { throw new GeneracionError('ficha_tramo_no_soportado'); }) } as unknown as GenerarFichaUseCase;
    const uc = new ProcesarTrabajoFichaUseCase({ jobs, oas, generar, uow: uowQueCaptura({}) });
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('fallido');
    expect(jobs.reintentar).not.toHaveBeenCalled();
  });

  it('fuga_texto → reintento transitorio (intentos < max)', async () => {
    const jobs = jobsCon({ id: 'job-4', payload, intentos: 1, usuarioId: 'u1' });
    const generar = { ejecutarConMeta: vi.fn(async () => { throw new GeneracionError('fuga_texto:enunciado#0(1200)'); }) } as unknown as GenerarFichaUseCase;
    const uc = new ProcesarTrabajoFichaUseCase({ jobs, oas, generar, uow: uowQueCaptura({}) });
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('reintenta');
    expect(jobs.reintentar).toHaveBeenCalledOnce();
  });

  it('OA con indicadores no-vacíos: crearBorrador recibe shape correcto y job queda hecho', async () => {
    // OA con indicadores: ejercita la rama `...(oa.indicadores.length > 0 ? { indicadores } : {})`
    const oaConIndicadores = { codigo: 'MA01 OA 01', descripcion: 'Contar.', indicadores: ['Reconoce cantidades.'], corpusVersionId: 'cv-1' };
    const oasConInd = { porAsignaturaNivel: vi.fn(async () => [oaConIndicadores]) } as unknown as OaRepository;

    const sink: { hecho?: { jobId: string; documentoId: string }; crearBorrador?: unknown } = {};
    const uow: UnidadDeTrabajo = {
      enTransaccion: vi.fn(async (fn: (r: ReposTransaccion) => Promise<unknown>) => {
        const repos = {
          documentos: {
            crearBorrador: vi.fn(async (input: unknown) => {
              sink.crearBorrador = input;
              return { id: 'doc-2' };
            }),
          },
          trazas: { registrar: vi.fn(async () => {}) },
          jobs: { marcarHecho: vi.fn(async (id: string, docId: string) => { sink.hecho = { jobId: id, documentoId: docId }; }) },
        } as unknown as ReposTransaccion;
        return fn(repos);
      }),
    } as unknown as UnidadDeTrabajo;

    const uc = new ProcesarTrabajoFichaUseCase({ jobs: jobsCon({ id: 'job-5', payload, intentos: 1, usuarioId: 'u1' }), oas: oasConInd, generar: generarOk, uow });
    const r = await uc.ejecutarSiguiente('w1');

    expect(r).toEqual({ tipo: 'hecho', jobId: 'job-5', documentoId: 'doc-2' });
    expect(sink.hecho).toEqual({ jobId: 'job-5', documentoId: 'doc-2' });
    // Shape de persistencia: tipo, estadoGeneracion, corpusVersionId correctos; sin origenId (ficha standalone).
    expect(sink.crearBorrador).toMatchObject({
      tipo: 'ficha_colorear',
      estadoGeneracion: 'validado',
      corpusVersionId: 'cv-1',
      usuarioId: 'u1', // tenancy: el documento nace con el usuarioId del job
    });
    expect((sink.crearBorrador as Record<string, unknown>)['origenId']).toBeUndefined();
  });
});
