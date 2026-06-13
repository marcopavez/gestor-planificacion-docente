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

const COLOR = { borde: '#d0d7de', acento: '#1A237E', suave: '#57606a', fondo: '#f6f8fa' };
const card: React.CSSProperties = { border: `1px solid ${COLOR.borde}`, borderRadius: 8, padding: 16, marginBottom: 16 };

const ETIQUETA_ESTADO: Record<EstadoRevision, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

const COLOR_ESTADO: Record<EstadoRevision, string> = {
  borrador: '#fff8c5',
  en_revision: '#ddf4ff',
  aprobado: '#dafbe1',
  rechazado: '#ffeef0',
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
    <main style={{ maxWidth: 920, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#1f2328' }}>
      <h1 style={{ color: COLOR.acento, marginBottom: 4 }}>Faro · Revisión (human-in-the-loop)</h1>
      <p style={{ color: COLOR.suave, marginTop: 0 }}>
        Revisa los borradores generados, comprueba los gates y aprueba o rechaza. Ningún documento llega a{' '}
        <strong>aprobado</strong> sin un revisor identificado.
      </p>

      <section style={{ ...card, marginTop: 16 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
          Establecimiento
          <input
            value={establecimiento}
            onChange={(e) => setEstablecimiento(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6, minWidth: 280 }}
          />
        </label>
        <button
          onClick={() => void cargarPendientes()}
          disabled={cargandoLista || establecimiento.trim().length === 0}
          style={botonSecundario(cargandoLista)}
        >
          {cargandoLista ? 'Cargando…' : 'Cargar pendientes'}
        </button>

        {pendientes.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
            {pendientes.map((d) => (
              <li
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderTop: `1px solid ${COLOR.borde}`,
                  padding: '8px 0',
                }}
              >
                <span style={{ flex: 1 }}>{ETIQUETA_TIPO[d.tipo] ?? d.tipo}</span>
                <BadgeEstado estado={d.estadoRevision} />
                <span style={{ fontSize: 12, color: COLOR.suave }}>{new Date(d.createdAt).toLocaleString('es-CL')}</span>
                <button onClick={() => void abrir(d.id)} style={botonSecundario(false)}>
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        )}

        {pendientes.length === 0 && !cargandoLista && (
          <p style={{ fontSize: 13, color: COLOR.suave, marginBottom: 0 }}>
            No hay documentos pendientes de revisión para este establecimiento.
          </p>
        )}
      </section>

      {aviso && <p style={{ color: '#1a7f37', background: '#dafbe1', padding: 12, borderRadius: 6 }}>✅ {aviso}</p>}
      {error && <p style={{ color: '#b35900', background: '#fff8c5', padding: 12, borderRadius: 6 }}>⚠ {error}</p>}

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
  return (
    <span
      style={{
        fontSize: 12,
        padding: '2px 10px',
        borderRadius: 999,
        background: COLOR_ESTADO[estado],
        border: `1px solid ${COLOR.borde}`,
      }}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

function botonSecundario(deshabilitado: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    background: '#fff',
    color: COLOR.acento,
    border: `1px solid ${COLOR.acento}`,
    borderRadius: 6,
    cursor: deshabilitado ? 'default' : 'pointer',
    fontWeight: 600,
  };
}

function boton(color: string, deshabilitado: boolean): React.CSSProperties {
  return {
    padding: '8px 18px',
    background: deshabilitado ? COLOR.suave : color,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: deshabilitado ? 'default' : 'pointer',
    fontWeight: 600,
    marginRight: 8,
  };
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
      <h2 style={{ color: COLOR.acento }}>
        {ETIQUETA_TIPO[detalle.tipo] ?? detalle.tipo} <BadgeEstado estado={estadoRevision} />
      </h2>

      <ContenidoArtefacto tipo={detalle.tipo} contenido={detalle.contenido} />

      <PanelGates gates={detalle.resultadoGates} />

      <section style={{ ...card, background: COLOR.fondo }}>
        <h3 style={{ marginTop: 0 }}>Acciones de revisión</h3>

        {estadoRevision === 'borrador' && (
          <button onClick={() => onAccion('enviar')} disabled={accionando} style={boton(COLOR.acento, accionando)}>
            Enviar a revisión
          </button>
        )}

        {estadoRevision === 'en_revision' && (
          <>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
              Revisor (email)
              <input
                value={revisor}
                onChange={(e) => setRevisor(e.target.value)}
                placeholder="prof.garcia@colegio.cl"
                style={{ display: 'block', marginTop: 4, padding: 6, minWidth: 280 }}
              />
            </label>
            <button
              onClick={() => onAccion('aprobar')}
              disabled={accionando || revisor.trim().length === 0}
              style={boton('#1a7f37', accionando || revisor.trim().length === 0)}
            >
              Aprobar
            </button>
            <button onClick={() => onAccion('rechazar')} disabled={accionando} style={boton('#cf222e', accionando)}>
              Rechazar
            </button>
          </>
        )}

        {(estadoRevision === 'aprobado' || estadoRevision === 'rechazado') && (
          <p style={{ margin: 0, color: COLOR.suave }}>
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
    <div style={{ marginBottom: 8 }}>
      <p style={{ margin: '4px 0', fontWeight: 600 }}>
        {gate.ok ? '✅' : '⛔'} {titulo}
        {gate.hallazgos.length === 0 && <span style={{ color: '#1a7f37', fontWeight: 400 }}> — sin observaciones</span>}
      </p>
      {gate.hallazgos.length > 0 && (
        <ul style={{ margin: '2px 0 0' }}>
          {gate.hallazgos.map((h: Hallazgo, i: number) => (
            <li key={i} style={{ fontSize: 13 }}>
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: h.severidad === 'bloquea' ? '#ffeef0' : '#fff8c5',
                  marginRight: 6,
                }}
              >
                {h.severidad}
              </span>
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
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Validación</h3>
        <p style={{ color: COLOR.suave, marginBottom: 0 }}>Sin reporte de gates.</p>
      </section>
    );
  }
  return (
    <section style={{ ...card, borderColor: gates.ok ? '#1a7f37' : '#cf222e', borderWidth: 2 }}>
      <h3 style={{ marginTop: 0 }}>
        {gates.ok ? '✅ Validación: lista para revisar' : '⛔ Validación: hallazgos bloqueantes'}
      </h3>
      <p style={{ fontSize: 13, color: COLOR.suave, marginTop: 0 }}>
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
      <section style={card}>
        <p style={{ color: COLOR.suave, margin: 0 }}>Sin contenido.</p>
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
        <section style={card}>
          <pre style={{ fontSize: 12, overflowX: 'auto', margin: 0 }}>{JSON.stringify(contenido, null, 2)}</pre>
        </section>
      );
  }
}

function VistaUnidad({ unidad }: { unidad: PlanificacionUnidad }): React.ReactElement {
  return (
    <section style={card}>
      <p>
        <strong>{unidad.unidad}</strong>
        <br />
        <span style={{ color: COLOR.suave }}>
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
    <section style={card}>
      <p style={{ fontWeight: 600, marginTop: 0 }}>{clase.clases.length} clases</p>
      {clase.clases.map((c) => (
        <div key={c.numero} style={{ borderTop: `1px solid ${COLOR.borde}`, paddingTop: 8, marginTop: 8 }}>
          <p style={{ fontWeight: 600, margin: 0 }}>
            Clase {c.numero} · {c.objetivo_clase}{' '}
            <span style={{ color: COLOR.suave, fontWeight: 400 }}>({c.duracion_min} min)</span>
          </p>
        </div>
      ))}
    </section>
  );
}

function VistaPrueba({ prueba }: { prueba: Prueba }): React.ReactElement {
  return (
    <section style={card}>
      <p style={{ fontWeight: 600, marginTop: 0 }}>
        {prueba.items.length} ítems · perfil {prueba.perfil_nivel}
      </p>
      <ol>
        {prueba.items.map((it, i) => (
          <li key={i} style={{ marginBottom: 8 }}>
            <span>{it.enunciado}</span>{' '}
            <em style={{ color: COLOR.suave }}>
              ({it.oa} · {it.puntaje} pts)
            </em>
          </li>
        ))}
      </ol>
    </section>
  );
}

function VistaDeck({ deck }: { deck: ClaseDeck }): React.ReactElement {
  return (
    <section style={{ ...card, background: COLOR.fondo }}>
      <p style={{ fontWeight: 600, marginTop: 0 }}>{deck.titulo}</p>
      <p style={{ color: COLOR.suave, marginTop: 0 }}>{deck.slides.length} diapositivas</p>
      <ul>
        {deck.slides.map((s, i) => (
          <li key={i}>
            <em style={{ color: COLOR.suave }}>[{s.momento}]</em> <strong>{s.titulo}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
