'use client';

// Flujo asíncrono de producción (H-PA.9): elegir una unidad de una PlanificacionAnual existente →
// Generar (encola la cascada) → polling del estado del job → ver los 4 borradores persistidos +
// descargar el .pptx. A diferencia del demo síncrono de /aula, aquí la generación corre en el
// worker (ADR-003): la web encola y consulta estado, nunca bloquea.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClaseDeck,
  PlanificacionAnualGuardada,
  PlanificacionClase,
  PlanificacionUnidad,
  Prueba,
  UnidadPlanificadaGuardada,
} from '@faro/domain';

type EstadoJob = 'pendiente' | 'en_proceso' | 'hecho' | 'fallido';

interface DocumentosCascada {
  unidad: PlanificacionUnidad | null;
  clase: PlanificacionClase | null;
  prueba: Prueba | null;
  deck: ClaseDeck | null;
}

interface RespuestaEstado {
  estado: EstadoJob;
  intentos: number;
  error: string | null;
  documentos?: DocumentosCascada;
  deckDocId?: string | null;
}

// Tope de polling: ~2 min (60 sondeos × 2s) antes de rendirse para no sondear indefinidamente.
const INTERVALO_POLL_MS = 1800;
const MAX_SONDEOS = 70;

const ETIQUETA_ESTADO: Record<EstadoJob, string> = {
  pendiente: 'En cola…',
  en_proceso: 'Generando…',
  hecho: 'Listo',
  fallido: 'Falló',
};

export default function ProduccionPage(): React.ReactElement {
  const [establecimiento, setEstablecimiento] = useState('Colegio Faro');
  const [planes, setPlanes] = useState<PlanificacionAnualGuardada[]>([]);
  const [planId, setPlanId] = useState('');
  const [unidadId, setUnidadId] = useState('');
  const [cargandoPlanes, setCargandoPlanes] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoJob | null>(null);
  const [documentos, setDocumentos] = useState<DocumentosCascada | null>(null);
  const [deckDocId, setDeckDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref al intervalo activo para poder limpiarlo en el cleanup del efecto / al re-generar.
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const detenerPolling = useCallback((): void => {
    if (intervaloRef.current !== null) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  }, []);

  // Limpieza al desmontar: nunca dejar un intervalo colgado.
  useEffect(() => detenerPolling, [detenerPolling]);

  async function cargarPlanes(): Promise<void> {
    setCargandoPlanes(true);
    setError(null);
    try {
      const r = await fetch(`/api/aula/planificaciones?establecimiento=${encodeURIComponent(establecimiento)}`);
      const data: unknown = await r.json();
      if (!r.ok) throw new Error(mensajeError(data));
      const lista = (data as { planificaciones: PlanificacionAnualGuardada[] }).planificaciones;
      setPlanes(lista);
      const primero = lista[0];
      setPlanId(primero?.id ?? '');
      setUnidadId(primero?.unidades[0]?.id ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las planificaciones.');
      setPlanes([]);
    } finally {
      setCargandoPlanes(false);
    }
  }

  const plan = planes.find((p) => p.id === planId) ?? null;
  const unidades: UnidadPlanificadaGuardada[] = plan?.unidades ?? [];

  function cambiarPlan(id: string): void {
    setPlanId(id);
    const p = planes.find((x) => x.id === id);
    setUnidadId(p?.unidades[0]?.id ?? '');
  }

  function iniciarPolling(idJob: string): void {
    detenerPolling();
    let sondeos = 0;
    intervaloRef.current = setInterval(() => {
      sondeos += 1;
      if (sondeos > MAX_SONDEOS) {
        detenerPolling();
        setError('La generación está tardando demasiado. Revisa que el worker esté corriendo.');
        return;
      }
      void sondear(idJob);
    }, INTERVALO_POLL_MS);
  }

  async function sondear(idJob: string): Promise<void> {
    try {
      const r = await fetch(`/api/aula/generaciones/${idJob}`);
      const data: unknown = await r.json();
      if (!r.ok) throw new Error(mensajeError(data));
      const resp = data as RespuestaEstado;
      setEstado(resp.estado);
      if (resp.estado === 'hecho') {
        detenerPolling();
        setDocumentos(resp.documentos ?? null);
        setDeckDocId(resp.deckDocId ?? null);
      } else if (resp.estado === 'fallido') {
        detenerPolling();
        setError(resp.error ?? 'La generación falló en el worker.');
      }
    } catch (e) {
      detenerPolling();
      setError(e instanceof Error ? e.message : 'Error consultando el estado.');
    }
  }

  async function generar(): Promise<void> {
    if (!unidadId) return;
    setError(null);
    setDocumentos(null);
    setDeckDocId(null);
    setEstado(null);
    setJobId(null);
    try {
      const r = await fetch('/api/aula/generaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unidadPlanificadaId: unidadId }),
      });
      const data: unknown = await r.json();
      if (!r.ok) throw new Error(mensajeError(data));
      const idJob = (data as { jobId: string }).jobId;
      setJobId(idJob);
      setEstado('pendiente');
      iniciarPolling(idJob);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al encolar la generación.');
    }
  }

  return (
    <main className="faro-page">
      <header className="faro-header">
        <h1 className="faro-title">Faro · Generación asíncrona</h1>
        <p className="faro-subtitle">
          Encola la cascada desde una unidad de tu planificación anual; el worker genera los borradores y aquí ves el avance.
        </p>
      </header>

      <section className="faro-card">
        <label className="field field--wide">
          <span className="field__label">Establecimiento</span>
          <input className="field__control" value={establecimiento} onChange={(e) => setEstablecimiento(e.target.value)} />
        </label>
        <button
          onClick={() => void cargarPlanes()}
          disabled={cargandoPlanes || establecimiento.trim().length === 0}
          className="btn btn--secondary"
        >
          {cargandoPlanes ? 'Cargando…' : 'Cargar planificaciones'}
        </button>

        {planes.length > 0 && (
          <>
            <label className="field">
              <span className="field__label">Planificación</span>
              <select className="field__control" value={planId} onChange={(e) => cambiarPlan(e.target.value)}>
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.asignatura} · {p.nivel} · {p.anio}
                  </option>
                ))}
              </select>
            </label>

            {/* Sin input de texto libre para nivel: las unidades vienen del corpus/planificación (gotcha º/°). */}
            <label className="field">
              <span className="field__label">Unidad</span>
              <select className="field__control" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.orden}. {u.titulo} ({u.oaCodigos.join(', ')})
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={() => void generar()}
              disabled={!unidadId || estado === 'pendiente' || estado === 'en_proceso'}
              className="btn btn--primary"
            >
              Generar cascada
            </button>
          </>
        )}

        {planes.length === 0 && !cargandoPlanes && (
          <p className="form-hint">No hay planificaciones para este establecimiento. Crea una vía POST /api/aula/planificaciones.</p>
        )}
      </section>

      {jobId && estado && (
        <div className="job-card">
          <span>Job</span>
          <span className="job-card__id">{jobId}</span>
          <span>
            — {ETIQUETA_ESTADO[estado]}
            {(estado === 'pendiente' || estado === 'en_proceso') && ' ⏳'}
            {estado === 'hecho' && ' ✅'}
            {estado === 'fallido' && ' ⛔'}
          </span>
        </div>
      )}

      {error && <p className="note note--error">⚠ {error}</p>}

      {documentos && <Resultados documentos={documentos} deckDocId={deckDocId} />}
    </main>
  );
}

