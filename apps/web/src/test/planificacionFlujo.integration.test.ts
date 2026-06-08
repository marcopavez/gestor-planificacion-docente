// e2e del flujo de planificación (H-2.7, CA-2.5) sobre pglite real, sin levantar Next: siembra el
// singleton de produccion.ts con una conexión pglite y ejercita los route handlers a mano, más el
// worker (ProcesarTrabajoPlanificacionUseCase). Cubre: generar (async) → editar un campo ia_borrador
// → enviar → aprobar (exige autor) → exportar .docx. Plantillas/catálogos/OA reales (corpus + DB).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BorradorPlanificacionIa, LlmPort } from '@faro/domain';
import { GenerarPlanificacionUseCase, ProcesarTrabajoPlanificacionUseCase } from '@faro/application';
import { CatalogoRepositoryCorpus, PlantillaRepositoryCorpus } from '@faro/infra-corpus';
import {
  corpusVersion,
  documentoGenerado,
  jobGeneracion,
  objetivoAprendizaje,
  planificacionAnual,
  trazaIa,
  unidadPlanificada,
  JobRepositoryDrizzle,
  OaRepositoryDrizzle,
  UnidadDeTrabajoDrizzle,
  type DrizzleDb,
} from '@faro/infra-db';
import { crearLoggerHijo } from '@faro/observability';
// Handlers por ruta relativa (el alias @/ mapea solo a src/; los handlers viven en app/).
import { POST as postGenerar } from '../../app/api/aula/planificacion/route';
import { GET as getEstado } from '../../app/api/aula/planificacion/[jobId]/route';
import { PUT as putDocumento } from '../../app/api/aula/documentos/[id]/route';
import { GET as getRevision } from '../../app/api/aula/revision/[id]/route';
import { POST as postEnviar } from '../../app/api/aula/revision/[id]/enviar/route';
import { POST as postAprobar } from '../../app/api/aula/revision/[id]/aprobar/route';
import { GET as getDocx } from '../../app/api/aula/documentos/[id]/docx/route';

const T = 60_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../../../packages/infra-db/migrations');
const CORPUS_DIR = join(__dirname, '../../../../corpus');
const MIGRATIONS = ['0000_robust_mulholland_black.sql', '0001_glorious_tinkerer.sql'];
const CLAVE = Symbol.for('faro.web.produccion.db');
const log = crearLoggerHijo('web-planif-test');

const ESTABLECIMIENTO = 'Escuela General José Alejandro Bernales D-114';
const OA = [
  { codigo: 'MA01 OA 03', descripcion: 'Leer números del 0 al 20 y representarlos.' },
  { codigo: 'MA01 OA 04', descripcion: 'Comparar y ordenar números del 0 al 20.' },
];

const schema = { corpusVersion, objetivoAprendizaje, planificacionAnual, unidadPlanificada, documentoGenerado, trazaIa, jobGeneracion };

function fakeLlm(): LlmPort {
  const borrador: BorradorPlanificacionIa = {
    proposito: 'Leer y comparar números hasta el 20 con material concreto.',
    experiencias: ['Cuentan colecciones de objetos.', 'Comparan dos cantidades.'],
    indicadores: OA.map((o) => ({ oa: o.codigo, texto: `Indicador para ${o.codigo}.` })),
    seleccion_checkboxes: { metodologias_activas: ['Gamificación'] },
  };
  return {
    async generar(args) {
      const parsed = args.schema.parse(borrador);
      return { parsed, stopReason: 'end_turn', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, modelo: 'fake' };
    },
  };
}

let db: DrizzleDb;
let jobId: string;
let documentoId: string;

