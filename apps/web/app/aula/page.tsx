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
    <main className="faro-page">
      <header className="faro-header">
        <h1 className="faro-title">Faro · Cascada de Aula</h1>
        <p className="faro-subtitle">
          Del Objetivo de Aprendizaje a la planificación, la prueba y el .pptx — alineado al currículum nacional.
        </p>
      </header>

      <p>
        <span className="badge badge--mode">
          {modo === 'live' ? 'modo live (ANTHROPIC_API_KEY)' : 'modo demo (contenido curado · sin API key)'}
        </span>
      </p>

      <section className="faro-card">
        <label className="field field--wide">
          <span className="field__label">Materia y nivel</span>
          <select className="field__control" value={materiaId} onChange={(e) => cambiarMateria(e.target.value)}>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.asignatura} · {m.nivel}
              </option>
            ))}
          </select>
        </label>

        {materia && (
          <div role="group" aria-labelledby="oa-group-label">
            <p className="oa-section-label" id="oa-group-label">Objetivos de Aprendizaje ({seleccion.size} seleccionados)</p>
            <div className="oa-list">
              {materia.oa.map((oa) => (
                <label key={oa.codigo} className="oa-item">
                  <input type="checkbox" checked={seleccion.has(oa.codigo)} onChange={() => toggleOa(oa.codigo)} />
                  <span>
                    <strong>{oa.codigo}</strong> — {oa.descripcion}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => void generar()} disabled={cargando || seleccion.size === 0} className="btn btn--primary btn--mt">
          {cargando ? 'Generando…' : 'Generar cascada'}
        </button>
        {modo === 'demo' && (
          <p className="form-hint">
            En modo demo se muestra una unidad curada de ejemplo. La selección de OA dirige la generación al activar el modo live.
          </p>
        )}
      </section>

      {error && <p className="note note--error">⚠ {error}</p>}

      {salida && <Resultados salida={salida} />}
    </main>
  );
}

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

function Validacion({ gates }: { gates: ReporteGates }): React.ReactElement {
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

function Resultados({ salida }: { salida: Salida }): React.ReactElement {
  const { unidad, clase, prueba, deck, gates } = salida.resultado;
  return (
    <>
      <h2 className="faro-result-heading">Resultado</h2>
      <p className="result-intro">
        Todos los artefactos nacen <strong>borrador</strong> y requieren revisión docente (human-in-the-loop).
      </p>

      <Validacion gates={gates} />

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
        <p className="oa-section-label">OA</p>
        <ul>
          {unidad.oa.map((o) => (
            <li key={o.codigo}>
              <strong>{o.codigo}</strong> <em className="text-muted">({o.categoria})</em> — {o.descripcion}
            </li>
          ))}
        </ul>
        <p className="oa-section-label">Indicadores de evaluación</p>
        <ul>
          {unidad.indicadores_evaluacion.map((ind, i) => (
            <li key={i}>
              {ind.texto}{' '}
              <span className={`badge badge--inline ${ind.fuente === 'oficial' ? 'badge--ok' : 'badge--draft'}`}>{ind.fuente}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="faro-card">
        <h3 className="section-title">🗓 Planificación de Clases ({clase.clases.length})</h3>
        {clase.clases.map((c) => (
          <div key={c.numero} className="clase-item">
            <p className="clase-item__title">
              Clase {c.numero} · {c.objetivo_clase} <span className="clase-item__duration">({c.duracion_min} min)</span>
            </p>
            <p>
              <strong className="clase-item__moment">Inicio:</strong> {c.inicio}
            </p>
            <p>
              <strong className="clase-item__moment">Desarrollo:</strong> {c.desarrollo}
            </p>
            <p>
              <strong className="clase-item__moment">Cierre:</strong> {c.cierre}
            </p>
          </div>
        ))}
      </section>

      <section className="faro-card">
        <h3 className="section-title">📝 Prueba ({prueba.items.length} ítems · perfil {prueba.perfil_nivel})</h3>
        <ol>
          {prueba.items.map((it, i) => (
            <li key={i} className="prueba-item">
              <span>{it.enunciado}</span> <span className="prueba-item__meta">{it.oa} · {it.puntaje} pts</span>
              {it.alternativas && (
                <ul>
                  {it.alternativas.map((alt, j) => (
                    <li key={j} className={alt.correcta ? 'prueba-alternativa--correcta' : undefined}>
                      {alt.texto} {alt.correcta ? '✔' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        <p className="text-muted text-sm">{prueba.pauta_correccion}</p>
      </section>

      <section className="faro-card faro-card--surface">
        <h3 className="section-title">📽 Deck de la clase · {deck.slides.length} diapositivas</h3>
        <p className="text-muted">{deck.titulo}</p>
        <div className="download-row">
          <button onClick={() => descargarPptx(salida.pptx)} className="btn btn--success">
            ⬇ Descargar {salida.pptx.nombre} ({Math.round(salida.pptx.bytes / 1024)} KB)
          </button>
        </div>
        <ul className="deck-slides">
          {deck.slides.map((s, i) => (
            <li key={i}>
              <em>{s.momento}</em> <strong>{s.titulo}</strong>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
