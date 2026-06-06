'use client';

// Demo visible de la cascada de Aula: elegir materia/nivel + OA → Generar → ver Unidad, Clase,
// Prueba y descargar el .pptx. Materia-agnóstico: las opciones vienen de /api/aula/materias.

import { useEffect, useState } from 'react';
import type { ClaseDeck, Hallazgo, PlanificacionClase, PlanificacionUnidad, ReporteGates, ResultadoGate, Prueba } from '@faro/domain';

interface OaItem {
  codigo: string;
  descripcion: string;
  eje?: string;
}
interface Materia {
  id: string;
  asignatura: string;
  nivel: string;
  oa: OaItem[];
}
interface PptxDescargable {
  nombre: string;
  mime: string;
  bytes: number;
  base64: string;
}
interface Salida {
  modo: 'demo' | 'live';
  materiaId: string;
  resultado: { unidad: PlanificacionUnidad; clase: PlanificacionClase; prueba: Prueba; deck: ClaseDeck; gates: ReporteGates };
  pptx: PptxDescargable;
}

const COLOR = { borde: '#d0d7de', acento: '#1A237E', suave: '#57606a', fondo: '#f6f8fa' };
const card: React.CSSProperties = { border: `1px solid ${COLOR.borde}`, borderRadius: 8, padding: 16, marginBottom: 16 };

