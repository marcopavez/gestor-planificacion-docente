'use client';

// apps/web/app/aula/planificacion/page.tsx — Pantalla del flujo de planificación (H-2.7):
// 1) elegir Formato (A/B) + asignatura/nivel/OA del corpus → generar (async),
// 2) poll del estado, 3) revisión HIL con los campos ia_borrador editables,
// 4) aprobar (requiere autor) y 5) exportar .docx / .pdf.
// La edición visual de la plantilla se difiere: solo se eligen los presets A/B.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanificacionUnidad } from '@faro/domain';

interface Plantilla {
  id: string;
  formato: 'A' | 'B';
  nombre: string;
  establecimiento: string;
}
interface Bloque {
  asignatura: string;
  nivel: string;
}
interface OaItem {
  codigo: string;
  descripcion: string;
}
interface Hallazgo {
  regla: string;
  severidad: 'bloquea' | 'marca';
  mensaje: string;
}
interface ReporteGates {
  ok: boolean;
  hallazgos: Hallazgo[];
}

type Paso = 'form' | 'generando' | 'revision';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

export default function PaginaPlanificacion() {
  const [paso, setPaso] = useState<Paso>('form');
  const [error, setError] = useState<string | null>(null);

  // Catálogos de selección
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [oaOpciones, setOaOpciones] = useState<OaItem[]>([]);

  // Formulario
  const [formato, setFormato] = useState<'A' | 'B'>('A');
  const [asignatura, setAsignatura] = useState('');
  const [nivel, setNivel] = useState('');
  const [oaSel, setOaSel] = useState<string[]>([]);
  const [docente, setDocente] = useState('');
  const [unidad, setUnidad] = useState('');
  const [periodo, setPeriodo] = useState('');

  // Generación / revisión
  const [jobId, setJobId] = useState<string | null>(null);
  const [documentoId, setDocumentoId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanificacionUnidad | null>(null);
  const [gates, setGates] = useState<ReporteGates | null>(null);
  const [estadoRevision, setEstadoRevision] = useState<string>('borrador');
  const [autor, setAutor] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const p = await getJson<{ plantillas: Plantilla[] }>('/api/aula/plantillas');
        const c = await getJson<{ bloques: Bloque[] }>('/api/aula/corpus');
        setPlantillas(p.plantillas);
        setBloques(c.bloques);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar los catálogos.');
      }
    })();
  }, []);

  const establecimiento = useMemo(
    () => plantillas.find((p) => p.formato === formato)?.establecimiento ?? '',
    [plantillas, formato],
  );
  const asignaturas = useMemo(() => [...new Set(bloques.map((b) => b.asignatura))], [bloques]);
  const niveles = useMemo(
    () => bloques.filter((b) => b.asignatura === asignatura).map((b) => b.nivel),
    [bloques, asignatura],
  );

  useEffect(() => {
    setOaSel([]);
    setOaOpciones([]);
    if (asignatura === '' || nivel === '') return;
    void (async () => {
      try {
        const r = await getJson<{ oa: OaItem[] }>(
          `/api/aula/corpus/oa?asignatura=${encodeURIComponent(asignatura)}&nivel=${encodeURIComponent(nivel)}`,
        );
        setOaOpciones(r.oa);
      } catch {
        setOaOpciones([]);
      }
    })();
  }, [asignatura, nivel]);

  const generar = useCallback(async () => {
    setError(null);
    const cuerpo: Record<string, unknown> = {
      establecimiento,
      asignatura,
      nivel,
      unidad,
      plantilla: formato,
      oaCodigos: oaSel,
    };
    if (docente !== '') cuerpo['docente'] = docente;
    if (formato === 'B' && periodo !== '') cuerpo['periodo'] = periodo;

    try {
      const res = await fetch('/api/aula/planificacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? `POST → ${res.status}`);
      }
      const { jobId: nuevoJob } = (await res.json()) as { jobId: string };
      setPaso('generando');
      setJobId(nuevoJob); // dispara el efecto de polling (con limpieza al desmontar)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar.');
    }
  }, [establecimiento, asignatura, nivel, unidad, formato, oaSel, docente, periodo]);

  // Polling del job dentro de un efecto: se cancela (AbortController + bandera) al desmontar o al
  // cambiar de job, evitando setState sobre un componente desmontado y fetches huérfanos.
  useEffect(() => {
    if (jobId === null) return;
    const ctrl = new AbortController();
    let cancelado = false;
    void (async () => {
      for (let i = 0; i < 60 && !cancelado; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (cancelado) return;
        try {
          const res = await fetch(`/api/aula/planificacion/${jobId}`, { signal: ctrl.signal });
          if (!res.ok) continue;
          const r = (await res.json()) as {
            estado: string;
            documentoId?: string;
            contenido?: PlanificacionUnidad;
            resultadoGates?: ReporteGates;
            estadoRevision?: string;
            error?: string | null;
          };
          if (cancelado) return;
          if (r.estado === 'fallido') {
            setError(r.error ?? 'La generación falló.');
            setPaso('form');
            return;
          }
          if (r.estado === 'hecho' && r.documentoId && r.contenido) {
            setDocumentoId(r.documentoId);
            setPlan(r.contenido);
            setGates(r.resultadoGates ?? null);
            setEstadoRevision(r.estadoRevision ?? 'borrador');
            setPaso('revision');
            return;
          }
        } catch {
          // abortado o error transitorio: seguimos (o salimos si fue cancelado)
        }
      }
      if (!cancelado) {
        setError('La generación tardó demasiado; reintenta.');
        setPaso('form');
      }
    })();
    return () => {
      cancelado = true;
      ctrl.abort();
    };
  }, [jobId]);

  const guardar = useCallback(async () => {
    if (documentoId === null || plan === null) return;
    setError(null);
    try {
      const res = await fetch(`/api/aula/documentos/${documentoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? `PUT → ${res.status}`);
      }
      const j = (await res.json()) as { resultadoGates: ReporteGates };
      setGates(j.resultadoGates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }, [documentoId, plan]);

  const transicion = useCallback(
    async (accion: 'enviar' | 'aprobar' | 'rechazar') => {
      if (documentoId === null) return;
      setError(null);
      const body = accion === 'aprobar' ? JSON.stringify({ autorHumano: autor }) : undefined;
      try {
        const res = await fetch(`/api/aula/revision/${documentoId}/${accion}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(body !== undefined ? { body } : {}),
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          throw new Error(j.error ?? `POST → ${res.status}`);
        }
        const j = (await res.json()) as { documento?: { estadoRevision?: string } };
        if (j.documento?.estadoRevision) setEstadoRevision(j.documento.estadoRevision);
      } catch (e) {
        setError(e instanceof Error ? e.message : `No se pudo ${accion}.`);
      }
    },
    [documentoId, autor],
  );

  const puedeGenerar = asignatura !== '' && nivel !== '' && unidad !== '' && oaSel.length > 0;

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Generar planificación de unidad</h1>
      {error !== null && <p style={{ color: '#b00020' }}>⚠ {error}</p>}

      {paso === 'form' && (
        <section style={{ display: 'grid', gap: 12 }}>
          <label>
            Formato:&nbsp;
            <select value={formato} onChange={(e) => setFormato(e.target.value as 'A' | 'B')}>
              <option value="A">A — Planificación de Unidad (denso)</option>
              <option value="B">B — Bloque de Actividades (DUA)</option>
            </select>
          </label>
          <p style={{ color: '#555', margin: 0 }}>Establecimiento: {establecimiento || '—'}</p>

          <label>
            Asignatura:&nbsp;
            <select value={asignatura} onChange={(e) => { setAsignatura(e.target.value); setNivel(''); }}>
              <option value="">— elige —</option>
              {asignaturas.map((a) => (<option key={a} value={a}>{a}</option>))}
            </select>
          </label>
          <label>
            Nivel:&nbsp;
            <select value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={asignatura === ''}>
              <option value="">— elige —</option>
              {niveles.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
          </label>

          {oaOpciones.length > 0 && (
            <fieldset>
              <legend>Objetivos de Aprendizaje</legend>
              {oaOpciones.map((oa) => (
                <label key={oa.codigo} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={oaSel.includes(oa.codigo)}
                    onChange={(e) =>
                      setOaSel((prev) => (e.target.checked ? [...prev, oa.codigo] : prev.filter((c) => c !== oa.codigo)))
                    }
                  />
                  &nbsp;<strong>{oa.codigo}</strong>: {oa.descripcion}
                </label>
              ))}
            </fieldset>
          )}

          <label>Unidad:&nbsp;<input value={unidad} onChange={(e) => setUnidad(e.target.value)} style={{ width: '60%' }} /></label>
          <label>Docente (opcional):&nbsp;<input value={docente} onChange={(e) => setDocente(e.target.value)} /></label>
          {formato === 'B' && (
            <label>Período:&nbsp;<input value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></label>
          )}

          <button onClick={() => void generar()} disabled={!puedeGenerar} style={{ width: 200 }}>
            Generar (borrador)
          </button>
        </section>
      )}

      {paso === 'generando' && <p>Generando la planificación… (esto corre en el worker)</p>}

      {paso === 'revision' && plan !== null && documentoId !== null && (
        <RevisionPlan
          plan={plan}
          gates={gates}
          estadoRevision={estadoRevision}
          autor={autor}
          setAutor={setAutor}
          documentoId={documentoId}
          onPlan={setPlan}
          onGuardar={() => void guardar()}
          onTransicion={(a) => void transicion(a)}
        />
      )}
    </main>
  );
}

