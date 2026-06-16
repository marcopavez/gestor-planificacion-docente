'use client';

// Superficie de revisión humana (HIL — RF-PA.12, CA-PA.5, H-PA.10).
// Un revisor: (1) lista documentos pendientes ('borrador'/'en_revision') de un establecimiento;
// (2) abre uno y ve su contenido + panel de gates; (3) lo envía a revisión, aprueba o rechaza.
// INV-3: aprobar exige identificar al revisor (autorHumano); la transición la decide la máquina
// del dominio en el servidor — la UI solo dispara la acción y refleja el resultado.

import { useState } from 'react';
import type {
  ClaseDeck,
  Hallazgo,
  PlanificacionClase,
  PlanificacionUnidad,
  Prueba,
  ReporteGates,
  ResultadoGate,
} from '@faro/domain';

type EstadoRevision = 'borrador' | 'en_revision' | 'aprobado' | 'rechazado';

interface ItemPendiente {
  id: string;
  tipo: string;
  estadoRevision: EstadoRevision;
  createdAt: string;
}

interface Detalle {
  id: string;
  tipo: string;
  estadoRevision: EstadoRevision;
  autorHumano: string | null;
  contenido: unknown;
  resultadoGates: ReporteGates | null;
  createdAt: string;
}

const ETIQUETA_ESTADO: Record<EstadoRevision, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

// Mapeo estado → variante de badge del sistema de diseño (oro/turquesa/verde/coral).
const BADGE_ESTADO: Record<EstadoRevision, string> = {
  borrador: 'badge--draft',
  en_revision: 'badge--review',
  aprobado: 'badge--approved',
  rechazado: 'badge--rejected',
};

const ETIQUETA_TIPO: Record<string, string> = {
  planificacion_unidad: '📘 Planificación de Unidad',
  planificacion_clase: '🗓 Planificación de Clases',
  prueba: '📝 Prueba',
  clase_deck: '📽 Deck de la clase',
};

function mensajeError(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    return String((data as { error: unknown }).error);
  }
  return 'Error en la solicitud.';
}