function descargarPptx(p: PptxDescargable): void {
  const bin = atob(p.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: p.mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = p.nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AulaPage() {
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [modo, setModo] = useState<'demo' | 'live'>('demo');
  const [materiaId, setMateriaId] = useState<string>('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salida, setSalida] = useState<Salida | null>(null);

  useEffect(() => {
    fetch('/api/aula/materias')
      .then((r) => r.json())
      .then((data: { modo: 'demo' | 'live'; materias: Materia[] }) => {
        setMaterias(data.materias);
        setModo(data.modo);
        const primera = data.materias[0];
        if (primera) {
          setMateriaId(primera.id);
          setSeleccion(new Set(primera.oa.slice(0, 5).map((o) => o.codigo)));
        }
      })
      .catch(() => setError('No se pudieron cargar las materias.'));
  }, []);

  const materia = materias.find((m) => m.id === materiaId) ?? null;

  function cambiarMateria(id: string): void {
    setMateriaId(id);
    setSalida(null);
    const m = materias.find((x) => x.id === id);
    setSeleccion(new Set(m ? m.oa.slice(0, 5).map((o) => o.codigo) : []));
  }

  function toggleOa(codigo: string): void {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  async function generar(): Promise<void> {
    setCargando(true);
    setError(null);
    setSalida(null);
    try {
      const r = await fetch('/api/aula/cascada', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ materiaId, oaCodigos: [...seleccion] }),
      });
      const data: unknown = await r.json();
      if (!r.ok) {
        const msg = typeof data === 'object' && data !== null && 'error' in data ? String((data as { error: unknown }).error) : 'Error';
        throw new Error(msg);
      }
      setSalida(data as Salida);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#1f2328' }}>
      <h1 style={{ color: COLOR.acento, marginBottom: 4 }}>Faro · Cascada de Aula</h1>
      <p style={{ color: COLOR.suave, marginTop: 0 }}>
        Del Objetivo de Aprendizaje a la planificación, la prueba y el .pptx — alineado al currículum y al Decreto 67.
      </p>

      <span
        style={{
          display: 'inline-block',
          fontSize: 12,
          padding: '2px 10px',
          borderRadius: 999,
          background: modo === 'live' ? '#dafbe1' : '#fff8c5',
          border: `1px solid ${COLOR.borde}`,
        }}
      >
        {modo === 'live' ? 'modo live (ANTHROPIC_API_KEY)' : 'modo demo (contenido curado · sin API key)'}
      </span>

      <section style={{ ...card, marginTop: 16 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
          Materia y nivel
          <select
            value={materiaId}
            onChange={(e) => cambiarMateria(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6, minWidth: 280 }}
          >
            {materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.asignatura} · {m.nivel}
              </option>
            ))}
          </select>
        </label>

        {materia && (
          <>
            <p style={{ fontWeight: 600, margin: '12px 0 6px' }}>Objetivos de Aprendizaje ({seleccion.size} seleccionados)</p>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${COLOR.borde}`, borderRadius: 6, padding: 8 }}>
              {materia.oa.map((oa) => (
                <label key={oa.codigo} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', fontSize: 14 }}>
                  <input type="checkbox" checked={seleccion.has(oa.codigo)} onChange={() => toggleOa(oa.codigo)} />
                  <span>
                    <strong>{oa.codigo}</strong> — {oa.descripcion}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => void generar()}
          disabled={cargando || seleccion.size === 0}
          style={{
            marginTop: 14,
            padding: '8px 18px',
            background: cargando ? COLOR.suave : COLOR.acento,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: cargando ? 'default' : 'pointer',
            fontWeight: 600,
          }}
        >
          {cargando ? 'Generando…' : 'Generar cascada'}
        </button>
        {modo === 'demo' && (
          <p style={{ fontSize: 12, color: COLOR.suave, marginBottom: 0 }}>
            En modo demo se muestra una unidad curada de ejemplo. La selección de OA dirige la generación al activar el modo live.
          </p>
        )}
      </section>

      {error && (
        <p style={{ color: '#b35900', background: '#fff8c5', padding: 12, borderRadius: 6 }}>⚠ {error}</p>
      )}

      {salida && <Resultados salida={salida} />}
    </main>
  );
}

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

function Validacion({ gates }: { gates: ReporteGates }): React.ReactElement {
  return (
    <section style={{ ...card, borderColor: gates.ok ? '#1a7f37' : '#cf222e', borderWidth: 2 }}>
      <h3 style={{ marginTop: 0 }}>
        {gates.ok ? '✅ Validación: lista para revisar' : '⛔ Validación: hallazgos bloqueantes'}
      </h3>
      <p style={{ fontSize: 13, color: COLOR.suave, marginTop: 0 }}>
        Chequeos deterministas (no IA): cobertura de OA, ítem→OA, puntajes y citas al currículum vigente.
      </p>
      <PanelGate titulo="Planificación (cobertura OA, indicadores, duración)" gate={gates.planificacion} />
      <PanelGate titulo="Prueba (ítem→OA, una correcta, puntajes, Decreto 67)" gate={gates.pedagogica} />
      <PanelGate titulo="Citas (OA existe + vigente en el corpus)" gate={gates.citas} />
    </section>
  );
}

function Resultados({ salida }: { salida: Salida }): React.ReactElement {
  const { unidad, clase, prueba, deck, gates } = salida.resultado;
  return (
    <>
      <h2 style={{ color: COLOR.acento }}>Resultado</h2>
      <p style={{ fontSize: 13, color: COLOR.suave }}>
        Todos los artefactos nacen <strong>borrador</strong> y requieren revisión docente (human-in-the-loop).
      </p>

      <Validacion gates={gates} />

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>📘 Planificación de Unidad</h3>
        <p>
          <strong>{unidad.unidad}</strong>
          <br />
          <span style={{ color: COLOR.suave }}>
            {unidad.asignatura} · {unidad.nivel} · {unidad.duracion_semanas} semanas · {unidad.horas_pedagogicas} hrs
          </span>
        </p>
        <p>{unidad.proposito}</p>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>OA</p>
        <ul>
          {unidad.oa.map((o) => (
            <li key={o.codigo}>
              <strong>{o.codigo}</strong> <em style={{ color: COLOR.suave }}>({o.categoria})</em> — {o.descripcion}
            </li>
          ))}
        </ul>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>Indicadores de evaluación</p>
        <ul>
          {unidad.indicadores_evaluacion.map((ind, i) => (
            <li key={i}>
              {ind.texto}{' '}
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: ind.fuente === 'programa_estudio' ? '#dafbe1' : '#ffeef0' }}>
                {ind.fuente}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>🗓 Planificación de Clases ({clase.clases.length})</h3>
        {clase.clases.map((c) => (
          <div key={c.numero} style={{ borderTop: `1px solid ${COLOR.borde}`, paddingTop: 8, marginTop: 8 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>
              Clase {c.numero} · {c.objetivo_clase} <span style={{ color: COLOR.suave, fontWeight: 400 }}>({c.duracion_min} min)</span>
            </p>
            <p style={{ margin: '4px 0' }}><strong>Inicio:</strong> {c.inicio}</p>
            <p style={{ margin: '4px 0' }}><strong>Desarrollo:</strong> {c.desarrollo}</p>
            <p style={{ margin: '4px 0' }}><strong>Cierre:</strong> {c.cierre}</p>
          </div>
        ))}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>📝 Prueba ({prueba.items.length} ítems · perfil {prueba.perfil_nivel})</h3>
        <ol>
          {prueba.items.map((it, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <span>{it.enunciado}</span> <em style={{ color: COLOR.suave }}>({it.oa} · {it.puntaje} pts)</em>
              {it.alternativas && (
                <ul>
                  {it.alternativas.map((alt, j) => (
                    <li key={j} style={{ color: alt.correcta ? '#1a7f37' : undefined }}>
                      {alt.texto} {alt.correcta ? '✔' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        <p style={{ fontSize: 13, color: COLOR.suave }}>{prueba.pauta_correccion}</p>
      </section>

      <section style={{ ...card, background: COLOR.fondo }}>
        <h3 style={{ marginTop: 0 }}>📽 Deck de la clase · {deck.slides.length} diapositivas</h3>
        <p style={{ color: COLOR.suave, marginTop: 0 }}>{deck.titulo}</p>
        <button
          onClick={() => descargarPptx(salida.pptx)}
          style={{ padding: '8px 18px', background: '#1a7f37', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          ⬇ Descargar {salida.pptx.nombre} ({Math.round(salida.pptx.bytes / 1024)} KB)
        </button>
        <ul style={{ marginTop: 12 }}>
          {deck.slides.map((s, i) => (
            <li key={i}>
              <em style={{ color: COLOR.suave }}>[{s.momento}]</em> <strong>{s.titulo}</strong>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