describe('Flujo de planificación e2e (pglite real, sin Next)', () => {
  beforeAll(async () => {
    const pg = new PGlite();
    for (const archivo of MIGRATIONS) {
      const sqlText = readFileSync(join(MIGRATIONS_DIR, archivo), 'utf-8');
      for (const stmt of sqlText.split('--> statement-breakpoint').map((s) => s.trim()).filter((s) => s.length > 0)) {
        await pg.exec(stmt);
      }
    }
    db = drizzle(pg, { schema }) as unknown as DrizzleDb;
    (globalThis as Record<symbol, unknown>)[CLAVE] = { db, pool: {} as unknown };

    // Corpus: una versión publicada + los OA de Matemática 1º básico (datos fijos para el gate/FK).
    const [cv] = await db.insert(corpusVersion).values({ etiqueta: 'v1-mate-1b', estado: 'publicada' }).returning();
    if (!cv) throw new Error('no corpus_version');
    const oaRepo = new OaRepositoryDrizzle(db);
    await oaRepo.ingestar(OA.map((o) => ({ corpusVersionId: cv.id, codigo: o.codigo, asignatura: 'Matemática', nivel: '1º básico', descripcion: o.descripcion, indicadores: [] })));
  }, T);

  afterAll(() => {
    delete (globalThis as Record<symbol, unknown>)[CLAVE];
  });

  it('POST /planificacion encola un job (202)', async () => {
    const req = new Request('http://t/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        establecimiento: ESTABLECIMIENTO,
        asignatura: 'Matemática',
        nivel: '1º básico',
        unidad: 'Unidad 1',
        plantilla: 'A',
        oaCodigos: OA.map((o) => o.codigo),
        duracion_semanas: 6,
        horas_pedagogicas: 36,
      }),
    });
    const res = await postGenerar(req);
    expect(res.status).toBe(202);
    jobId = ((await res.json()) as { jobId: string }).jobId;
    expect(typeof jobId).toBe('string');
  }, T);

  it('el worker genera y persiste el borrador (estado hecho)', async () => {
    const catalogos = await new CatalogoRepositoryCorpus(CORPUS_DIR, log).catalogos();
    const generar = new GenerarPlanificacionUseCase({
      oas: new OaRepositoryDrizzle(db),
      plantillas: new PlantillaRepositoryCorpus(CORPUS_DIR, log),
      llm: fakeLlm(),
      catalogos,
    });
    const useCase = new ProcesarTrabajoPlanificacionUseCase({
      jobs: new JobRepositoryDrizzle(db),
      generar,
      catalogos,
      uow: new UnidadDeTrabajoDrizzle(db),
    });
    const r = await useCase.ejecutarSiguiente('w');
    expect(r.tipo).toBe('hecho');
  }, T);

  it('GET /planificacion/[jobId]: hecho → contenido (plan) + nace borrador', async () => {
    const res = await getEstado(new Request('http://t/'), { params: Promise.resolve({ jobId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      estado: string;
      documentoId: string;
      estadoRevision: string;
      contenido: { oa: Array<{ codigo: string; descripcion: string }>; proposito?: string };
    };
    expect(body.estado).toBe('hecho');
    expect(body.estadoRevision).toBe('borrador'); // INV-3: nace borrador
    documentoId = body.documentoId;
    // CA-2.3: los OA del documento son idénticos al corpus.
    expect(body.contenido.oa.map((o) => o.codigo)).toEqual(OA.map((o) => o.codigo));
    expect(body.contenido.oa[0]?.descripcion).toBe(OA[0]!.descripcion);
  });

  it('CA-2.5: editar un campo ia_borrador (PUT) y verlo reflejado en la revisión', async () => {
    const detalle = await getRevision(new Request('http://t/'), { params: Promise.resolve({ id: documentoId }) });
    const plan = ((await detalle.json()) as { contenido: Record<string, unknown> }).contenido;
    const editado = { ...plan, proposito: 'PROPÓSITO EDITADO POR EL DOCENTE.' };

    const put = await putDocumento(
      new Request('http://t/', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editado) }),
      { params: Promise.resolve({ id: documentoId }) },
    );
    expect(put.status).toBe(200);

    const detalle2 = await getRevision(new Request('http://t/'), { params: Promise.resolve({ id: documentoId }) });
    const body2 = (await detalle2.json()) as { contenido: { proposito?: string } };
    expect(body2.contenido.proposito).toBe('PROPÓSITO EDITADO POR EL DOCENTE.');

    // Los OA son datos fijos (RF-2.5/CA-2.3): alterarlos en una edición se rechaza (422).
    const conOaAlterado = {
      ...(body2.contenido as Record<string, unknown>),
      oa: (plan as { oa: Array<Record<string, unknown>> }).oa.map((o, i) => (i === 0 ? { ...o, descripcion: 'OA REESCRITO POR EL CLIENTE' } : o)),
    };
    const putOa = await putDocumento(
      new Request('http://t/', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conOaAlterado) }),
      { params: Promise.resolve({ id: documentoId }) },
    );
    expect(putOa.status).toBe(422);
  });

  it('CA-2.5: a aprobado solo con autor (enviar → aprobar)', async () => {
    const enviar = await postEnviar(new Request('http://t/', { method: 'POST' }), { params: Promise.resolve({ id: documentoId }) });
    expect(enviar.status).toBe(200);

    // Aprobar sin autor → 400 (body inválido). Con autor → aprobado.
    const sinAutor = await postAprobar(
      new Request('http://t/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autorHumano: '' }) }),
      { params: Promise.resolve({ id: documentoId }) },
    );
    expect(sinAutor.status).toBe(400);

    const conAutor = await postAprobar(
      new Request('http://t/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autorHumano: 'prof@colegio.cl' }) }),
      { params: Promise.resolve({ id: documentoId }) },
    );
    expect(conAutor.status).toBe(200);
    const doc = ((await conAutor.json()) as { documento: { estadoRevision: string } }).documento;
    expect(doc.estadoRevision).toBe('aprobado');
  });

  it('INV-3: un documento aprobado ya no se puede editar (409)', async () => {
    const detalle = await getRevision(new Request('http://t/'), { params: Promise.resolve({ id: documentoId }) });
    const plan = ((await detalle.json()) as { contenido: Record<string, unknown> }).contenido;
    const put = await putDocumento(
      new Request('http://t/', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...plan, proposito: 'INTENTO POST-APROBACIÓN' }) }),
      { params: Promise.resolve({ id: documentoId }) },
    );
    expect(put.status).toBe(409);
  });

  it('CA-2.1: exporta un .docx no vacío (refleja la edición)', async () => {
    const res = await getDocx(new Request('http://t/'), { params: Promise.resolve({ id: documentoId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('wordprocessingml');
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  }, T);
});
