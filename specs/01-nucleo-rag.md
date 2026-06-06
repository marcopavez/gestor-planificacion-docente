# Fase 1 — Núcleo del foso: ingesta real + RAG robusto completo

> **Spec de desarrollo** · Deriva de `docs/arquitectura-faro.md` §11 (Fase 1) + §6, `docs/adr-001-recuperacion-rag.md`, `docs/adr-004-corpus-versionado.md`, épica B de `docs/plan-implementacion-faro.md`.
> **Estado:** se construye sobre la Fase 0. Bloqueada por preguntas abiertas #1 (Voyage), #6 (corpus real) y la selección del golden set por experto de dominio.
> **Lee primero:** [`README.md`](./README.md) (invariantes INV-1…INV-6) y [`00-cimientos.md`](./00-cimientos.md) (la base que esta fase completa).

---

## 1. Contexto y objetivo

### 1.1 Qué entrega
El **foso real**: los dos *knowledge graphs* curados —normativa MINEDUC (6 planes + Decreto 67/83 subset, con vigencias y relaciones) y currículum nacional (OA/indicadores)— con **recuperación robusta completa del ADR-001**. Donde la Fase 0 corrió un `HybridRetriever` sobre un seed mínimo con `FakeEmbeddings`, la Fase 1 lo lleva a producción: ingesta real con chunking estructural, embeddings reales (Voyage), expansión por grafo (GraphRAG), reranking real, parent-document, y **`corpus_version` publicable** con re-indexación versionada.

### 1.2 Objetivo
Poder **afirmar** —con evals en CI— que la recuperación es robusta: `recall@k ≥ 0.90`, que trae solo normas **vigentes**, que captura **términos/números exactos**, que razona **multi-hop** sobre el grafo (trae la versión vigente cuando el semilla está modificado) y que cada plan mapea a su casilla del PME. Es la fase que neutraliza cada modo de falla del RAG ingenuo (ADR-001, tabla "modo de falla → capa").

### 1.3 Por qué esta fase es el foso (no UX)
El estándar de corrección es **legal**: una cita a una norma **derogada** es una falla grave, no un detalle. El valor defendible no es el LLM sino estos grafos curados + la lógica de recuperación con vigencias. Por eso la robustez se prioriza sobre la velocidad (latencia extra de rerank/verificación, mitigable con Haiku + caching).

### 1.4 Épica cubierta
Épica B completa (B1–B6) + ciclo de vida de `corpus_version` (ADR-004) + el harness de evals de recuperación (semilla de épica E: E1/E2 en lo que toca a recall y grounding determinista).

---

## 2. Alcance