export default function RevisionPage(): React.ReactElement {
  const [establecimiento, setEstablecimiento] = useState('Colegio Faro');
  const [pendientes, setPendientes] = useState<ItemPendiente[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [revisor, setRevisor] = useState('');
  const [accionando, setAccionando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargarPendientes(): Promise<void> {
    setCargandoLista(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch(`/api/aula/revision?establecimiento=${encodeURIComponent(establecimiento)}`);
      const data: unknown = await r.json();
      if (!r.ok) throw new Error(mensajeError(data));
      setPendientes((data as { documentos: ItemPendiente[] }).documentos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los pendientes.');
      setPendientes([]);
    } finally {
      setCargandoLista(false);
    }
  }

  async function abrir(id: string): Promise<void> {
    setError(null);
    setAviso(null);
    setRevisor('');
    try {
      const r = await fetch(`/api/aula/revision/${id}`);
      const data: unknown = await r.json();
      if (!r.ok) throw new Error(mensajeError(data));
      setDetalle(data as Detalle);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el documento.');
      setDetalle(null);
    }
  }

  // Ejecuta una acción HIL (enviar/aprobar/rechazar) y refresca lista + detalle.
  async function ejecutarAccion(accion: 'enviar' | 'aprobar' | 'rechazar'): Promise<void> {
    if (detalle === null) return;
    setAccionando(true);
    setError(null);
    setAviso(null);
    try {
      const init: RequestInit =
        accion === 'aprobar'
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ autorHumano: revisor }),
            }
          : { method: 'POST' };
      const r = await fetch(`/api/aula/revision/${detalle.id}/${accion}`, init);
      const data: unknown = await r.json();
      if (!r.ok) {
        // Mensajes de R3 más legibles para el revisor.
        if (r.status === 409) throw new Error('El documento no está en un estado que permita esta acción.');
        if (r.status === 422) throw new Error('Identifica al revisor antes de aprobar.');
        throw new Error(mensajeError(data));
      }
      const nuevo = (data as { documento: Detalle }).documento;
      setDetalle(nuevo);
      // Limpia el revisor tras una acción exitosa para no arrastrar el email a otro documento.
      setRevisor('');
      setAviso(`Documento actualizado a "${ETIQUETA_ESTADO[nuevo.estadoRevision]}".`);
      // El doc revisado puede salir de pendientes (aprobado/rechazado) → refrescamos la lista.
      await cargarPendientes();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setAccionando(false);
    }
  }

  return (
    <main className="faro-page">
      <header className="faro-header">
        <h1 className="faro-title">Faro · Revisión (human-in-the-loop)</h1>
        <p className="faro-subtitle">
          Revisa los borradores generados, comprueba los gates y aprueba o rechaza. Ningún documento llega a{' '}
          <strong>aprobado</strong> sin un revisor identificado.
        </p>
      </header>

      <section className="faro-card">
        <label className="field field--wide">
          <span className="field__label">Establecimiento</span>
          <input className="field__control" value={establecimiento} onChange={(e) => setEstablecimiento(e.target.value)} />
        </label>
        <button
          onClick={() => void cargarPendientes()}
          disabled={cargandoLista || establecimiento.trim().length === 0}
          className="btn btn--secondary"
        >
          {cargandoLista ? 'Cargando…' : 'Cargar pendientes'}
        </button>

        {pendientes.length > 0 && (
          <ul className="doc-list">
            {pendientes.map((d) => (
              <li key={d.id} className="doc-row">
                <span className="doc-row__label">{ETIQUETA_TIPO[d.tipo] ?? d.tipo}</span>
                <BadgeEstado estado={d.estadoRevision} />
                <span className="doc-row__date">{new Date(d.createdAt).toLocaleString('es-CL')}</span>
                <button onClick={() => void abrir(d.id)} className="btn btn--secondary">
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        )}

        {pendientes.length === 0 && !cargandoLista && (
          <p className="form-hint">No hay documentos pendientes de revisión para este establecimiento.</p>
        )}
      </section>

      {aviso && <p className="note note--success">✅ {aviso}</p>}
      {error && <p className="note note--error">⚠ {error}</p>}

      {detalle && (
        <DetalleDocumento
          detalle={detalle}
          revisor={revisor}
          setRevisor={setRevisor}
          accionando={accionando}
          onAccion={(a) => void ejecutarAccion(a)}
        />
      )}
    </main>
  );
}

function BadgeEstado({ estado }: { estado: EstadoRevision }): React.ReactElement {
  return <span className={`badge ${BADGE_ESTADO[estado]}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

function DetalleDocumento({
  detalle,
  revisor,
  setRevisor,
  accionando,
  onAccion,
}: {
  detalle: Detalle;
  revisor: string;
  setRevisor: (v: string) => void;
  accionando: boolean;
  onAccion: (a: 'enviar' | 'aprobar' | 'rechazar') => void;
}): React.ReactElement {
  const { estadoRevision } = detalle;
  return (
    <>
      <h2 className="faro-result-heading">
        {ETIQUETA_TIPO[detalle.tipo] ?? detalle.tipo} <BadgeEstado estado={estadoRevision} />
      </h2>

      <ContenidoArtefacto tipo={detalle.tipo} contenido={detalle.contenido} />

      <PanelGates gates={detalle.resultadoGates} />

      <section className="faro-card faro-card--surface">
        <h3 className="section-title">Acciones de revisión</h3>

        {estadoRevision === 'borrador' && (
          <button onClick={() => onAccion('enviar')} disabled={accionando} className="btn btn--primary">
            Enviar a revisión
          </button>
        )}

        {estadoRevision === 'en_revision' && (
          <div className="hil-actions">
            <input
              className="field__control hil-actions__email"
              value={revisor}
              onChange={(e) => setRevisor(e.target.value)}
              placeholder="prof.garcia@colegio.cl"
              aria-label="Revisor (email)"
            />
            <button
              onClick={() => onAccion('aprobar')}
              disabled={accionando || revisor.trim().length === 0}
              className="btn btn--success"
            >
              Aprobar
            </button>
            <button onClick={() => onAccion('rechazar')} disabled={accionando} className="btn btn--danger">
              Rechazar
            </button>
          </div>
        )}

        {(estadoRevision === 'aprobado' || estadoRevision === 'rechazado') && (
          <p className="text-muted">
            Documento <strong>{ETIQUETA_ESTADO[estadoRevision].toLowerCase()}</strong> (solo lectura).
            {estadoRevision === 'aprobado' && detalle.autorHumano && (
              <>
                {' '}Revisor: <strong>{detalle.autorHumano}</strong>.
              </>
            )}
          </p>
        )}
      </section>
    </>
  );
}

// --- Panel de gates (reusa la forma de aula/page.tsx: por gate, hallazgos con severidad) ---

function PanelGate({ titulo, gate }: { titulo: string; gate: ResultadoGate }): React.ReactElement {
  return (
    <div className={`gate ${gate.ok ? 'gate--ok' : 'gate--block'}`}>
      <p className="gate__title">
        {gate.ok ? '✅' : '⛔'} {titulo}
        {gate.hallazgos.length === 0 && <span className="gate__title-note"> — sin observaciones</span>}
      </p>
      {gate.hallazgos.length > 0 && (
        <ul>
          {gate.hallazgos.map((h: Hallazgo, i: number) => (
            <li key={i} className="gate__finding">
              <span className={`sev ${h.severidad === 'bloquea' ? 'sev--block' : 'sev--warn'}`}>{h.severidad}</span>
              {h.mensaje}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PanelGates({ gates }: { gates: ReporteGates | null }): React.ReactElement {
  if (gates === null) {
    return (
      <section className="faro-card">
        <h3 className="section-title">Validación</h3>
        <p className="text-muted">Sin reporte de gates.</p>
      </section>
    );
  }
  return (
    <section className={`faro-card ${gates.ok ? 'faro-card--ok' : 'faro-card--error'}`}>
      <h3 className="section-title">{gates.ok ? '✅ Validación: lista para revisar' : '⛔ Validación: hallazgos bloqueantes'}</h3>
      <p className="gates-desc">
        Chequeos deterministas (no IA): cobertura de OA, ítem→OA, puntajes y citas al currículum vigente.
      </p>
      <PanelGate titulo="Planificación (cobertura OA, indicadores, duración)" gate={gates.planificacion} />
      <PanelGate titulo="Prueba (ítem→OA, una correcta, puntajes)" gate={gates.pedagogica} />
      <PanelGate titulo="Citas (OA existe + vigente en el corpus)" gate={gates.citas} />
    </section>
  );
}

// --- Render del contenido por tipo (reusa la forma de produccion/page.tsx) ---

function ContenidoArtefacto({ tipo, contenido }: { tipo: string; contenido: unknown }): React.ReactElement {
  if (contenido === null || contenido === undefined) {
    return (
      <section className="faro-card">
        <p className="text-muted">Sin contenido.</p>
      </section>
    );
  }
  switch (tipo) {
    case 'planificacion_unidad':
      return <VistaUnidad unidad={contenido as PlanificacionUnidad} />;
    case 'planificacion_clase':
      return <VistaClase clase={contenido as PlanificacionClase} />;
    case 'prueba':
      return <VistaPrueba prueba={contenido as Prueba} />;
    case 'clase_deck':
      return <VistaDeck deck={contenido as ClaseDeck} />;
    default:
      return (
        <section className="faro-card">
          <pre className="text-xs" style={{ overflowX: 'auto' }}>
            {JSON.stringify(contenido, null, 2)}
          </pre>
        </section>
      );
  }
}

function VistaUnidad({ unidad }: { unidad: PlanificacionUnidad }): React.ReactElement {
  return (
    <section className="faro-card">
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
  );
}

function VistaClase({ clase }: { clase: PlanificacionClase }): React.ReactElement {
  return (
    <section className="faro-card">
      <p>
        <strong>{clase.clases.length} clases</strong>
      </p>
      {clase.clases.map((c) => (
        <div key={c.numero} className="clase-item">
          <p className="clase-item__title">
            Clase {c.numero} · {c.objetivo_clase} <span className="clase-item__duration">({c.duracion_min} min)</span>
          </p>
        </div>
      ))}
    </section>
  );
}

function VistaPrueba({ prueba }: { prueba: Prueba }): React.ReactElement {
  return (
    <section className="faro-card">
      <p>
        <strong>
          {prueba.items.length} ítems · perfil {prueba.perfil_nivel}
        </strong>
      </p>
      <ol>
        {prueba.items.map((it, i) => (
          <li key={i} className="prueba-item">
            <span>{it.enunciado}</span> <span className="prueba-item__meta">{it.oa} · {it.puntaje} pts</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function VistaDeck({ deck }: { deck: ClaseDeck }): React.ReactElement {
  return (
    <section className="faro-card faro-card--surface">
      <p>
        <strong>{deck.titulo}</strong>
      </p>
      <p className="text-muted">{deck.slides.length} diapositivas</p>
      <ul className="deck-slides">
        {deck.slides.map((s, i) => (
          <li key={i}>
            <em>{s.momento}</em> <strong>{s.titulo}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
