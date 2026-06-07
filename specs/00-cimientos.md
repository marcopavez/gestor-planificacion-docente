# Fase 0 — Cimientos de producción + primer *vertical slice* real

> **Spec de desarrollo** · Deriva de `docs/arquitectura-faro.md` §11 (Fase 0), `docs/prompt-scaffolding-faro.md`, épicas A (+ semillas de B/E/G) de `docs/plan-implementacion-faro.md`.
> **⚠️ Nota v2 (2026-06-07):** los cimientos (monorepo hexagonal, persistencia, worker, HIL, export) **siguen vigentes** en Faro v2. Lo que esta spec menciona de **normativa, RAG/pgvector y Decreto 67/83 está aparcado** (ver [`README.md`](./README.md) §0); ignóralo al construir v2.
> **Estado:** cimientos construidos (Fase 0 + productización previas).
> **Lee primero:** [`README.md`](./README.md) (invariantes transversales INV-1…INV-6, DoD global, convenciones).

---

## 1. Contexto y objetivo

### 1.1 Reencuadre (crítico)
La Fase 0 **NO es "scaffolding con stubs"**. Es **la Fase 0 de producción** del blueprint: el monorepo de dominio funcionando **más** el generador de pruebas de Aula **end-to-end** sobre un **corpus OA real mínimo** (2–3 OA reales de una asignatura/curso + Decreto 67 art. 18 real). Calidad de producción. Las únicas dobles permitidas son *test doubles* legítimos: `FakeEmbeddings`/`FakeReranker` mientras no haya API key de Voyage.

### 1.2 Objetivo
**Demostrar la arquitectura completa en un solo flujo de valor real:** que un docente pueda pedir una prueba alineada a OA y que el sistema la genere, la valide con gates deterministas, la persista como `borrador` y deje `traza_ia` reproducible — con todos los límites de capas, el worker asíncrono y el corpus versionado ya en su lugar.