function mensajeError(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    return String((data as { error: unknown }).error);
  }
  return 'Error en la solicitud.';
}

function Resultados({ documentos, deckDocId }: { documentos: DocumentosCascada; deckDocId: string | null }): React.ReactElement {
  const { unidad, clase, prueba, deck } = documentos;
  return (
    <>
      <h2 className="faro-result-heading">Borradores generados</h2>
      <p className="result-intro">
        Todos nacen <strong>borrador</strong> y requieren revisión docente (human-in-the-loop).
      </p>

      {unidad && (
        <section className="faro-card">
          <h3 className="section-title">📘 Planificación de Unidad</h3>
          <p>
            <strong>{unidad.unidad}</strong>
            <br />
            <span className="text-muted">
              {unidad.asignatura} · {unidad.nivel} · {unidad.duracion_semanas} semanas · {unidad.horas_pedagogicas} hrs
            </span>
          </p>
          <p>{unidad.proposito}</p>
          <ul>
            {unidad.oa.map((o) => (
              <li key={o.codigo}>
                <strong>{o.codigo}</strong> — {o.descripcion}
              </li>
            ))}
          </ul>
        </section>
      )}

      {clase && (
        <section className="faro-card">
          <h3 className="section-title">🗓 Planificación de Clases ({clase.clases.length})</h3>
          {clase.clases.map((c) => (
            <div key={c.numero} className="clase-item">
              <p className="clase-item__title">
                Clase {c.numero} · {c.objetivo_clase} <span className="clase-item__duration">({c.duracion_min} min)</span>
              </p>
            </div>
          ))}
        </section>
      )}

      {prueba && (
        <section className="faro-card">
          <h3 className="section-title">📝 Prueba ({prueba.items.length} ítems · perfil {prueba.perfil_nivel})</h3>
          <ol>
            {prueba.items.map((it, i) => (
              <li key={i} className="prueba-item">
                <span>{it.enunciado}</span> <span className="prueba-item__meta">{it.oa} · {it.puntaje} pts</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {deck && (
        <section className="faro-card faro-card--surface">
          <h3 className="section-title">📽 Deck de la clase · {deck.slides.length} diapositivas</h3>
          <p className="text-muted">{deck.titulo}</p>
          {deckDocId ? (
            <div className="download-row">
              <a href={`/api/aula/documentos/${deckDocId}/pptx`} className="btn btn--success">
                ⬇ Descargar .pptx
              </a>
            </div>
          ) : (
            <p className="text-muted">El .pptx no está disponible.</p>
          )}
        </section>
      )}
    </>
  );
}