function RevisionPlan(props: {
  plan: PlanificacionUnidad;
  gates: ReporteGates | null;
  estadoRevision: string;
  autor: string;
  setAutor: (v: string) => void;
  documentoId: string;
  onPlan: (p: PlanificacionUnidad) => void;
  onGuardar: () => void;
  onTransicion: (a: 'enviar' | 'aprobar' | 'rechazar') => void;
}) {
  const { plan, gates, estadoRevision, autor, setAutor, documentoId, onPlan, onGuardar, onTransicion } = props;
  const aprobado = estadoRevision === 'aprobado';

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h2>Revisión (HIL) — estado: {estadoRevision}</h2>

      {gates !== null && gates.hallazgos.length > 0 && (
        <ul>
          {gates.hallazgos.map((h, i) => (
            <li key={i} style={{ color: h.severidad === 'bloquea' ? '#b00020' : '#a06800' }}>
              [{h.severidad}] {h.mensaje}
            </li>
          ))}
        </ul>
      )}

      <fieldset>
        <legend>Objetivos de Aprendizaje (datos fijos del corpus)</legend>
        <ul>{plan.oa.map((o) => (<li key={o.codigo}><strong>{o.codigo}</strong> [{o.categoria}]: {o.descripcion}</li>))}</ul>
      </fieldset>

      <label>
        Propósito (IA · editable):
        <textarea
          value={plan.proposito ?? ''}
          disabled={aprobado}
          onChange={(e) => onPlan({ ...plan, proposito: e.target.value })}
          style={{ width: '100%', minHeight: 70 }}
        />
      </label>

      <label>
        Experiencias (una por línea · IA · editable):
        <textarea
          value={plan.experiencias.join('\n')}
          disabled={aprobado}
          onChange={(e) => onPlan({ ...plan, experiencias: e.target.value.split('\n').filter((s) => s.trim() !== '') })}
          style={{ width: '100%', minHeight: 90 }}
        />
      </label>

      <fieldset>
        <legend>Indicadores de evaluación (IA · editable)</legend>
        {plan.indicadores_evaluacion.map((ind, i) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <span style={{ minWidth: 90 }}>{ind.oa}</span>
            <input
              value={ind.texto}
              disabled={aprobado}
              onChange={(e) => {
                const copia = plan.indicadores_evaluacion.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x));
                onPlan({ ...plan, indicadores_evaluacion: copia });
              }}
              style={{ flex: 1 }}
            />
          </div>
        ))}
      </fieldset>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onGuardar} disabled={aprobado}>Guardar cambios</button>
        {estadoRevision === 'borrador' && <button onClick={() => onTransicion('enviar')}>Enviar a revisión</button>}
        {estadoRevision === 'en_revision' && (
          <>
            <input placeholder="tu email (autor)" value={autor} onChange={(e) => setAutor(e.target.value)} />
            <button onClick={() => onTransicion('aprobar')} disabled={autor.trim() === ''}>Aprobar</button>
            <button onClick={() => onTransicion('rechazar')}>Rechazar</button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <a href={`/api/aula/documentos/${documentoId}/docx`}>Descargar .docx</a>
        <a href={`/api/aula/documentos/${documentoId}/pdf`}>Descargar .pdf</a>
      </div>

      <GenerarPrueba planificacionDocumentoId={documentoId} />
      <GenerarPptInfantil planificacionDocumentoId={documentoId} />
    </section>
  );
}