### 2.1 Entra
- **CLI `apps/ingest`:** chunking estructural (ley→art→inciso→letra; OA→indicador), embeddings, índices, publicación de `corpus_version`.
- **Doble índice real:** embeddings **Voyage `voyage-law-2`** (`[VERIFICAR]` dim) en pgvector **+** BM25/`tsvector`.
- **Recuperación híbrida** real sobre el corpus completo (vector + BM25 + RRF) con pre-filtro de vigencia/version.
- **Expansión GraphRAG:** CTE recursiva sobre `norma_relacion` (`modifica`, `requiere`, `consolida_en_pme`, `deroga`).
- **Reranking real:** Cohere Rerank **o** pase de Haiku (decisión #2; default Haiku).
- **Parent-document retrieval:** se recupera por chunk, se devuelve la `norma`/`OA` padre completa.
- **`corpus_version` publicable:** ciclo `borrador → publicada → retirada`; re-indexación = **nueva versión** (no muta la publicada); rollback = re-publicar la anterior.
- **Relaciones del grafo** sembradas: los 6 planes mapean a su casilla PME; `deroga`/`modifica` con vigencias.
- **Prompt caching** verificado sobre el corpus real (mínimos respetados, hit-rate logueado).
- **Harness de evals de recuperación:** `recall@k`, `precision@k`, MRR sobre golden set etiquetado; **CI falla** bajo umbral.
- **Observabilidad de recuperación:** qué se recuperó por documento, auditable, alimenta `traza_ia.recuperado`.

### 2.2 NO entra (deferido)
| Deferido | A la fase |
|---|---|
| Generadores de Aula completos (clases, NEE/DUA, export) | Fase 2 |
| Chat normativo M3 + auditoría de reglamento | Fase 3 |
| PME Fase Anual | Fase 4 |
| Verificación LLM "¿la cita respalda?" en producción dentro de un módulo de usuario | Fase 3 (aquí se deja el puerto listo y se ejercita en evals) |
| OCR de reglamentos/diagnósticos (Document AI) | Fase 3/5 (#3) — en Fase 1 el corpus entra como **texto curado**, no escaneado |
| DPA, RLS, dashboard de costos | Fase 5 |
| Swap de Voyage por otro proveedor de embeddings | No planificado; el puerto lo permite (INV-6) |

---

## 3. Requisitos funcionales (RF-1.n)

- **RF-1.1 · CLI de ingesta.** `apps/ingest` ofrece comandos para ingestar un corpus a una `corpus_version` en estado `borrador`, indexarlo y publicarlo. Idempotente por `(corpus_version, referencia)`. *(Blueprint §4; épica B1)*
- **RF-1.2 · Chunking estructural normativo.** La ingesta parte cada norma por **unidad legal** (ley→artículo→inciso→letra) — **nada de ventanas fijas**. Cada chunk pertenece a una `norma` padre con `referencia` canónica (p. ej. "Decreto 67/2018 art. 18 lit. f") y hereda vigencia. *(ADR-001 §A1; épica B1)*
- **RF-1.3 · Chunking estructural curricular.** Cada OA se chunked por OA → indicadores; `codigo` citable (p. ej. "MA06 OA 02"), asignatura/nivel, vigencia. *(Épica G1; blueprint §5.3)*
- **RF-1.4 · Embeddings reales (Voyage).** `VoyageEmbeddingsAdapter` produce embeddings con `voyage-law-2`; la **dimensión la fija `corpus_version.embedding_dim`** (no hardcode). Modo `query` vs `document`. Sin key → degradación clara (RF-0.20). *(ADR-001 §A5; blueprint §6, §7; #1)*
- **RF-1.5 · Doble índice consultable.** Cada chunk tiene `embedding` (ivfflat) **y** `tsv` (GIN). Ambos índices son consultables y se usan en la híbrida. *(Épica B2; ADR-001 §A3)*
- **RF-1.6 · Recuperación híbrida + RRF.** Vector y BM25 corren en paralelo; se fusionan con **Reciprocal Rank Fusion**; **pre-filtro** de metadatos (solo vigentes; por dependencia/tipo/version) **antes** de recuperar. *(ADR-001 §B0–B1; épica B3)*
- **RF-1.7 · Expansión GraphRAG.** Desde las semillas, una **CTE recursiva** sobre `norma_relacion` trae (a) la versión **vigente** si el semilla fue modificado/derogado, (b) dependencias (`requiere`, `consolida_en_pme`). Multi-hop con límite de profundidad. *(ADR-001 §B2; épica B4)*
- **RF-1.8 · Reranking.** `RerankerAdapter` reordena los candidatos por relevancia real y devuelve top-k preciso (default Haiku; alternativa Cohere). *(ADR-001 §B3; épica B5; #2)*
- **RF-1.9 · Parent-document.** La recuperación devuelve la `norma`/`OA` **padre completa** (texto canónico citable), no el chunk. *(ADR-001 §B4; blueprint §3.6)*
- **RF-1.10 · `corpus_version` publicable (ADR-004).** Estados `borrador → publicada → retirada`. Solo **una** `publicada` por *familia* (normativa / OA) a la vez para la recuperación. Publicar congela la versión (inmutable). Re-indexar crea una **nueva** versión; rollback re-publica la anterior. *(ADR-004; blueprint §3.5, §10.4)*
- **RF-1.11 · Filtro por versión publicada.** La recuperación online filtra por la `corpus_version` **publicada** vigente; la generación congela en `traza_ia` cuál usó. *(ADR-004; INV-4)*
- **RF-1.12 · Relaciones del grafo sembradas.** `norma_relacion` contiene los enlaces curados: cada uno de los 6 planes `consolida_en_pme`; `deroga`/`modifica` con sus vigencias; `requiere` donde aplique. *(Épica B4; glosario PME)*
- **RF-1.13 · Caching verificado sobre corpus real.** El bloque de corpus en `system` respeta los mínimos (4096 Opus/Haiku; 2048 Sonnet); `cache_read_input_tokens > 0` en 2ª llamada idéntica; hit-rate logueado. *(Épica B6; blueprint §7.3)*
- **RF-1.14 · Harness de evals de recuperación.** `evals/` corre `recall@k`, `precision@k`, MRR sobre golden set etiquetado; umbrales en `thresholds.json`; **CI falla** si `recall@k` cae bajo umbral. *(ADR-001 §E; épica E1; blueprint §7.4)*
- **RF-1.15 · Fidelidad de citas determinista.** Sobre el golden set, el harness mide % de citas que **existen + están vigentes** (parte determinista de la fidelidad; el "respalda" via juez Haiku es advisory). *(Blueprint §7.4; ADR-001 §E)*
- **RF-1.16 · Observabilidad de recuperación.** Cada recuperación registra IDs recuperados + scores (vector/BM25/RRF/rerank) → `traza_ia.recuperado`, auditable. *(ADR-001 §F; blueprint §5.6)*
- **RF-1.17 · Regla "cuándo NO recuperar".** Para el núcleo acotado que cabe en contexto, el use case puede correr *full-context cacheado* como camino primario y la recuperación como verificación cruzada (belt-and-suspenders); la recuperación se vuelve **obligatoria** cuando el corpus deja de caber (chat sobre toda la normativa). Se decide en el use case, no en el puerto. *(ADR-001 §F; blueprint §6)*

---

## 4. Diseño técnico + contratos

### 4.1 CLI de ingesta (`apps/ingest`)
```
faro ingest <ruta-corpus> --familia <normativa|oa> --etiqueta <str>
    → crea corpus_version(estado=borrador); chunking estructural; persiste norma/chunk_* | oa/chunk_oa
faro index <corpus_version_id>
    → calcula embeddings (Voyage) por chunk; refresca índices ivfflat/GIN
faro relate <ruta-relaciones>
    → carga norma_relacion (consolida_en_pme, deroga, modifica, requiere)
faro publish <corpus_version_id>
    → valida (todos los chunks indexados; dim coincide) y pasa a 'publicada' (inmutable); retira la previa
faro rollback --familia <normativa|oa>
    → re-publica la versión anterior (ADR-004)
```
> La ingesta **no inventa** contenido: parte de material curado por el experto de dominio (#6). El chunking es determinista y testeable sin red (INV-1).

### 4.2 Chunking estructural (RF-1.2/1.3) — contrato
```ts
// domain/ports/chunking.ts — la lógica es pura; el adapter solo lee archivos.
export interface ChunkEstructural {
  readonly referencia: string;      // canónica: 'Decreto 67/2018 art. 18 lit. f'
  readonly texto: string;
  readonly jerarquia: readonly string[]; // ['Decreto 67/2018','art. 18','lit. f']
  readonly vigenciaDesde?: string; readonly vigenciaHasta?: string;
}
export interface ChunkerNormativo { partir(documento: DocumentoFuente): readonly ChunkEstructural[]; }
export interface ChunkerCurricular { partir(documento: DocumentoFuente): readonly { codigo: string; texto: string; indicadores: string[] }[]; }
```
**Reglas (deterministas, testeables):** un chunk por unidad legal mínima citable; la `referencia` es única y reconstruible desde la jerarquía; nunca se parte a media oración por límite de tokens.

### 4.3 Recuperación híbrida + RRF (RF-1.6) — `infra-db/retrieval`
```sql
-- Vector (top N) — pgvector cosine, filtrado por versión publicada + vigencia.
SELECT c.norma_id, 1 - (c.embedding <=> $queryEmbedding) AS sim
FROM chunk_norma c JOIN norma n ON n.id = c.norma_id
WHERE c.corpus_version_id = $publicada
  AND n.estado_vigencia = 'vigente'
  AND (n.vigencia_hasta IS NULL OR n.vigencia_hasta > $hoy)
ORDER BY c.embedding <=> $queryEmbedding LIMIT $n;

-- Léxico (top N) — BM25 vía ts_rank_cd, mismos filtros.
SELECT c.norma_id, ts_rank_cd(c.tsv, plainto_tsquery('spanish', $query)) AS rank
FROM chunk_norma c JOIN norma n ON n.id = c.norma_id
WHERE c.corpus_version_id = $publicada AND c.tsv @@ plainto_tsquery('spanish', $query)
  AND n.estado_vigencia = 'vigente' AND (n.vigencia_hasta IS NULL OR n.vigencia_hasta > $hoy)
ORDER BY rank DESC LIMIT $n;
```
```ts
// RRF: fusión por rango (k=60 típico). Pura, testeable (INV-1).
// score(d) = Σ_listas 1 / (k + rank_lista(d))
export function rrf(listas: readonly (readonly string[])[], k = 60): { id: string; score: number }[] { /* ... */ }
```

### 4.4 Expansión por grafo (RF-1.7) — CTE recursiva
```sql
-- Desde semillas, multi-hop por relaciones, trayendo versión vigente + dependencias.
WITH RECURSIVE expansion AS (
  SELECT id, 0 AS hop FROM norma WHERE id = ANY($semillas)
  UNION
  SELECT r.destino_id, e.hop + 1
  FROM expansion e JOIN norma_relacion r ON r.origen_id = e.id
  WHERE r.tipo = ANY($tipos)            -- ['modifica','requiere','consolida_en_pme','deroga']
    AND e.hop < $maxHop
)
SELECT n.* FROM norma n JOIN expansion x ON x.id = n.id
WHERE n.estado_vigencia = 'vigente';    -- "trae la versión vigente cuando el semilla está modificado"
```
```ts
// domain/ports/graph.ts (firma — adapter en infra-db).
export interface GraphPort {
  expandir(semillas: readonly Norma[], tipos: readonly RelacionTipo[], maxHop?: number): Promise<Norma[]>;
}
```

### 4.5 Pipeline completo (RF-1.6→1.9) — `application/shared/pipelineRag.ts`
```ts
export async function recuperarContexto(query: string, f: FiltrosRecuperacion, p: PipelinePorts): Promise<Recuperado<Norma>[]> {
  const semillas  = await p.retrieval.hibrida(query, f, 30);                              // Paso 0+1: prefiltro + híbrida + RRF
  const expandido = await p.graph.expandir(semillas.map(s => s.item), ['modifica','requiere','consolida_en_pme','deroga']); // Paso 2
  const candidatos = mergeUnicos(semillas, expandido);
  const top = await p.reranker.ordenar(query, candidatos, 8);                             // Paso 3: rerank
  return top;                                                                             // Paso 4: parent-document ya completo
}
```

### 4.6 `corpus_version` — máquina de estados (RF-1.10) — ADR-004
```
borrador ──publish──▶ publicada ──(nueva versión publicada)──▶ retirada
   ▲                                                              │
   └──────────────── rollback (re-publicar anterior) ◀───────────┘
```
- **Invariantes:** una `publicada` por familia (normativa/OA) para la recuperación; `publicada` es **inmutable** (no se editan sus chunks); re-indexar = nueva `corpus_version`.
- **Migración de datos versionada** (`drizzle-kit` + script de ingesta): re-indexación no muta la publicada (blueprint §10.4).
- **Repos:** `CorpusVersionRepository.publicar(id)`, `.retirar(id)`, `.publicadaPorFamilia(familia)`.

### 4.7 Reranker (RF-1.8) — puerto + dos adapters
```ts
// infra-ai/rerank — default HaikuReranker (sin dependencia nueva); alternativa CohereRerankAdapter.
// Ambos implementan RerankerPort.ordenar (ver 00-cimientos §4.4). Decisión #2: arranca Haiku.
```

### 4.8 Harness de evals (RF-1.14/1.15) — `evals/`
```
evals/
├── datasets/
│   ├── recuperacion.golden.json   # [{ query, idsCorrectos[], notas }]  — etiquetado por experto
│   ├── fidelidad.golden.json      # afirmaciones ↔ cita esperada (existe+vigente)
│   └── decreto67.golden.json      # (semilla; cobertura plena en Fase 3)
├── runners/
│   ├── recall.ts                  # recall@k, precision@k, MRR (determinista: compara IDs)
│   └── fidelidad.ts               # existe+vigente determinista; "respalda" via juez Haiku (reproducible)
└── thresholds.json                # { "recall@k": 0.90, "precision@k": ..., "fidelidad_existe_vigente": 0.95 }
```
| Eval | Mide | Meta | Determinista? |
|---|---|---|---|
| `recall@k`/`precision@k`/MRR | ¿se recuperó el artículo/OA correcto? | `recall@k ≥ 0.90` | Sí (compara IDs) |
| Fidelidad (existe+vigente) | % afirmaciones con cita correcta y vigente | ≥ 0.95 | Sí (la parte "respalda" via juez) |
| Grounding (gate duro) | docs con cita inexistente/derogada | **0** | Sí |

> Los evals con juez LLM corren con **Haiku** (costo bajo) y son reproducibles (se fija `corpus_version`). **CI falla** si `recall@k` o fidelidad caen bajo umbral (RF-1.14).

### 4.9 Observabilidad de recuperación (RF-1.16)
Cada recuperación emite, a `traza_ia.recuperado`: `[{ id, via, scoreVector?, scoreBm25?, scoreRRF, scoreRerank }]` + el `corpus_version_id` publicado usado. Métrica de negocio derivada: hit-rate de cache, distribución de routing, costo unitario por documento (blueprint §7.5).

---

## 5. Historias → tareas (commits)

- **H-1.1 · `feat(ingest): CLI + chunking estructural normativo`** — `apps/ingest` (ingest/index/relate/publish/rollback) + `ChunkerNormativo` determinista. → *CA-1.1, CA-1.2*
- **H-1.2 · `feat(ingest): chunking estructural curricular (OA→indicador)`** — `ChunkerCurricular`. → *CA-1.3*
- **H-1.3 · `feat(infra-ai): VoyageEmbeddingsAdapter real`** — `voyage-law-2`; dim por `corpus_version`; degradación sin key. → *CA-1.4*
- **H-1.4 · `feat(retrieval): doble índice + híbrida + RRF (corpus real)`** — vector `<=>` + `ts_rank_cd` + RRF + pre-filtro vigencia/version. → *CA-1.5, CA-1.6*
- **H-1.5 · `feat(graph): expansión GraphRAG (CTE recursiva)`** — `GraphExpander`; `norma_relacion` sembrada (6 planes→PME, deroga/modifica). → *CA-1.7, CA-1.8*
- **H-1.6 · `feat(rerank): reranker real (Haiku; opción Cohere) + parent-document`** — top-k preciso; devuelve padre completo. → *CA-1.9*
- **H-1.7 · `feat(corpus): ciclo de vida corpus_version (publish/rollback)`** — máquina de estados §4.6; re-indexación versionada. → *CA-1.10*
- **H-1.8 · `feat(ai): caching verificado sobre corpus real`** — mínimos respetados; hit-rate logueado. → *CA-1.11*
- **H-1.9 · `feat(evals): harness recall@k/precision@k/MRR + fidelidad + CI gate`** — runners + `thresholds.json`; CI falla bajo umbral. → *CA-1.12, CA-1.13*
- **H-1.10 · `feat(obs): observabilidad de recuperación → traza_ia.recuperado`** — IDs + scores auditables. → *CA-1.14*
- **H-1.11 · `docs: ingesta del corpus + cómo publicar/rollback una corpus_version`** — runbook. → *CA-1.15*

> **Precondición de H-1.1/H-1.2/H-1.9:** material de corpus real + golden set etiquetado por el experto de dominio (#6 + §9).

---

## 6. Criterios de aceptación (CA-1.n)

- **CA-1.1** `faro ingest` crea una `corpus_version(borrador)` y persiste `norma`/`chunk_norma` con `referencia` canónica y vigencia; re-ejecutar no duplica (idempotente por `(version, referencia)`).
- **CA-1.2** El chunking parte por unidad legal (ley→art→inciso→letra), nunca por ventana fija; cada chunk reconstruye su `referencia` desde la jerarquía (test unit sin red).
- **CA-1.3** Cada OA queda chunked con `codigo` citable, asignatura/nivel e indicadores; consultable por asignatura/curso/nivel.
- **CA-1.4** `VoyageEmbeddingsAdapter` produce vectores de la dim declarada en `corpus_version`; sin key degrada con error claro (no rompe el build).
- **CA-1.5** Ambos índices (ivfflat + GIN) son consultables; existe test de integración que recupera por vector y por léxico.
- **CA-1.6** Una query devuelve **solo vigentes** y **captura términos/números exactos** (p. ej. "art. 18 letra f", "85%"); RRF fusiona vector+BM25 (test con caso donde el vector solo no recupera el término exacto).
- **CA-1.7** La expansión por grafo **trae la versión vigente** cuando el semilla está `modificado`/`derogado` (test con par norma vieja→nueva por `modifica`).
- **CA-1.8** Cada uno de los **6 planes** mapea a su casilla PME vía `consolida_en_pme` (verificable por consulta al grafo).
- **CA-1.9** El reranking reordena el top-k y se devuelve la **norma/OA padre completa**, no el chunk.
- **CA-1.10** Re-indexar crea una **nueva** `corpus_version` sin mutar la `publicada`; `publish` la activa y retira la previa; `rollback` re-publica la anterior.
- **CA-1.11** `cache_read_input_tokens > 0` en una 2ª llamada idéntica sobre el corpus real; el hit-rate se loguea.
- **CA-1.12** El harness corre en CI y reporta `recall@k`, `precision@k`, MRR sobre el golden set.
- **CA-1.13** **CI falla** si `recall@k < 0.90` o la fidelidad (existe+vigente) `< 0.95`.
- **CA-1.14** Cada recuperación deja en `traza_ia.recuperado` los IDs + scores y el `corpus_version_id` publicado usado.
- **CA-1.15** El runbook permite a un tercero ingestar, indexar, publicar y hacer rollback de una `corpus_version`.

### DoD de cierre de fase (blueprint §11)
Query devuelve **solo vigentes** y captura términos exactos · trae la **versión vigente** cuando el semilla está modificado · cada plan mapea a su casilla PME · `recall@k ≥ 0.90` (+ precision@k, MRR) con **CI que falla bajo umbral**.

---

## 7. Plan de pruebas + evals

| Nivel | Qué | Dónde | Sin red? |
|---|---|---|---|
| **Unit (dominio)** | RRF (casos de fusión); chunking estructural (referencia reconstruible); lógica de la CTE/expansión (sobre fixtures); máquina de estados de `corpus_version` | `domain`, `infra-db/retrieval` | **Sí** (INV-1) |
| **Integration** | ingest → index → retrieve **roundtrip** vs Postgres+pgvector real (docker); híbrida (vector+BM25+RRF); expansión por grafo; publish/rollback | `infra-db`, `apps/ingest` | DB local; Voyage real o grabado/fake sin key |
| **Eval** | `recall@k`/`precision@k`/MRR (determinista); fidelidad existe+vigente (determinista) + "respalda" (juez Haiku) | `evals` | Corpus fijo (`corpus_version`); juez Haiku |
| **E2E** | recuperación end-to-end alimentando el slice de Aula de Fase 0 con corpus real (sustituye `FakeEmbeddings` por Voyage) | `apps/*` | Stack completo |

- Fakes siguen disponibles (`FakeEmbeddings`, `FakeReranker`) para correr sin keys; el ranking semántico **real** llega aquí.
- **Construcción del golden set:** lo etiqueta el **experto de dominio** (no se auto-genera); cada caso `{ query, idsCorrectos[] }` se versiona en `evals/datasets`. `[VERIFICAR]` tamaño mínimo (el plan sugiere ≥30 casos de fidelidad; B-evals piden golden set de recall).

---

## 8. DoD + invariantes

**DoD:** §6 (CA-1.* + DoD de cierre) + DoD global del [`README.md`](./README.md) §4.

**Invariantes materializados en esta fase:**
- **INV-1** — RRF, chunking, lógica de expansión y máquina de estados de `corpus_version` viven en `domain`/lógica pura y se testean sin red.
- **INV-2** — el pre-filtro de vigencia y el gate de citas (existe+vigente) son deterministas y bloqueantes; el "respalda" del juez es advisory.
- **INV-4** — `corpus_version` publicable + inmutable es el corazón de esta fase; cada recuperación/generación congela cuál usó.
- **INV-5/INV-6** — Voyage y reranker entran tras sus puertos; cambiarlos no toca `application`/`domain`.

**Defensibilidad (ADR-001 §E):** los gates deterministas son *tests* auditables línea por línea; las evals en CI permiten **afirmar** robustez (no prometerla). Esto es lo que un comité técnico/fiscalizador puede revisar.

---

## 9. Riesgos y preguntas abiertas

**Bloqueantes para arrancar:**
- **#1 Voyage:** confirmar `voyage-law-2` + **dimensión exacta** + API key. Fija `corpus_version.embedding_dim` y el `vector(N)` de los índices. Sin key, se puede avanzar chunking/grafo/RRF con `FakeEmbeddings`, pero el ranking semántico real y los evals plenos requieren Voyage. `[VERIFICAR]`.
- **#6 Corpus real:** material curado (6 planes + Decreto 67/83 subset + corpus OA) por el experto de dominio. **No se inventa** normativa ni OA.
- **Golden set:** etiquetado por experto; sin él no hay evals reales (RF-1.14).

**Riesgos (blueprint §12) y mitigación:**
| Riesgo | Mitigación |
|---|---|
| Corpus normativo/curricular incompleto o erróneo | Empezar acotado y curado; `corpus_version` permite corregir y re-publicar; evals de fidelidad |
| Deriva regulatoria (cambia una norma) | Grafo con vigencias + re-indexar una vez y propagar; gate de vigencia bloqueante |
| `voyage-law-2` no disponible / dim distinta | Puerto `EmbeddingsPort` con dim por `corpus_version`; adapter reemplazable; `FakeEmbeddings` para no bloquear |
| Cache no impacta (`cache_read=0`) | Prefijo estable primero; warning si hit=0 (RF-1.13); respetar mínimos |
| Sobre-uso de Opus en recuperación | Reranker/juez con Haiku; routing por defecto a Sonnet; dashboard de distribución (Fase 5) |
| "Wrapper de ChatGPT" en el pitch | El foso es código auditable: gates deterministas + grafo + corpus versionado + evals en CI |

**Preguntas abiertas no bloqueantes (se arrastran al índice §6):**
- #2 reranker (Cohere vs Haiku — arranca Haiku) · #3 OCR (relevante cuando entren reglamentos escaneados, Fase 3/5) · #7 `effort` por costo (Fase 3/4).

---

> **Antes de cerrar la fase:** demostrar `recall@k ≥ 0.90` en CI sobre el golden set real, la expansión por grafo trayendo la versión vigente, y una `corpus_version` publicada + un rollback. Reemplazar `FakeEmbeddings` por Voyage en el slice de Aula y confirmar que sigue verde.
