import { describe, expect, it, vi } from 'vitest';
import type {
  BancoImagenesGeneradasPort,
  DocumentoGenerado,
  ImageGenPort,
  JobRepository,
  LlmPort,
  NuevoDocumento,
  ObjetivoAprendizaje,
  OaRepository,
  ReposTransaccion,
  SalidaEstructurada,
  TrabajoMaterialColorear,
  UnidadDeTrabajo,
} from '@faro/domain';
import { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import { GenerarMaterialColorearUseCase } from './GenerarMaterialColorearUseCase.js';
import { ProcesarTrabajoMaterialColorearUseCase } from './ProcesarTrabajoMaterialColorearUseCase.js';

const OA = {
  codigo: 'MA01 OA 01',
  descripcion: 'Contar del 0 al 20',
  indicadores: [],
  corpusVersionId: 'cv-1',
} as unknown as ObjetivoAprendizaje;

function llmConDescripcion(): LlmPort {
  return {
    async generar(): Promise<SalidaEstructurada<never>> {
      return {
        parsed: { concepto: 'conteo', descripcion_en: 'ten apples' } as never,
        stopReason: 'end_turn',
        usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
        modelo: 'fake',
      };
    },
  };
}
const imageGen: ImageGenPort = { generarLineArt: async () => Buffer.from([1]) };
const banco: BancoImagenesGeneradasPort = { buscar: async () => null, guardar: async () => undefined };

// Job repo doble: una cola con un trabajo, luego vacía.
function jobsConUno(trabajo: TrabajoMaterialColorear, sink: { hecho?: string; fallo?: string }): JobRepository {
  let entregado = false;
  return {
    async tomarSiguienteMaterialColorear() {
      if (entregado) return null;
      entregado = true;
      return trabajo;
    },
    async marcarHecho(_id: string, docId: string) {
      sink.hecho = docId;
    },
    async marcarFallido(_id: string, error: string) {
      sink.fallo = error;
    },
    async reintentar() {},
    // métodos no usados por este test:
  } as unknown as JobRepository;
}

function oasCon(oa: ObjetivoAprendizaje | null): OaRepository {
  return {
    async porAsignaturaNivel() {
      return oa ? [oa] : [];
    },
  } as unknown as OaRepository;
}

// uow doble: ejecuta la fn con repos en memoria, devuelve un id fijo.
// `creado.marcarHecho` captura la llamada a repos.jobs.marcarHecho dentro de la transacción.
function uowFake(creado: { doc?: NuevoDocumento; marcarHecho?: { jobId: string; documentoId: string } }): UnidadDeTrabajo {
  return {
    async enTransaccion(fn) {
      const repos: ReposTransaccion = {
        documentos: {
          async crearBorrador(input: NuevoDocumento): Promise<DocumentoGenerado> {
            creado.doc = input;
            return { id: 'doc-1' } as DocumentoGenerado;
          },
        },
        trazas: { async registrar() {} },
        jobs: {
          async marcarHecho(jobId: string, documentoId: string) {
            // Registra la llamada para que el test pueda verificarla.
            creado.marcarHecho = { jobId, documentoId };
          },
        },
      } as unknown as ReposTransaccion;
      return fn(repos);
    },
  } as UnidadDeTrabajo;
}

function nuevoUseCase(jobs: JobRepository, oas: OaRepository, uow: UnidadDeTrabajo): ProcesarTrabajoMaterialColorearUseCase {
  const generar = new GenerarMaterialColorearUseCase({
    descripcion: new GenerarDescripcionDibujoUseCase(llmConDescripcion()),
    imageGen,
    banco,
  });
  return new ProcesarTrabajoMaterialColorearUseCase({ jobs, oas, generar, uow });
}

const TRABAJO: TrabajoMaterialColorear = {
  id: 'job-1',
  payload: { establecimiento: 'Colegio X', asignatura: 'Matemática', nivel: '1° básico', oaCodigo: 'MA01 OA 01' },
  intentos: 1,
};

describe('ProcesarTrabajoMaterialColorearUseCase', () => {
  it('happy path: persiste un material_colorear borrador y marca el job hecho', async () => {
    const sink: { hecho?: string } = {};
    const creado: { doc?: NuevoDocumento; marcarHecho?: { jobId: string; documentoId: string } } = {};
    const uc = nuevoUseCase(jobsConUno(TRABAJO, sink), oasCon(OA), uowFake(creado));
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('hecho');
    expect(creado.doc?.tipo).toBe('material_colorear');
    expect(creado.doc?.corpusVersionId).toBe('cv-1');
    // Verifica que marcarHecho se llamó dentro de la transacción (sobre repos.jobs, no el outer JobRepository).
    expect(creado.marcarHecho).toStrictEqual({ jobId: 'job-1', documentoId: 'doc-1' });
  });

  it('sin trabajo → sin_trabajo', async () => {
    const uc = nuevoUseCase(
      { async tomarSiguienteMaterialColorear() { return null; } } as unknown as JobRepository,
      oasCon(OA),
      uowFake({}),
    );
    expect((await uc.ejecutarSiguiente('w1')).tipo).toBe('sin_trabajo');
  });

  it('OA no existe en el corpus → fallido (permanente)', async () => {
    const sink: { fallo?: string } = {};
    const uc = nuevoUseCase(jobsConUno(TRABAJO, sink), oasCon(null), uowFake({}));
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('fallido');
  });

  it('grado > 3 → fallido permanente (sin reintento)', async () => {
    const sink: { fallo?: string } = {};
    const trabajo4 = { ...TRABAJO, payload: { ...TRABAJO.payload, nivel: '5° básico' } };
    const reintentar = vi.fn();
    const jobs = { ...jobsConUno(trabajo4, sink), reintentar } as unknown as JobRepository;
    const uc = nuevoUseCase(jobs, oasCon({ ...OA }), uowFake({}));
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('fallido');
    expect(reintentar).not.toHaveBeenCalled();
  });
});
