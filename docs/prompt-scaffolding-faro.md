# Prompt para sesión nueva — Faro · Fase 0 (cimientos de producción + primer vertical slice real)

> Copia el bloque de abajo y pégalo en una sesión nueva de Claude Code, abierta en `D:\Repositorios\ideas`.
> NO es "scaffolding con stubs": es la **Fase 0 de producción** del blueprint del arquitecto (`docs/arquitectura-faro.md` §11) — monorepo de dominio, ports & adapters, generación asíncrona y un slice vertical real end-to-end.
> Decisiones bloqueantes YA resueltas (ver "Decisiones confirmadas" en el prompt). Lo único que debes hacer al iniciar la sesión: **entregarle el material del corpus** (OA reales + un reglamento de evaluación real) cuando te lo pida.

---

```
# Tarea: Faro — Fase 0 (cimientos de producción + primer vertical slice real)

## Contexto (leer ANTES de escribir código)
Estás en D:\Repositorios\ideas (Windows / PowerShell). En `/docs` está el diseño, que es la FUENTE DE VERDAD. Lee en este orden:
1. docs/arquitectura-faro.md — BLUEPRINT AUTORITATIVO (ports & adapters, monorepo, worker async, corpus versionado). Manda sobre los demás ante diferencias.
2. docs/adr-001-recuperacion-rag.md — RAG híbrido sobre grafo con verificación de citas.
3. docs/solucion-educacion.md y docs/plan-implementacion-faro.md — producto, modelo de datos, schemas, épicas.

Faro es un copiloto de cumplimiento y producción pedagógica para colegios chilenos, con corrección de nivel legal. En ESTA sesión construimos EXACTAMENTE la **Fase 0** del blueprint (§11): los cimientos de producción + el generador de pruebas de Aula end-to-end sobre un corpus mínimo REAL. Calidad de producción, NO stubs (las únicas dobles permitidas son test doubles legítimos: `FakeEmbeddings`/`FakeReranker` si faltan API keys).

Sigue mi CLAUDE.md global: Conventional Commits; TypeScript sin `any`; sin `console.log` (logger); comenta el *por qué* de lo no obvio; claridad sobre cleverness; no inventes requisitos — si algo es ambiguo, pregúntame.

## Arquitectura (del blueprint — respétala)
- **Ports & Adapters (hexagonal).** Regla de dependencia: los `import` apuntan siempre al dominio. `infra` y `apps` dependen de `application` y `domain`; nunca al revés. Enforza con ESLint boundaries + fronteras físicas de paquetes.
- **Monorepo pnpm** con paquetes: `packages/domain` (TS puro, sin frameworks, sin I/O), `packages/application` (use cases), `packages/infra-*` (adapters: Drizzle, Anthropic, Voyage, reranker, export), `apps/web` (Next.js), `apps/worker` (cola de generación), `apps/ingest` (CLI).
- **Generación asíncrona:** el slice NO genera dentro del request HTTP; encola y el worker procesa (la generación es de 10–60 s). HTTP devuelve 202 + id; hay `GET` de estado.

## Stack (no cambiar)
pnpm; Next.js App Router + React + TS `strict`; PostgreSQL + pgvector + tsvector/BM25; Drizzle (migraciones); SDK Anthropic; Zod + `zodOutputFormat`; Vitest; ESLint/Prettier; CI GitHub Actions; docker-compose para Postgres+pgvector.

## Reglas de IA / modelos (CRÍTICO)
- Consulta la skill `/claude-api` para el uso del SDK — NO inventes nombres de métodos.
- IDs exactos: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5` (sin sufijos de fecha).
- Routing en un solo módulo: Haiku=extracción/clasificación; Sonnet=redacción (default); Opus=razonamiento normativo. `effort:max` es solo Opus (Sonnet/Haiku dan 400).
- `thinking:{type:"adaptive"}`; salidas estructuradas con `messages.parse()` + `zodOutputFormat`; `parsed_output` puede ser null → manejar (no persistir basura).
- Prompt caching del corpus: `cache_control:{type:"ephemeral"}` sobre el bloque de corpus en `system`; loguea `cache_read_input_tokens`. Mínimos: 4096 tokens (Opus/Haiku), 2048 (Sonnet).
- NUNCA hardcodees API keys; léelas de env; sin keys, degrada con error claro.

