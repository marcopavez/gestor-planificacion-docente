// packages/application/src/aula/RevisarDocumentoUseCase.test.ts
// Unit (sin DB ni LLM): la revisión HIL transiciona vía la máquina del dominio y SOLO persiste
// cuando la máquina acepta. Fake repo en memoria que registra las llamadas a actualizarEstadoRevision.

import { describe, it, expect } from 'vitest';
import type { DocumentoGenerado, DocumentoRepository, EstadoRevision } from '@faro/domain';
import { RevisarDocumentoUseCase } from './RevisarDocumentoUseCase.js';

// Fake repo: implementa el puerto pero solo lo que el use case usa (porId + actualizarEstadoRevision).
// Registra cada llamada a actualizar para verificar que NUNCA se persiste en transición ilegal.
class FakeDocumentoRepository implements DocumentoRepository {
  public actualizaciones: Array<{
    id: string;
    estado: EstadoRevision;
    autorHumano: string | null;
    usuarioId: string;
  }> = [];
  // Registra cada lectura por (id, usuarioId) para verificar que el use case SIEMPRE acota por dueño.
  public lecturas: Array<{ id: string; usuarioId: string }> = [];

  constructor(private readonly docs: Map<string, DocumentoGenerado & { usuarioId: string }>) {}

  async porId(id: string, usuarioId: string): Promise<DocumentoGenerado | null> {
    this.lecturas.push({ id, usuarioId });
    const doc = this.docs.get(id);
    // Un documento ajeno (usuarioId distinto) se ve como inexistente — mismo contrato que el adapter real.
    if (!doc || doc.usuarioId !== usuarioId) return null;
    return doc;
  }

  async actualizarEstadoRevision(
    id: string,
    estado: EstadoRevision,
    autorHumano: string | null,
    usuarioId: string,
  ): Promise<void> {
    this.actualizaciones.push({ id, estado, autorHumano, usuarioId });
    const doc = this.docs.get(id);
    if (doc) {
      // Reflejamos la mutación para que el re-read del use case devuelva el nuevo estado.
      this.docs.set(id, { ...doc, estadoRevision: estado, autorHumano });
    }
  }

  // Métodos del puerto no usados por este use case — no deben invocarse en estos tests.
  // Sin parámetros: TS permite implementar con menos args y evita 'no-unused-vars'.
  async crearBorrador(): Promise<DocumentoGenerado> {
    throw new Error('no usado');
  }
  async marcarGeneracion(): Promise<void> {
    throw new Error('no usado');
  }
  async listarPorRaiz(): Promise<DocumentoGenerado[]> {
    throw new Error('no usado');
  }
  async listarPendientesRevision(): Promise<DocumentoGenerado[]> {
    throw new Error('no usado');
  }
}

const USUARIO = 'usuario-1';
const OTRO_USUARIO = 'usuario-2';

function docFalso(
  id: string,
  estadoRevision: EstadoRevision,
  usuarioId: string = USUARIO,
): DocumentoGenerado & { usuarioId: string } {
  return {
    id,
    establecimientoId: 'Colegio Test',
    tipo: 'prueba',
    contenido: { items: [] },
    citas: [],
    estadoRevision,
    estadoGeneracion: 'validado',
    autorHumano: null,
    resultadoGates: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    aprobadoAt: null,
    usuarioId,
  };
}

function conDoc(doc: DocumentoGenerado & { usuarioId: string }): {
  repo: FakeDocumentoRepository;
  uc: RevisarDocumentoUseCase;
} {
  const repo = new FakeDocumentoRepository(new Map([[doc.id, doc]]));
  return { repo, uc: new RevisarDocumentoUseCase(repo) };
}

describe('RevisarDocumentoUseCase', () => {
  it('aprobar un documento en_revision con autor → ok, estado aprobado, persiste (aprobado, autor, usuarioId)', async () => {
    const { repo, uc } = conDoc(docFalso('d1', 'en_revision'));

    const r = await uc.aprobar('d1', 'prof.garcia@colegio.cl', USUARIO);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.documento.estadoRevision).toBe('aprobado');
      expect(r.documento.autorHumano).toBe('prof.garcia@colegio.cl');
    }
    expect(repo.actualizaciones).toEqual([
      { id: 'd1', estado: 'aprobado', autorHumano: 'prof.garcia@colegio.cl', usuarioId: USUARIO },
    ]);
    // El use case SIEMPRE lee acotado por el usuarioId del caller (tenancy).
    expect(repo.lecturas.every((l) => l.usuarioId === USUARIO)).toBe(true);
  });

  it('aprobar sin autor (vacío) → transicion_invalida/aprobacion_sin_humano y NUNCA persiste (INV-3)', async () => {
    const { repo, uc } = conDoc(docFalso('d1', 'en_revision'));

    const r = await uc.aprobar('d1', '   ', USUARIO); // solo espacios: la máquina lo trata como vacío.

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.razon).toBe('transicion_invalida');
      if (r.razon === 'transicion_invalida') {
        expect(r.regla).toBe('aprobacion_sin_humano');
      }
    }
    // La máquina rechazó → actualizarEstadoRevision NUNCA se llamó.
    expect(repo.actualizaciones).toEqual([]);
  });

  it('aprobar desde borrador → transicion_invalida (regla transicion_invalida) y no persiste', async () => {
    const { repo, uc } = conDoc(docFalso('d1', 'borrador'));

    const r = await uc.aprobar('d1', 'prof.garcia@colegio.cl', USUARIO);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.razon).toBe('transicion_invalida');
      if (r.razon === 'transicion_invalida') {
        expect(r.regla).toBe('transicion_invalida');
      }
    }
    expect(repo.actualizaciones).toEqual([]);
  });

  it('porId devuelve null → no_encontrado y no persiste', async () => {
    const repo = new FakeDocumentoRepository(new Map());
    const uc = new RevisarDocumentoUseCase(repo);

    const r = await uc.aprobar('inexistente', 'prof.garcia@colegio.cl', USUARIO);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.razon).toBe('no_encontrado');
    expect(repo.actualizaciones).toEqual([]);
  });

  it('aprobar un documento de OTRO usuario → no_encontrado y NO muta (tenancy, INV-5)', async () => {
    const { repo, uc } = conDoc(docFalso('d1', 'en_revision', OTRO_USUARIO));

    const r = await uc.aprobar('d1', 'prof.garcia@colegio.cl', USUARIO);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.razon).toBe('no_encontrado');
    // El documento ajeno nunca se toca: ni lectura exitosa ni escritura.
    expect(repo.actualizaciones).toEqual([]);
  });

  it('rechazar un documento en_revision → ok, estado rechazado, autorHumano null', async () => {
    const { repo, uc } = conDoc(docFalso('d1', 'en_revision'));

    const r = await uc.rechazar('d1', USUARIO);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.documento.estadoRevision).toBe('rechazado');
      expect(r.documento.autorHumano).toBeNull();
    }
    expect(repo.actualizaciones).toEqual([
      { id: 'd1', estado: 'rechazado', autorHumano: null, usuarioId: USUARIO },
    ]);
  });

  it('enviarARevision desde borrador → ok, estado en_revision', async () => {
    const { repo, uc } = conDoc(docFalso('d1', 'borrador'));

    const r = await uc.enviarARevision('d1', USUARIO);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.documento.estadoRevision).toBe('en_revision');
    expect(repo.actualizaciones).toEqual([
      { id: 'd1', estado: 'en_revision', autorHumano: null, usuarioId: USUARIO },
    ]);
  });
});