// Genera una PRUEBA FORMATIVA (Fase 4) desde esta planificación: encola el job, hace polling y, al
// terminar, ofrece las descargas .docx alumno/pauta. La prueba se genera del documento PERSISTIDO
// (guarda los cambios HIL antes si los hiciste). Nace borrador (HIL aparte, como la planificación).
function GenerarPrueba({ planificacionDocumentoId }: { planificacionDocumentoId: string }) {
  const [estado, setEstado] = useState<'idle' | 'generando' | 'listo' | 'error'>('idle');
  const [pruebaDocId, setPruebaDocId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generar = useCallback(async () => {
    setErr(null);
    setEstado('generando');
    try {
      const res = await fetch('/api/aula/prueba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planificacionDocumentoId }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? `POST → ${res.status}`);
      }
      const { jobId } = (await res.json()) as { jobId: string };
      // Polling acotado del job de prueba (el worker corre GenerarPruebaFormativaUseCase).
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const e = await fetch(`/api/aula/prueba/${jobId}`);
        if (!e.ok) continue;
        const r = (await e.json()) as { estado: string; documentoId?: string; error?: string | null };
        if (r.estado === 'fallido') throw new Error(r.error ?? 'La generación de la prueba falló.');
        if (r.estado === 'hecho' && r.documentoId !== undefined) {
          setPruebaDocId(r.documentoId);
          setEstado('listo');
          return;
        }
      }
      throw new Error('La generación de la prueba tardó demasiado; reintenta.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo generar la prueba.');
      setEstado('error');
    }
  }, [planificacionDocumentoId]);

  return (
    <fieldset>
      <legend>Prueba formativa (desde esta planificación)</legend>
      {err !== null && <p style={{ color: '#b00020' }}>⚠ {err}</p>}
      {(estado === 'idle' || estado === 'error') && (
        <button onClick={() => void generar()}>Generar prueba formativa (borrador)</button>
      )}
      {estado === 'generando' && <p>Generando la prueba… (corre en el worker)</p>}
      {estado === 'listo' && pruebaDocId !== null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Prueba generada (borrador):</span>
          <a href={`/api/aula/documentos/${pruebaDocId}/prueba?variante=alumno`}>.docx alumno</a>
          <a href={`/api/aula/documentos/${pruebaDocId}/prueba?variante=pauta`}>.docx pauta</a>
        </div>
      )}
    </fieldset>
  );
}