## Alcance de Fase 0 (entregables verificables)
1. Monorepo + tooling: tsconfig strict, ESLint (con lint de boundaries), Prettier, Vitest, CI (lint+typecheck+test+build), scripts pnpm (dev/build/lint/typecheck/test/db:migrate/db:seed).
2. DB: docker-compose Postgres+pgvector; schema Drizzle del blueprint §5 (`norma`, `norma_relacion`, `establecimiento`, `objetivo_aprendizaje`, `documento_generado`, `traza_ia`, **`corpus_version`**); índices ivfflat (pgvector) y GIN (tsvector); migración + **seed con corpus mínimo REAL** (2–3 OA reales de una asignatura/curso + Decreto 67 art. 18 real).
3. `packages/domain`: entidades + puertos (RetrievalPort, EmbeddingsPort, RerankerPort, GraphPort, VerificationGate) con firmas TS; los 4 schemas Zod (PmeAccion, ReglamentoAuditoria, Prueba, Clase); reglas deterministas (item→OA, una-sola-correcta, vigencia, validez de cita).
4. `infra`: `AnthropicLlmAdapter` (routing+caching+parse+usage log); `Drizzle*Repository`; `VoyageEmbeddingsAdapter` (+ `FakeEmbeddings`); `RerankerAdapter` (Haiku por defecto, salvo que se indique Cohere) (+ `FakeReranker`).
5. `HybridRetriever` REAL (vector + BM25 + fusión RRF) sobre el seed — no stub.
6. Gates REALES y deterministas: `pedagogicalGate` (cada ítem SM con exactamente una correcta; cada ítem referencia un OA existente) y `citationGate` (existe + vigente); deja como TODO claramente marcado la verificación LLM "¿respalda la afirmación?".
7. **Vertical slice end-to-end:** `POST /api/aula/prueba` {asignatura, curso, oaIds} → encola → `apps/worker` recupera OA (HybridRetriever) → genera `Prueba` (structured output) → pasa `pedagogicalGate` → persiste `documento_generado(estado=borrador)` + `traza_ia(corpus_version)` → `GET /api/aula/prueba/:id` devuelve estado/resultado.
8. Tests: unit de RRF y de `pedagogicalGate`; 1 caso recall@k sobre el seed; 1 e2e del slice.
9. README (docker-compose up → migrate → seed → dev → probar el slice) + .env.example.

## Cumplimiento by-design (invariantes, no convenciones)
- Todo documento nace `borrador` (forzado por tipo si es posible) y deja `traza_ia` con `corpus_version`. No existe camino de código que cree `aprobado` sin revisor humano (Art. 8 bis).
- Comentario donde corresponda: datos a nivel curso/contenido, NO individualizado por alumno (bajo riesgo Ley 21.719 en MVP).

## Decisiones confirmadas por el dueño (Fase 0)
- **API keys:** Anthropic SÍ (generación real con Claude). Voyage NO aún → implementa `VoyageEmbeddingsAdapter` tras el puerto, pero corre con `FakeEmbeddings` (determinista) hasta tener la key; el ranking semántico real llega en Fase 1.
- **Reranker:** adapter basado en Haiku (sin dependencia nueva).
- **Corpus mínimo real:** el dueño TE ENTREGA el material (OA reales de una asignatura/curso + un reglamento de evaluación real). Pídeselo al inicio y **espera a tenerlo**; NO inventes OA ni contenido pedagógico. Mientras no llegue, avanza con todo lo que NO depende del corpus (monorepo, DB/migraciones, puertos, adapters, gates, tests) y deja el seed + el e2e del slice como último paso.
- **Ajustes de arquitectura adoptados (ya hay ADR en /docs — síguelos):** ADR-002 (monorepo de dominio, hexagonal), ADR-003 (generación asíncrona worker/cola), ADR-004 (`corpus_version` de primera clase).
- **Deploy:** Node server local + worker; NO decidas Vercel ahora.

## DoD de Fase 0
`pnpm build/lint/typecheck/test` verdes en CI; la prueba se genera de punta a punta con el seed; cada generación deja `traza_ia` y nace `borrador`; `cache_read_input_tokens` > 0 en una 2ª llamada idéntica.

## Pasos (un commit convencional por unidad)
1. chore: init monorepo (git, pnpm workspaces, tsconfig strict, eslint boundaries, prettier, vitest, CI)
2. feat(db): docker-compose pgvector + schema Drizzle + corpus_version + migración + seed real mínimo
3. feat(domain): entidades + puertos + schemas Zod + reglas deterministas
4. feat(infra-ai): AnthropicLlmAdapter (routing/caching/parse/usage)
5. feat(infra): repos Drizzle + embeddings/reranker adapters (+ fakes)
6. feat(retrieval): HybridRetriever (vector+BM25+RRF) real sobre el seed
7. feat(verification): pedagogicalGate + citationGate deterministas (+TODO LLM)
8. feat(aula): slice POST /api/aula/prueba → worker → gates → persistencia → GET estado
9. test: RRF + pedagogicalGate + recall@k + e2e del slice
10. docs: README + .env.example

## Antes de terminar
- Confirma CI verde y el slice corriendo con el seed; entrégame resumen + cómo levantarlo + TODOs mapeados a las Fases 1–5 del blueprint.
- No hagas push a ningún remoto sin confirmármelo.

Empieza leyendo docs/arquitectura-faro.md. Si el corpus mínimo real o alguna pregunta abierta bloqueante no está resuelta, pregúntame antes de codear.
```