### 1.3 Decisiones confirmadas por el dueño (de `prompt-scaffolding-faro.md`)
- **API keys:** Anthropic **SÍ** (generación real con Claude). Voyage **NO aún** → `VoyageEmbeddingsAdapter` tras el puerto, pero se corre con `FakeEmbeddings` (determinista) hasta tener la key; el ranking semántico real llega en Fase 1.
- **Reranker:** adapter basado en **Haiku** (sin dependencia nueva).
- **Corpus mínimo real:** **lo entrega el dueño** (OA reales + un reglamento de evaluación real). Pedírselo al inicio y **esperar a tenerlo**; NO inventar OA ni contenido pedagógico. Mientras no llegue, avanzar con todo lo que NO depende del corpus (monorepo, DB/migraciones, puertos, adapters, gates, tests) y dejar el seed + el e2e del slice como último paso.
- **Arquitectura adoptada:** ADR-002 (monorepo de dominio, hexagonal), ADR-003 (generación asíncrona worker/cola), ADR-004 (`corpus_version` de primera clase).
- **Deploy:** Node server local + worker; **no** decidir Vercel ahora (pregunta abierta global #4).

### 1.4 Épicas cubiertas
Épica A completa + **semillas** de B (HybridRetriever sobre seed), E (gates + traza + 1 eval) y G (slice de pruebas de Aula).

---

## 2. Alcance

### 2.1 Entra
- **Monorepo + tooling** (ADR-002): `tsconfig` strict, ESLint con lint de boundaries, Prettier, Vitest, CI (lint + typecheck + test + build), scripts pnpm.
- **DB:** docker-compose Postgres+pgvector; schema Drizzle del blueprint §5 (subconjunto Fase 0, ver §4.3); índices `ivfflat` + GIN; migración + **seed con corpus mínimo real**.
- **`packages/domain`:** entidades + puertos (firmas TS) + los 4 schemas Zod + reglas deterministas (vigencia, validez de cita, ítem→OA, una-sola-correcta).
- **`packages/infra-ai`:** `AnthropicLlmAdapter` (routing + caching + `parse()` + usage log).
- **`packages/infra-db`:** repositorios Drizzle + `HybridRetriever` **real** (vector + BM25 + RRF) sobre el seed.
- **Adapters de embeddings/reranker** + sus fakes (`FakeEmbeddings`, `FakeReranker`).
- **Gates reales y deterministas:** `pedagogicalGate` + `citationGate` (parte determinista bloqueante; el "¿respalda la afirmación?" LLM queda como **TODO claramente marcado**).
- **Cola + worker** (ADR-003): tabla `job_generacion` con `SELECT … FOR UPDATE SKIP LOCKED`; `apps/worker`.
- **Vertical slice:** `POST /api/aula/prueba` → encola → worker → genera `Prueba` → `pedagogicalGate` → persiste `documento_generado(borrador)` + `traza_ia(corpus_version)` → `GET /api/aula/prueba/:id`.
- **Tests:** unit de RRF y `pedagogicalGate`; 1 caso `recall@k` sobre el seed; 1 e2e del slice.
- **README** (levantar y probar el slice) + `.env.example`.

### 2.2 NO entra (deferido)
| Deferido | A la fase |
|---|---|
| Voyage real (embeddings semánticos reales) | Fase 1 |
| CLI `apps/ingest` con chunking estructural completo (ley→art→inciso→letra; OA→indicador) | Fase 1 |
| Expansión GraphRAG (CTE recursiva sobre `norma_relacion`) | Fase 1 |
| Reranker Cohere (cross-encoder externo) | Fase 1 (opcional) |
| Verificación LLM "¿la cita respalda la afirmación?" (parte (c) del gate) | Fase 1/3 (TODO marcado en Fase 0) |
| `corpus_version` *publicable* con ciclo borrador→publicada→retirada y re-indexación | Fase 1 (en Fase 0: una versión `publicada` por seed) |
| Clases + export `.pptx`/`.docx`/`.pdf` real | Fase 2 |
| Variante NEE/DUA de la prueba (Decreto 83) | Fase 2 |
| Chat normativo M3 + auditoría de reglamento | Fase 3 |
| PME Fase Anual | Fase 4 |
| RLS Postgres, DPA, página de transparencia, dashboard de costos | Fase 5 |
| Auth/RBAC completo | Fase 5 (en Fase 0: identidad mínima para `autor_humano`, ver §9) |

---

## 3. Requisitos funcionales (RF-0.n)

> Cada RF es *testable*. Origen entre paréntesis.

- **RF-0.1 · Monorepo con fronteras físicas.** Existen `packages/{domain,application,infra-db,infra-ai,config,observability}` y `apps/{web,worker}`, cableados con pnpm workspaces y `tsconfig` references. *(ADR-002; blueprint §4)*
- **RF-0.2 · Lint de boundaries.** `packages/domain` no puede importar `@anthropic-ai/*`, `drizzle*`, `next*` ni ningún `infra-*`/`apps/*`; `application` solo importa `domain`. El lint **falla** ante una violación. *(INV-5; blueprint §4)*
- **RF-0.3 · DB + extensiones.** `docker-compose up` levanta Postgres con `pgvector`; las migraciones Drizzle crean las tablas de §4.3 con índices `ivfflat` (vector) y GIN (`tsvector`). Migración up/down aplica sin error. *(Épica A2; blueprint §5)*
- **RF-0.4 · Corpus versionado mínimo.** Existe `corpus_version`; el seed crea **una** versión en estado `publicada` y todo `chunk_*`/`norma`/`objetivo_aprendizaje` la referencia. *(ADR-004; INV-4)*
- **RF-0.5 · Seed real mínimo.** El seed carga 2–3 OA reales (asignatura/curso entregados por el dueño) + Decreto 67 art. 18 real, con su `referencia` canónica y vigencia. **No se inventa contenido pedagógico ni normativo.** *(Scaffolding §Decisiones; pregunta abierta #6)*
- **RF-0.6 · Entidades y puertos del dominio.** `packages/domain` expone las entidades (`Norma`, `Vigencia`, `ObjetivoAprendizaje`, `Prueba`, `Clase`, `DocumentoGenerado`, `Cita`) y los puertos con firmas TS (§4.4). TS puro, sin I/O. *(Blueprint §1.1, §6)*
- **RF-0.7 · Schemas Zod.** Existen los 4 schemas (`Prueba`, `Clase`, `PmeAccion`, `ReglamentoAuditoria`) en `domain/schemas`. *(Plan §3; blueprint §4)*
- **RF-0.8 · Reglas deterministas.** En `domain` viven, como funciones puras testeables sin red: (a) **vigencia** (`vigencia_hasta` NULL o > hoy ∧ `estado_vigencia='vigente'`); (b) **validez de cita** (existe + vigente); (c) **ítem→OA existe** en el curso/asignatura; (d) **una-sola-correcta** en selección múltiple; (e) **suma de puntajes** consistente con la tabla de especificaciones. *(INV-1; blueprint §8)*
- **RF-0.9 · `AnthropicLlmAdapter`.** Implementa `LlmPort`: rutea modelo por tarea (§4.5), fija `thinking:{type:"adaptive"}`, aplica `cache_control:{type:"ephemeral"}` sobre el bloque de corpus, usa `messages.parse()` + `zodOutputFormat`, **maneja `parsed_output === null`** (refusal/max_tokens → `GeneracionError`, nunca persiste basura), y **loguea `usage`** (incl. `cache_read_input_tokens`). *(Épica A4; blueprint §7; ADR-005)*
- **RF-0.10 · Routing capado por modelo.** El router fija `effort:max` **solo** en Opus; Sonnet/Haiku se capan (darían 400). *(Blueprint §7.1; ADR-005)*
- **RF-0.11 · Prompt caching verificable.** El prefijo `system` es estable (corpus primero, datos del colegio al final; sin `Date.now()` ni JSON desordenado). El adapter emite warning si `cache_read_input_tokens` es 0 en una 2ª llamada con prefijo idéntico. *(Épica B6; blueprint §7.3)*
- **RF-0.12 · Adapters de embeddings/reranker + fakes.** `VoyageEmbeddingsAdapter` (real, tras el puerto) y `FakeEmbeddings` (determinista); `RerankerAdapter` (Haiku) y `FakeReranker`. La dimensión del embedding la fija `corpus_version`, no el código. *(Scaffolding; blueprint §6, §7.1)*
- **RF-0.13 · `HybridRetriever` real.** Implementa `RetrievalPort.hibrida`: vector (`<=>`) + BM25 (`ts_rank_cd`) en paralelo, **fusión RRF**, pre-filtro por vigencia y `corpus_version`. Sobre el seed (no stub). *(Épica B3; blueprint §6)*
- **RF-0.14 · `pedagogicalGate` determinista.** Bloquea: ítem sin OA existente; selección múltiple sin exactamente una correcta; suma de puntajes inconsistente. Marca (no bloquea): distractores triviales. **TODO marcado:** distractores plausibles / sesgo (LLM, Fase posterior). *(Épica G3; blueprint §8.2)*
- **RF-0.15 · `citationGate` determinista.** Bloquea: cita inexistente en `corpus_version`; cita no vigente. **TODO marcado:** "¿respalda la afirmación?" (LLM Haiku). *(Blueprint §8.1; ADR-001 §D)*
- **RF-0.16 · Cola + worker.** `POST` crea `documento_generado(estado_generacion='encolado')` + `job_generacion` y responde `202 {documentoId}`. `apps/worker` consume con `FOR UPDATE SKIP LOCKED`, ejecuta el use case, persiste resultado + `traza_ia`, marca el job. *(ADR-003; blueprint §3.3, §5.7)*
- **RF-0.17 · Slice de Aula end-to-end.** `GenerarPruebaUseCase` compone: recuperar contexto OA (HybridRetriever) → generar `Prueba` (structured output) → `pedagogicalGate` (+ `citationGate` sobre las citas a OA/Decreto 67) → persistir `documento_generado(borrador)` + `traza_ia(corpus_version)`. **Nace `borrador`.** *(Épica G2; blueprint §2.2, §11; INV-2, INV-3)*
- **RF-0.18 · Estado del job (poll).** `GET /api/aula/prueba/:id` devuelve `estado_generacion` y, si está `validado`, el contenido + citas + hallazgos de gates. *(ADR-003; blueprint §2.2)*
- **RF-0.19 · Reintento acotado.** Si los chequeos deterministas bloqueantes fallan, se permite **un** reintento de generación con los hallazgos en el prompt; si vuelve a fallar, el documento queda `borrador` + `estado_generacion='fallido'` con hallazgos visibles (nunca se auto-aprueba). *(Blueprint §8.2)*
- **RF-0.20 · Config validada al boot.** `packages/config` valida con Zod la presencia de variables de entorno (incl. `ANTHROPIC_API_KEY`); sin keys de IA, los adapters **degradan con error claro** (no rompen el build, no silencian). `.env.example` documenta todas. *(Blueprint §9.5, §10.3)*
- **RF-0.21 · Observabilidad mínima.** Logger estructurado en `packages/observability`; el adapter de IA registra tokens/costo por llamada; `traza_ia.usage` guarda `input/output/cache_read/cache_creation`. **Sin `console.log`.** *(Blueprint §7.5; CLAUDE.md)*
- **RF-0.22 · `traza_ia` reproducible.** Cada generación escribe `traza_ia` con `corpus_version_id`, `modelo`, `ruta_decision`, `prompt_hash`, `recuperado` (IDs + scores), `citas`, `evals` (gates), `usage`. *(INV-4; blueprint §5.6)*

---

## 4. Diseño técnico + contratos

### 4.1 Estructura de repositorio (subconjunto Fase 0)
```
faro/
├── pnpm-workspace.yaml
├── package.json                 # scripts raíz (pnpm -r)
├── tsconfig.base.json           # strict:true, noUncheckedIndexedAccess
├── docker-compose.yml           # postgres + pgvector
├── drizzle.config.ts
├── .env.example
├── eslint.config.js             # boundaries entre capas (INV-5)
├── .github/workflows/ci.yml
├── packages/
│   ├── domain/                  # TS puro — entities, value-objects, ports, gates, schemas, errors
│   ├── application/             # use cases — aula/GenerarPruebaUseCase, shared/pipelineRag
│   ├── infra-db/                # schema Drizzle, repositories, retrieval (HybridRetriever), migrations, seed
│   ├── infra-ai/               # anthropic (adapter+router+cache+usageLogger), voyage (+fake), rerank (+fake)
│   ├── observability/          # logger estructurado, métricas de tokens
│   └── config/                 # carga/validación de env (Zod)
├── apps/
│   ├── web/                    # Next.js App Router — api/aula/prueba, api/health, composition-root
│   └── worker/                 # consumidor de job_generacion
└── evals/
    ├── datasets/               # 1 caso recall@k sobre el seed
    ├── runners/
    └── thresholds.json
```

> `infra-export`, `infra-ocr`, `apps/ingest`, `pme/`, `normativo/` se introducen en sus fases (2/1/3/4). No se crean vacíos en Fase 0.

### 4.2 Reglas de boundaries (ESLint — RF-0.2)
- En `packages/domain`: `no-restricted-imports` bloquea `@anthropic-ai/*`, `drizzle*`, `next*`, `pg`, y cualquier `infra-*`/`apps/*`.
- `application` solo importa `domain`.
- `infra-*` importa `domain` (para implementar puertos) y `application` solo si expone use cases; nunca `apps/*`.
- La *composition root* (DI) vive **solo** en `apps/web/lib/composition-root.ts` y `apps/worker`.

### 4.3 Modelo de datos (DDL de referencia — Fase 0)
> Postgres + pgvector. Dimensión de embedding **fijada por `corpus_version`** (no hardcodeada). En Fase 0 el seed usa `FakeEmbeddings`; se fija `embedding_dim` del seed a un valor de prueba (p. ej. 1024) y se documenta. La dim real de `voyage-law-2` es `[VERIFICAR]` para Fase 1.

```sql
-- Snapshot inmutable de la ingesta (ADR-004, INV-4).
CREATE TABLE corpus_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etiqueta        text NOT NULL,                     -- 'seed-fase0-2026-06'
  embedding_model text NOT NULL,                     -- 'fake-embeddings' en Fase 0
  embedding_dim   int  NOT NULL,                     -- p.ej. 1024
  estado          text NOT NULL DEFAULT 'borrador',  -- borrador | publicada | retirada
  created_at      timestamptz NOT NULL DEFAULT now(),
  publicada_at    timestamptz
);

-- Norma (parent-document citable). 'cuerpo' = texto canónico citable.
CREATE TABLE norma (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
  tipo              text NOT NULL,                   -- ley | decreto | plan | orientacion
  referencia        text NOT NULL,                   -- 'Decreto 67/2018 art. 18 lit. f'
  titulo            text NOT NULL,
  cuerpo            text NOT NULL,
  vigencia_desde    date,
  vigencia_hasta    date,                            -- NULL = vigente
  estado_vigencia   text NOT NULL DEFAULT 'vigente', -- vigente | derogado | modificado
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE chunk_norma (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norma_id          uuid NOT NULL REFERENCES norma(id) ON DELETE CASCADE,
  corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
  texto             text NOT NULL,
  embedding         vector(1024) NOT NULL,           -- dim según corpus_version
  tsv               tsvector GENERATED ALWAYS AS (to_tsvector('spanish', texto)) STORED
);
CREATE INDEX idx_chunk_norma_embed ON chunk_norma USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunk_norma_tsv   ON chunk_norma USING gin (tsv);
CREATE INDEX idx_norma_vigencia    ON norma (corpus_version_id, estado_vigencia, vigencia_hasta);

-- Relaciones del grafo (estructura presente; expansión GraphRAG = Fase 1).
CREATE TABLE norma_relacion (
  origen_id  uuid NOT NULL REFERENCES norma(id),
  destino_id uuid NOT NULL REFERENCES norma(id),
  tipo       text NOT NULL,                          -- consolida_en_pme | deroga | modifica | requiere
  PRIMARY KEY (origen_id, destino_id, tipo)
);

-- Currículum (OA) — mismo patrón parent/chunk.
CREATE TABLE objetivo_aprendizaje (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
  codigo            text NOT NULL,                   -- 'MA06 OA 02' (citable)
  asignatura        text NOT NULL,
  nivel             text NOT NULL,                   -- '6º básico'
  descripcion       text NOT NULL,
  indicadores       jsonb NOT NULL DEFAULT '[]'::jsonb,
  vigencia_desde    date,
  vigencia_hasta    date
);
CREATE TABLE chunk_oa (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oa_id             uuid NOT NULL REFERENCES objetivo_aprendizaje(id) ON DELETE CASCADE,
  corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
  texto             text NOT NULL,
  embedding         vector(1024) NOT NULL,
  tsv               tsvector GENERATED ALWAYS AS (to_tsvector('spanish', texto)) STORED
);
CREATE INDEX idx_chunk_oa_embed ON chunk_oa USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunk_oa_tsv   ON chunk_oa USING gin (tsv);

-- Establecimiento (RBD + dependencia; reglamento del colegio para Aula/auditoría).
CREATE TABLE establecimiento (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rbd          text UNIQUE NOT NULL,
  nombre       text NOT NULL,
  dependencia  text NOT NULL,                        -- municipal | slep | part_subv | part_pagado
  slep_id      uuid,
  convenio_sep boolean NOT NULL DEFAULT false,
  reglamento_evaluacion jsonb
);

CREATE TABLE usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid REFERENCES establecimiento(id),
  email text UNIQUE NOT NULL,
  rol  text NOT NULL                                 -- docente | utp | direccion | admin
);

-- Documento generado + estado HIL (INV-2, INV-3).
CREATE TABLE documento_generado (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL REFERENCES establecimiento(id),
  tipo               text NOT NULL,                  -- prueba (clase|reglamento_auditoria|pme_fase_anual = fases posteriores)
  contenido          jsonb NOT NULL,
  citas              jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado_revision    text NOT NULL DEFAULT 'borrador',  -- borrador | en_revision | aprobado | rechazado
  estado_generacion  text NOT NULL DEFAULT 'encolado',  -- encolado | generando | validado | fallido
  autor_humano       uuid REFERENCES usuario(id),
  resultado_gates    jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  aprobado_at        timestamptz,
  -- INV-3: no hay 'aprobado' sin revisor humano.
  CONSTRAINT chk_aprobado_requiere_humano
    CHECK (estado_revision <> 'aprobado' OR autor_humano IS NOT NULL)
);

-- Auditoría de IA (Art. 8 bis + reproducibilidad — INV-4).
CREATE TABLE traza_ia (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id      uuid NOT NULL REFERENCES documento_generado(id),
  corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
  modelo            text NOT NULL,
  ruta_decision     text NOT NULL,
  prompt_hash       text NOT NULL,
  recuperado        jsonb NOT NULL,                  -- IDs + rerank-scores (auditable)
  citas             jsonb NOT NULL,
  evals             jsonb,                           -- resultado de gates
  usage             jsonb NOT NULL,                  -- input/output/cache_read/cache_creation
  revisor           uuid REFERENCES usuario(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Cola de generación (ADR-003).
CREATE TABLE job_generacion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES documento_generado(id),
  estado       text NOT NULL DEFAULT 'pendiente',    -- pendiente | en_proceso | hecho | fallido
  intentos     int  NOT NULL DEFAULT 0,
  locked_by    text, locked_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- consumo del worker: SELECT ... WHERE estado='pendiente' FOR UPDATE SKIP LOCKED LIMIT 1
```

> `consentimiento` (Ley 21.719) **no** se crea en Fase 0 (entra vacío de uso en Fase 5/M2). Fase 0 opera **a nivel curso/contenido, no individualizado por alumno** (bajo riesgo) — comentario inline donde se toquen datos del colegio.

### 4.4 Puertos del dominio (firmas TS — `packages/domain/src/ports`)
```ts
// retrieval.ts
export interface FiltrosRecuperacion {
  readonly corpusVersionId: string;
  readonly soloVigentes: boolean;
  readonly dependencia?: Dependencia;
  readonly tipoNorma?: TipoNorma;
}
export interface Recuperado<T> {
  readonly item: T;                 // parent-document completo (Norma u OA)
  readonly score: number;           // fusión RRF / rerank
  readonly via: 'vector' | 'bm25' | 'grafo';
}
export interface RetrievalPort {
  hibrida(query: string, f: FiltrosRecuperacion, k: number): Promise<Recuperado<Norma>[]>;
  hibridaOa(query: string, f: FiltrosRecuperacion, k: number): Promise<Recuperado<ObjetivoAprendizaje>[]>;
}

// embeddings.ts
export interface EmbeddingsPort {
  embed(textos: readonly string[], modo: 'query' | 'document'): Promise<number[][]>;
  readonly dimension: number;       // la fija corpus_version
}

// reranker.ts
export interface RerankerPort {
  ordenar<T>(query: string, candidatos: readonly Recuperado<T>[], topK: number): Promise<Recuperado<T>[]>;
}

// llm.ts
export type Tarea = 'extraccion' | 'redaccion' | 'razonamiento_normativo' | 'verificacion';
export interface BloqueSistema { readonly texto: string; readonly cacheable: boolean; }
export interface UsoTokens {
  readonly input: number; readonly output: number;
  readonly cacheRead: number; readonly cacheCreation: number;
}
export interface SalidaEstructurada<T> {
  readonly parsed: T | null; readonly stopReason: string; readonly usage: UsoTokens; readonly modelo: string;
}
export interface LlmPort {
  generar<T>(args: {
    tarea: Tarea;
    schema: ZodType<T>;
    system: readonly BloqueSistema[];   // prefijo estable primero; corpus cacheado
    entradaUsuario: string;
  }): Promise<SalidaEstructurada<T>>;
}

// verification.ts
export interface ResultadoVerificacion {
  readonly ok: boolean;
  readonly hallazgos: readonly { citaRef: string; motivo: 'inexistente' | 'derogada' | 'no_respalda' }[];
}
export interface VerificationGate {
  // (a)(b) deterministas contra DB; (c) "¿respalda?" = TODO LLM (Fase 1/3).
  verificarCitas(citas: readonly Cita[], contexto: readonly Norma[], corpusVersionId: string): Promise<ResultadoVerificacion>;
}

// clock.ts — inyectable para que las reglas de vigencia sean testeables sin red (INV-1).
export interface ClockPort { hoy(): Date; }

// repositories.ts (firmas — el DDL es detalle del adapter)
export interface NormaRepository {
  recuperarVigentesPorVersion(corpusVersionId: string, filtros: FiltrosRecuperacion): Promise<Norma[]>;
  porIds(ids: readonly string[]): Promise<Norma[]>;
}
export interface OaRepository {
  porAsignaturaCurso(asignatura: string, curso: string, corpusVersionId: string): Promise<ObjetivoAprendizaje[]>;
  porIds(ids: readonly string[]): Promise<ObjetivoAprendizaje[]>;
}
export interface DocumentoRepository {
  crearBorrador(input: NuevoDocumento): Promise<DocumentoGenerado>;
  marcarGeneracion(id: string, estado: EstadoGeneracion, contenido?: unknown, gates?: unknown): Promise<void>;
  porId(id: string): Promise<DocumentoGenerado | null>;
}
export interface TrazaRepository { registrar(traza: NuevaTraza): Promise<void>; }
export interface JobRepository {
  encolar(documentoId: string): Promise<void>;
  tomarSiguiente(workerId: string): Promise<{ id: string; documentoId: string } | null>; // FOR UPDATE SKIP LOCKED
  marcar(id: string, estado: 'hecho' | 'fallido'): Promise<void>;
}
```

### 4.5 Política de routing (`infra-ai/anthropic/router.ts` — RF-0.10)
```ts
// IDs exactos (consultar skill /claude-api ante dudas): claude-opus-4-8 | claude-sonnet-4-6 | claude-haiku-4-5
const RUTA: Record<Tarea, { modelo: string; effort: 'low' | 'medium' | 'high' | 'max' }> = {
  extraccion:             { modelo: 'claude-haiku-4-5',  effort: 'medium' },
  verificacion:           { modelo: 'claude-haiku-4-5',  effort: 'low'    },
  redaccion:              { modelo: 'claude-sonnet-4-6', effort: 'medium' }, // default: generar Prueba
  razonamiento_normativo: { modelo: 'claude-opus-4-8',   effort: 'high'   },
};
// INVARIANTE: 'max' solo es válido en Opus. El router CAPA effort por modelo
// (Sonnet/Haiku dan 400 con 'max'). thinking:{type:"adaptive"} en todas.
// System prompt pide "solo el artefacto, sin preámbulo" (Opus 4.8 narra más).
```
> **Nota IA (CLAUDE.md §5):** antes de fijar IDs, precios, mínimos de caching o límites de tokens, **consultar la skill `claude-api`** — no responder de memoria. Mínimos de caching: **4096** tokens (Opus/Haiku), **2048** (Sonnet). `parsed_output` puede ser `null` → manejar siempre.

### 4.6 Schemas Zod (los 4 — `domain/schemas`)
En Fase 0 el slice usa **`Prueba`**; los otros tres se definen (RF-0.7) y se ejercitan en sus fases.

```ts
// schemas/prueba.ts
export const ItemPrueba = z.object({
  oa: z.string(),                                    // OA al que tributa
  habilidad: z.enum(["recordar","comprender","aplicar","analizar","evaluar","crear"]),
  tipo: z.enum(["seleccion_multiple","verdadero_falso","desarrollo","completacion"]),
  enunciado: z.string(),
  alternativas: z.array(z.object({ texto: z.string(), correcta: z.boolean() })).optional(),
  respuesta_correcta: z.string().optional(),
  puntaje: z.number(),
});
export const Prueba = z.object({
  asignatura: z.string(),
  curso: z.string(),
  tabla_especificaciones: z.array(z.object({ oa: z.string(), n_items: z.number(), puntaje: z.number() })),
  items: z.array(ItemPrueba),
  pauta_correccion: z.string(),
  alineada_reglamento: z.boolean(),                  // respeta reglamento Decreto 67 [E10]
  version_nee_dua: z.boolean(),                      // variante Decreto 83 [E11] (Fase 2)
});
```
> **Importante (blueprint §3.1, §7.2):** los constraints numéricos (`min/max`, conteos) **no** se delegan al schema (el SDK no los soporta en structured outputs) — se validan en `pedagogicalGate` determinista. `Clase`, `PmeAccion` y `ReglamentoAuditoria` se incluyen tal cual el plan §3.

### 4.7 Gates deterministas (`domain/gates` — RF-0.14/0.15)
**`pedagogicalGate(prueba, oaDelCurso)`** → `ResultadoGate`:

| Chequeo | Tipo | Acción |
|---|---|---|
| Cada ítem referencia un **OA existente** del curso/asignatura | Determinista | **Bloquea** |
| Selección múltiple con **exactamente una** correcta | Determinista | **Bloquea** |
| Suma de puntajes ↔ tabla de especificaciones cuadra | Determinista | **Bloquea** |
| Distractores no triviales (no vacíos/duplicados, longitud razonable) | Heurística | Marca |
| Distractores plausibles / sesgo | LLM | **TODO** (Fase posterior) |

**`citationGate(citas, corpusVersion)`** → `ResultadoVerificacion`:

| Chequeo | Tipo | Acción |
|---|---|---|
| La cita **existe** en `corpus_version` | Determinista (DB) | **Bloquea** |
| La cita está **vigente** | Determinista (DB) | **Bloquea** |
| La cita **respalda** la afirmación | LLM (Haiku) | **TODO** (Fase 1/3) |

> Los bloqueantes corren **primero**. Comportamiento de reintento: RF-0.19.

### 4.8 Orquestación del slice (`application` — RF-0.17)
```ts
// application/shared/pipelineRag.ts — compone puertos; sin SDK ni SQL (testeable con fakes).
export async function recuperarContextoOa(
  query: string, f: FiltrosRecuperacion, p: PipelinePorts,
): Promise<Recuperado<ObjetivoAprendizaje>[]> {
  const semillas = await p.retrieval.hibridaOa(query, f, 30);   // prefiltro vigencia + híbrida + RRF
  // Fase 0: sin expansión por grafo (Fase 1). Parent-document ya viene completo.
  return p.reranker.ordenar(query, semillas, 8);
}

// application/aula/GenerarPruebaUseCase.ts
export class GenerarPruebaUseCase {
  async ejecutar(job: { documentoId: string; asignatura: string; curso: string; oaIds: string[] }) {
    const oa = await this.recuperar(job);                       // HybridRetriever sobre el seed
    const salida = await this.llm.generar({ tarea: 'redaccion', schema: Prueba, system: this.system(oa), entradaUsuario: this.entrada(job) });
    if (!salida.parsed) throw new GeneracionError(salida.stopReason);   // null → fallido, no persiste
    const ped = pedagogicalGate(salida.parsed, oa);
    const cit = await this.citas.verificarCitas(extraerCitas(salida.parsed), [], job /*corpusVersion*/);
    if (ped.bloquea || !cit.ok) { /* RF-0.19: 1 reintento; si falla → fallido + hallazgos */ }
    await this.docs.marcarGeneracion(job.documentoId, 'validado', salida.parsed, { ped, cit });  // sigue 'borrador'
    await this.traza.registrar({ documentoId: job.documentoId, corpusVersionId, modelo: salida.modelo, recuperado: oa, citas: cit, evals: { ped, cit }, usage: salida.usage });
  }
}
```

### 4.9 Contratos de API (`apps/web/app/api`)
```
POST /api/aula/prueba
  body: { asignatura: string, curso: string, oaIds: string[], establecimientoId: string }
  201/202 → { documentoId: string, estado: "generando" }     // crea documento(borrador, encolado) + job

GET /api/aula/prueba/:id
  200 → { documentoId, estadoGeneracion: "encolado"|"generando"|"validado"|"fallido",
          estadoRevision: "borrador", contenido?: Prueba, citas?: Cita[], hallazgos?: ResultadoGates }

GET /api/health → 200 { ok: true, db: boolean, anthropic: boolean }
```
> El `POST` **nunca** genera en el request (ADR-003): encola y responde. El worker procesa. La UI hace *polling* sobre el `GET`.

### 4.10 Worker (loop — `apps/worker`)
```ts
// Pseudocódigo: consumo idempotente con SKIP LOCKED.
while (running) {
  const job = await jobs.tomarSiguiente(workerId);       // FOR UPDATE SKIP LOCKED LIMIT 1
  if (!job) { await esperar(intervalo); continue; }
  try { await generarPrueba.ejecutar(job); await jobs.marcar(job.id, 'hecho'); }
  catch (e) { logger.error(...); await jobs.marcar(job.id, 'fallido'); /* documento queda fallido + hallazgos */ }
}
```

---

## 5. Historias → tareas (commits)

> Un commit convencional por unidad (orden del scaffolding §Pasos). Cada historia hereda el DoD global.

- **H-0.1 · `chore: init monorepo`** — git, pnpm workspaces, `tsconfig` strict (`noUncheckedIndexedAccess`), ESLint + boundaries, Prettier, Vitest, CI (lint+typecheck+test+build), scripts pnpm (`dev/build/lint/typecheck/test/db:migrate/db:seed`). → *CA-0.1*
- **H-0.2 · `feat(db): pgvector + schema + corpus_version + migración`** — docker-compose; schema Drizzle §4.3; índices ivfflat + GIN; migración up/down. → *CA-0.3, CA-0.4*
- **H-0.3 · `feat(domain): entidades + puertos + schemas Zod + reglas`** — entidades + value-objects; puertos §4.4; 4 schemas Zod; reglas deterministas (vigencia, cita válida, ítem→OA, una-correcta, suma puntajes); `ClockPort`. → *CA-0.6, CA-0.7, CA-0.8*
- **H-0.4 · `feat(infra-ai): AnthropicLlmAdapter`** — router §4.5; `cache_control`; `messages.parse()` + `zodOutputFormat`; manejo `null`; usageLogger. → *CA-0.9, CA-0.10, CA-0.11*
- **H-0.5 · `feat(infra): repos Drizzle + embeddings/reranker adapters (+fakes)`** — `Drizzle*Repository`; `VoyageEmbeddingsAdapter`+`FakeEmbeddings`; `RerankerAdapter`(Haiku)+`FakeReranker`. → *CA-0.12*
- **H-0.6 · `feat(retrieval): HybridRetriever (vector+BM25+RRF) sobre el seed`** — SQL vector `<=>` + `ts_rank_cd`; fusión RRF; pre-filtro vigencia/version. → *CA-0.13*
- **H-0.7 · `feat(verification): pedagogicalGate + citationGate (+TODO LLM)`** — gates §4.7; TODO "¿respalda?" marcado. → *CA-0.14, CA-0.15*
- **H-0.8 · `feat(aula): slice POST → worker → gates → persistencia → GET`** — endpoints §4.9; cola+worker §4.10; `GenerarPruebaUseCase` §4.8; composition root. → *CA-0.16, CA-0.17, CA-0.18, CA-0.19*
- **H-0.9 · `feat(db): seed con corpus mínimo REAL`** — *(último paso; requiere material del dueño)* 2–3 OA reales + Decreto 67 art. 18; embeddings vía `FakeEmbeddings`; `corpus_version` `publicada`. → *CA-0.5*
- **H-0.10 · `test: RRF + pedagogicalGate + recall@k + e2e`** — unit RRF y gate; 1 `recall@k` sobre el seed; 1 e2e del slice. → *CA-0.20*
- **H-0.11 · `docs: README + .env.example`** — levantar (compose up → migrate → seed → dev) + probar el slice; `.env.example` con todas las variables. → *CA-0.21*

---

## 6. Criterios de aceptación (CA-0.n)

- **CA-0.1** `pnpm build`, `lint` (incl. boundaries), `typecheck`, `test` pasan en CI. Una violación de boundary (un `import` prohibido en `domain`) **falla** el lint.
- **CA-0.3** `docker-compose up` + `pnpm db:migrate` crea todas las tablas de §4.3; `down` revierte sin error.
- **CA-0.4** Todo `chunk_*`/`norma`/`objetivo_aprendizaje` del seed referencia una única `corpus_version` en estado `publicada`.
- **CA-0.5** El seed contiene **OA reales** (entregados por el dueño) + Decreto 67 art. 18 real, con `referencia` canónica y vigencia. No hay OA ni normas inventadas.
- **CA-0.6** `packages/domain` compila y testea **sin** `@anthropic-ai/*`, `drizzle*` ni `next*` entre sus deps (verificable en `package.json` + lint).
- **CA-0.7** Los 4 schemas Zod existen y validan ejemplos válidos/ inválidos.
- **CA-0.8** Las reglas deterministas tienen tests sin DB ni LLM (con `ClockPort` fake para vigencia).
- **CA-0.9** Una llamada de prueba del `AnthropicLlmAdapter` registra `usage` con `cache_read_input_tokens`; `parsed_output === null` produce `GeneracionError` y **no** persiste.
- **CA-0.10** `effort:'max'` solo se envía a Opus; el router capa Sonnet/Haiku (test unit del router).
- **CA-0.11** En una **2ª** llamada con prefijo `system` idéntico, `cache_read_input_tokens > 0`; si es 0, el adapter emite warning.
- **CA-0.12** `FakeEmbeddings`/`FakeReranker` son deterministas (misma entrada → misma salida) y permiten correr el slice sin keys.
- **CA-0.13** Una query sobre el seed devuelve **solo vigentes** y captura un término exacto presente en el corpus (p. ej. "art. 18"); la fusión RRF ordena candidatos de vector y BM25.
- **CA-0.14** `pedagogicalGate` **bloquea** una prueba con un ítem cuyo OA no existe en el curso, o con selección múltiple sin exactamente una correcta, o con suma de puntajes inconsistente.
- **CA-0.15** `citationGate` **bloquea** una cita inexistente o no vigente; el chequeo "¿respalda?" está marcado como TODO (no falsea un OK).
- **CA-0.16** `POST /api/aula/prueba` responde `202 {documentoId}` y crea `documento_generado(borrador, encolado)` + `job_generacion(pendiente)`; **no** genera en el request.
- **CA-0.17** El worker toma el job con `SKIP LOCKED`, genera, pasa gates, persiste `documento_generado` y deja `traza_ia` con `corpus_version_id`.
- **CA-0.18** `GET /api/aula/prueba/:id` refleja el ciclo `encolado → generando → validado|fallido`; al validar, devuelve contenido + citas + hallazgos.
- **CA-0.19** Si los gates bloquean dos veces, el documento queda `borrador` + `estado_generacion='fallido'` con hallazgos visibles; **nunca** `aprobado`.
- **CA-0.20** Tests verdes: unit RRF, unit `pedagogicalGate`, 1 `recall@k` sobre el seed, 1 e2e del slice (POST→worker→GET).
- **CA-0.21** Siguiendo el README desde cero (compose up → migrate → seed → dev), un tercero genera una prueba de punta a punta.

### DoD de cierre de fase (blueprint §11)
`pnpm build/lint/typecheck/test` verdes en CI · la prueba se genera de punta a punta con el seed · cada generación deja `traza_ia` y **nace `borrador`** · `cache_read_input_tokens > 0` en una 2ª llamada idéntica.

---

## 7. Plan de pruebas + evals

| Nivel | Qué | Dónde | Sin red? |
|---|---|---|---|
| **Unit (dominio)** | RRF; `pedagogicalGate`; reglas de vigencia (con `ClockPort` fake); validez de cita; value-objects; router (cap de `effort`) | `domain`, `infra-db/retrieval`, `infra-ai` | **Sí** (INV-1) |
| **Integration** | repos Drizzle vs Postgres+pgvector (docker); `HybridRetriever` (vector `<=>` + `ts_rank_cd` + RRF) sobre el seed | `infra-db` | DB local, sin LLM |
| **Eval** | 1 caso `recall@k` sobre el seed (¿recupera el OA correcto?) | `evals` | Corpus fijo; LLM no requerido |
| **E2E** | slice: `POST` → worker → gates → `traza` → `GET` | `apps/web` + `apps/worker` | Stack completo (LLM real o grabado) |

- **Vitest** en todos los niveles. Fakes (`FakeEmbeddings`, `FakeLlm`, `FakeReranker`) en `infra-*/__fakes__` para use cases sin red.
- `evals/thresholds.json` se crea aquí (semilla): `recall@k` documentado; CI **falla** si baja del umbral una vez haya golden set (umbral pleno en Fase 1).

---

## 8. DoD + invariantes

**DoD:** el de §6 (CA-0.* + DoD de cierre) + el DoD global del [`README.md`](./README.md) §4.

**Invariantes materializados en esta fase:**
- **INV-1** — RRF, gates y reglas de vigencia viven en `domain` y se testean sin red.
- **INV-2** — el LLM produce el borrador; `pedagogicalGate`/`citationGate` deterministas corren antes de cualquier cambio de estado; el gate LLM ("¿respalda?") queda como TODO advisory, nunca aprueba.
- **INV-3** — `documento_generado` nace `borrador`; el `CHECK chk_aprobado_requiere_humano` impide `aprobado` sin `autor_humano`. No hay endpoint que apruebe en Fase 0.
- **INV-4** — `corpus_version` (una, `publicada`) + `traza_ia.corpus_version_id` en cada generación.
- **INV-5** — lint de boundaries + fronteras de paquete; `domain` sin deps de framework.
- **INV-6** — Voyage/reranker tras puertos; el slice corre con fakes sin tocar la lógica.

**Comentario de cumplimiento inline obligatorio** donde se toquen datos del colegio: *"nivel curso/contenido, no individualizado por alumno"* (bajo riesgo Ley 21.719 en MVP).

---

## 9. Riesgos y preguntas abiertas

**Bloqueantes para arrancar:**
- **PA-#6 (corpus mínimo real):** el dueño debe entregar OA reales (asignatura/curso) + reglamento de evaluación real. **No se inventa.** Mientras no llegue: avanzar H-0.1…H-0.8 y H-0.10 (parte e2e con datos sintéticos de *test*, claramente marcados) y dejar H-0.9 (seed real) + el e2e final como último paso.

**Riesgos (blueprint §12) y mitigación en Fase 0:**
| Riesgo | Mitigación |
|---|---|
| `cache_read=0` (invalidadores silenciosos) | Prefijo estable primero; warning automático si hit=0 en 2ª llamada (RF-0.11) |
| `voyage-law-2` dim distinta / sin key | Dim por `corpus_version`; `FakeEmbeddings` determinista; Voyage real → Fase 1 `[VERIFICAR]` |
| `effort:max` en Sonnet/Haiku → 400 | Router capa `effort` por modelo (RF-0.10) |
| `parsed_output: null` (refusal/max_tokens) | Manejo obligatorio → `GeneracionError`, job `fallido`, nunca persiste (RF-0.9) |
| Acoplar el dominio a frameworks | Fronteras físicas + lint de boundaries (RF-0.2) |
| Generación lenta bloquea HTTP | Worker + cola; `POST` devuelve 202 (RF-0.16) |

**Preguntas abiertas no bloqueantes (se arrastran al índice §6):**
- #1 Voyage dim/key (Fase 1) · #4 deploy prod (Fase 5) · #8 RLS día-1 (decidido: Fase 5).

**Decisión de identidad mínima (Fase 0):** RBAC completo es Fase 5; en Fase 0 basta una identidad mínima (`usuario` semilla) para poblar `autor_humano` cuando exista un flujo de aprobación. El slice de Fase 0 **no** aprueba documentos (quedan `borrador`), así que no requiere login completo. `[VERIFICAR con el dueño si el slice de demo necesita login o basta un usuario semilla]`.

---

> **Antes de terminar la fase:** confirmar CI verde y el slice corriendo con el seed real; entregar al dueño un resumen + cómo levantarlo + TODOs mapeados a Fases 1–5. **No** hacer push a remoto sin confirmación.