// Genera un PPT INFANTIL (Fase 3) desde esta planificación: encola el job, hace polling y, al terminar,
// ofrece la descarga .pptx. El deck se genera del documento PERSISTIDO (guarda los cambios HIL antes si
// los hiciste) y es autocontenido (tema por tramo/asignatura). Nace borrador (HIL aparte, como la prueba).
function GenerarPptInfantil({ planificacionDocumentoId }: { planificacionDocumentoId: string }) {
  const [estado, setEstado] = useState<'idle' | 'generando' | 'listo' | 'error'>('idle');
  const [deckDocId, setDeckDocId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generar = useCallback(async () => {
    setErr(null);
    setEstado('generando');
    try {
      const res = await fetch('/api/aula/ppt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planificacionDocumentoId }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? `POST → ${res.status}`);
      }
      const { jobId } = (await res.json()) as { jobId: string };
      // Polling acotado del job de PPT (el worker corre GenerarPptInfantilUseCase).
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const e = await fetch(`/api/aula/ppt/${jobId}`);
        if (!e.ok) continue;
        const r = (await e.json()) as { estado: string; documentoId?: string; error?: string | null };
        if (r.estado === 'fallido') throw new Error(r.error ?? 'La generación del PPT falló.');
        if (r.estado === 'hecho' && r.documentoId !== undefined) {
          setDeckDocId(r.documentoId);
          setEstado('listo');
          return;
        }
      }
      throw new Error('La generación del PPT tardó demasiado; reintenta.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo generar el PPT.');
      setEstado('error');
    }
  }, [planificacionDocumentoId]);

  return (
    <fieldset>
      <legend>PPT infantil (desde esta planificación)</legend>
      {err !== null && <p style={{ color: '#b00020' }}>⚠ {err}</p>}
      {(estado === 'idle' || estado === 'error') && (
        <button onClick={() => void generar()}>Generar PPT infantil (borrador)</button>
      )}
      {estado === 'generando' && <p>Generando el PPT… (corre en el worker)</p>}
      {estado === 'listo' && deckDocId !== null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>PPT generado (borrador):</span>
          <a href={`/api/aula/documentos/${deckDocId}/pptx`}>.pptx</a>
        </div>
      )}
    </fieldset>
  );
}
