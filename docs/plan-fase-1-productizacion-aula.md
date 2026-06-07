# Plan Fase 1 — Productización del Módulo Aula (persistencia + HIL + worker + línea de tiempo)

> **Tipo:** plan de fase, en estilo *spec-driven* (plantilla de 9 secciones de `specs/README.md`). **Aprobado por el dueño (2026-06-06):** re-secuenciación (§1.2) y defaults P1–P5 confirmados. Puede promoverse a `specs/NN-*.md`.
> **Sesión:** 2026-06-06. **Estado del repo:** demo de la cascada **cerrada** (ver memoria `demo-cascada-estado-y-extensibilidad`); rama `feat/fase-0-cimientos`.
> **Fuente de verdad:** ante conflicto, mandan `docs/arquitectura-faro.md` + ADRs. Este plan **re-secuencia** el blueprint (ver §1.2) — es una decisión del dueño, señalada explícitamente, no una resolución inventada.

---

## 1. Contexto y objetivo

### 1.1 Qué entrega esta fase
Convertir la **cascada de Aula** (hoy demo síncrona, en memoria, con samples) en un **sistema persistente, asíncrono y con human-in-the-loop real**, y añadir el nivel que faltaba sobre la cascada: la **Planificación Anual / línea de tiempo** definida por el docente (Unidad → OA, con fechas/semanas). Desde cada unidad de esa línea de tiempo se dispara la cascada existente (Unidad → Clase → {Prueba, `.pptx`}), generando **documentos `borrador` citados, gateados y con `traza_ia`**, que un humano revisa y aprueba.

Objetivo de negocio: que el docente parta de su **secuencia anual** (su forma real de trabajar) y obtenga el papeleo regulado como borradores revisables — sin perder reproducibilidad legal (`corpus_version` + `traza_ia`).

### 1.2 Re-secuenciación del blueprint (decisión del dueño — confirmar)
El mapa SDD (`specs/README.md`) define `Fase 1 = 01-nucleo-rag.md` (el foso RAG: ingesta + pgvector + retrieval híbrido + grafo + evals). **El dueño decidió posponerlo**: para M0 Aula el RAG es *overkill*. El currículum es **estructurado**: dado `(asignatura, nivel)`, los OA son una **consulta determinista**, no una búsqueda semántica. El RAG es el foso de la **normativa** (M3/M1: 6 planes, decretos, reglamentos que hay que *buscar*), no del currículum.

Por tanto esta fase:
- **Productiviza** la cascada de la Fase 2 (`02-aula-cascada.md`): le da la persistencia, el worker y el HIL que esa spec asume como precondición.
- **Trae** la *Planificación Anual*, deferida en `02-aula-cascada.md §2.2`.
- **Pospone** el RAG (`01-nucleo-rag.md`) y todo `pgvector` hasta el inicio de **M3** (o hasta que el corpus deje de caber en el contexto — gatillo de `db-stack-diferido`).

> ✅ **Confirmado por el dueño (2026-06-06):** el RAG/pgvector y la Fase-1-del-blueprint se posponen hasta M3. Esta fase es el "primer slice productivo" del MVP; el foso RAG entra cuando arranque el módulo normativo.

### 1.3 Decisiones confirmadas (sesión 2026-06-06)
- **Columna vertebral:** productionizar Aula (persistencia + HIL + worker). Sin RAG/pgvector.
- **Persistencia:** Postgres + Drizzle **sin pgvector** (retoma H-0.2 en su versión *middle-ground* de `db-stack-diferido`). Corpus OA migra de JSON a tablas, bajo una `corpus_version` real e inmutable.
- **Línea de tiempo:** nueva pieza de dominio (Planificación Anual: secuencia de unidades → OA, con fechas/semanas). Es **input del docente**, no generada por el LLM.
- **Generación:** **vía suscripción de Claude Code, no API key de Anthropic** ("por el momento"). Adapter sobre el **Claude Agent SDK** autenticado con `CLAUDE_CODE_OAUTH_TOKEN`. La plomería (DB/worker/HIL) se construye y prueba con el doble `samples` (gratis, determinista); el adapter en vivo se enciende detrás del mismo `LlmPort`. Ver §4.5 y §9.
- **Alcance de módulo:** solo **M0 Aula**. Sin M3/M1.
- **Materia-agnóstico:** se mantiene la regla del demo — por-materia = solo datos (corpus + samples). El código no hardcodea Matemática.

### 1.4 Precondición y base existente
Ya construido en Fase 0 + demo (reutilizable):
- Puertos en `packages/domain/ports`: `LlmPort`, `ExportPort`, `ClockPort`, y **ya declarados** `OaRepository`, `DocumentoRepository`, `TrazaRepository`, `JobRepository` (esta fase los **implementa**).
- `CascadaAulaUseCase` (orquesta Unidad → {Clase, Prueba} → Deck) y los 4 use cases de generación — **no cambian su lógica**; cambia *quién los invoca* (el worker) y *qué se hace con el resultado* (persistir + traza).
- Gates deterministas (`planificacionGate`, `pedagogicalGate`, `citationGate`, `correrGatesCascada`).
- `PptxExportAdapter` (`infra-export`), `AnthropicLlmAdapter` + `FakeLlm` (`infra-ai`), `config` (valida `DATABASE_URL`), `observability`.
- `infra-db` declara `drizzle-orm` + `pg` (hoy skeleton) → se rellena aquí.

---

## 2. Alcance

### 2.1 Entra
- **Esquema Postgres real (Drizzle)** sin pgvector: `corpus_version`, `objetivo_aprendizaje`, `documento_generado` (+ `CHECK chk_aprobado_requiere_humano`), `traza_ia`, `job_generacion`, y las tablas nuevas de línea de tiempo (`planificacion_anual`, `unidad_planificada`). Migraciones.
- **Ingesta del corpus OA** desde el JSON versionado (`corpus/curriculum/*.json`) a `objetivo_aprendizaje`, bajo una `corpus_version` publicada (script en `apps/ingest` o comando del worker).
- **Implementación de los repos** existentes como adapters Drizzle (`OaRepository`, `DocumentoRepository`, `TrazaRepository`, `JobRepository`) + nuevo `PlanificacionAnualRepository` (puerto + adapter).
- **Planificación Anual (dominio):** schema Zod + gate determinista (cada OA existe y está vigente; cobertura; política de repetición de OA entre unidades). Use cases CRUD. Derivación de `ContextoCascada` desde una `UnidadPlanificada`.
- **Generación asíncrona:** `job_generacion` con `SELECT … FOR UPDATE SKIP LOCKED` (ADR-003); `apps/worker` ejecuta `CascadaAulaUseCase`, persiste cada artefacto como `documento_generado(borrador)` + `traza_ia` + resultado de gates; reintentos.
- **HIL + traza:** máquina de estados `borrador → en_revision → aprobado/rechazado` (transiciones puras en `domain`); `traza_ia` registrada en cada generación (modelo, `corpus_version_id`, `usage`, gates); superficie web de revisión (aprobar/rechazar registra `autor_humano`).
- **Adapter LLM en vivo vía suscripción** (Claude Agent SDK + `CLAUDE_CODE_OAUTH_TOKEN`, structured output validado con Zod), seleccionable desde la composition root: `samples | claude-code`.
- **Web:** encolar generación (POST → `documento_generado(borrador, encolado)` + `job(pendiente)`), consultar estado (polling), ver resultados persistidos, descargar `.pptx`, y revisar/aprobar.

### 2.2 NO entra (deferido)
| Deferido | A la fase / condición |
|---|---|
| **RAG / pgvector / ingesta normativa / grafo / reranker / evals recall@k** (`01-nucleo-rag.md`) | **M3** (o cuando el corpus no quepa en contexto) |
| **Autenticación / RBAC / multi-tenant / RLS** | Fase de hardening (blueprint Fase 5) |
| **DPA / transparencia / retención** | Fase 5 |
| **Object storage S3** para `.pptx` | Mientras tanto: bytes en disco/registro (decisión #5 del SDD sigue pendiente) |
| **Variante NEE/DUA** (Decreto 83) | Iteración posterior de M0 |
| **Subir-e-inferir plantilla del colegio (OCR)** | Posterior (necesita `OcrAdapter`) |
| **Motor de plantillas configurable completo** (`02-aula-cascada.md` RF-2.1..2.3) | Puede entrar parcial; el mínimo de esta fase es persistir el `extras` ya existente. A confirmar (§9). |

---

## 3. Requisitos funcionales (RF-PA.n)

> Prefijo `PA` (Productización Aula) para no colisionar con los `RF-1.x` de `01-nucleo-rag.md`. Cada RF es *testable*.

**Persistencia y corpus**
- **RF-PA.1 · Esquema y migraciones.** Existe el esquema Drizzle de §4.1 con migración aplicable a una Postgres limpia; `documento_generado` nace `borrador` por defecto y el `CHECK chk_aprobado_requiere_humano` impide `aprobado` sin `autor_humano`. *(INV-3; blueprint §5)*
- **RF-PA.2 · Corpus OA en DB bajo versión.** El corpus `corpus/curriculum/<materia>-<nivel>.json` se ingiere a `objetivo_aprendizaje` ligado a una `corpus_version` publicada e inmutable. Reingerir el mismo JSON es idempotente por `(corpus_version, codigo)`. *(INV-4; ADR-004)*
- **RF-PA.3 · Repos Drizzle.** `OaRepository`, `DocumentoRepository`, `TrazaRepository`, `JobRepository`, `PlanificacionAnualRepository` quedan implementados tras sus puertos; el dominio/aplicación no importa `infra-db`. *(INV-5; ADR-002)*

**Planificación Anual / línea de tiempo**
- **RF-PA.4 · Modelo de secuencia anual.** Existe `PlanificacionAnual` { establecimiento, asignatura, nivel, año, unidades: `UnidadPlanificada[]` }, con `UnidadPlanificada` { orden, titulo, oaCodigos[], inicio?/fin? o semanas? }. Schema Zod puro en `domain`. *(decisión dueño)*
- **RF-PA.5 · Gate de la secuencia.** `secuenciaAnualGate` (determinista, sin red): cada `oaCodigo` **existe y está vigente** en la `corpus_version`; reporta **cobertura** (OA del curso no asignados a ninguna unidad) y **repetición** de OA entre unidades según política configurable (`marca` por defecto). *(INV-1, INV-2)*
- **RF-PA.6 · CRUD de la secuencia.** Use cases para crear/editar/listar una `PlanificacionAnual`; el docente la edita en la web (sin auth en esta fase). *(decisión dueño)*
- **RF-PA.7 · Disparo desde la línea de tiempo.** Generar la cascada parte de una `UnidadPlanificada` concreta: `ContextoCascada` se **deriva** de ella + el corpus (sus OA, su título), no de parámetros ad-hoc. *(integra la cascada existente)*

**Generación asíncrona + HIL**
- **RF-PA.8 · Cola y worker.** Un POST encola `documento_generado(borrador, encolado)` + `job(pendiente)` y responde sin bloquear; `apps/worker` toma jobs con `FOR UPDATE SKIP LOCKED`, ejecuta la cascada y persiste resultados; estado consultable; reintentos con tope. *(ADR-003; blueprint §3.3)*
- **RF-PA.9 · Persistencia de artefactos + gates.** Cada artefacto de la cascada se guarda como `documento_generado(borrador)` con su `payload`, su `resultado_gates`, su `origen_id` (trazabilidad de la cascada) y su `corpus_version_id`. *(blueprint §5; INV-3)*
- **RF-PA.10 · `traza_ia` por generación.** Cada generación escribe `traza_ia` con `documento_id`, `corpus_version_id`, `modelo`, `ruta_decision`, `usage`, `gates`. *(INV-4; Art. 8 bis)*
- **RF-PA.11 · Máquina de estados HIL.** Transiciones `borrador → en_revision → aprobado|rechazado` como funciones **puras** en `domain`; `aprobado` exige `autor_humano`; no hay camino que apruebe sin humano (refuerza el `CHECK`). *(INV-2, INV-3)*
- **RF-PA.12 · Superficie de revisión.** La web lista documentos `borrador`/`en_revision`, muestra su contenido + panel de gates, y permite aprobar/rechazar (registra `autor_humano`). *(HIL)*

**LLM vía suscripción**
- **RF-PA.13 · Adapter de suscripción.** Existe un `LlmPort` implementado sobre el **Claude Agent SDK** autenticado con `CLAUDE_CODE_OAUTH_TOKEN`, con structured output validado por el mismo schema Zod que usa la cascada. Si no hay token, la composition root cae a `samples`. *(INV-6; §4.5)*
- **RF-PA.14 · Selección de proveedor.** La composition root elige `samples | claude-code` por entorno; la cascada y el worker **no cambian** al cambiar de proveedor (dependen de `LlmPort`). *(INV-5, INV-6)*

---

## 4. Diseño técnico + contratos

### 4.1 Esquema (Drizzle / Postgres) — boceto
Sin `pgvector`, sin `chunk_*`, sin grafo normativo (todo eso es M3).

```
corpus_version(
  id uuid pk, etiqueta text, estado text check in ('borrador','publicada','retirada'),
  created_at timestamptz, publicada_at timestamptz)              -- inmutable al publicar (INV-4)

objetivo_aprendizaje(
  id uuid pk, corpus_version_id uuid fk, codigo text, asignatura text, nivel text,
  descripcion text, eje text, tipo text,            -- basal|complementario|oat
  indicadores jsonb, vigencia_desde date, vigencia_hasta date,  -- null = vigente
  unique(corpus_version_id, codigo))

planificacion_anual(
  id uuid pk, establecimiento text, asignatura text, nivel text, anio int,
  corpus_version_id uuid fk, created_at timestamptz, updated_at timestamptz)

unidad_planificada(
  id uuid pk, planificacion_anual_id uuid fk, orden int, titulo text,
  oa_codigos text[], inicio date, fin date, semanas int)        -- fechas o semanas (§9)

documento_generado(
  id uuid pk, tipo text,                 -- planificacion_unidad|planificacion_clase|prueba|clase_deck
  establecimiento text, corpus_version_id uuid fk,
  origen_id uuid null fk -> documento_generado(id),  -- cascada/trazabilidad
  unidad_planificada_id uuid null fk,
  estado_revision text not null default 'borrador',  -- borrador|en_revision|aprobado|rechazado
  estado_generacion text default 'pendiente',        -- pendiente|generando|validado|fallido
  payload jsonb, resultado_gates jsonb,
  autor_humano text null,
  created_at timestamptz, updated_at timestamptz,
  constraint chk_aprobado_requiere_humano
    check (estado_revision <> 'aprobado' or autor_humano is not null))   -- INV-3

traza_ia(
  id uuid pk, documento_id uuid fk, corpus_version_id uuid fk,
  modelo text, ruta_decision text, usage jsonb, gates jsonb, created_at timestamptz)  -- INV-4

job_generacion(
  id uuid pk, documento_id uuid null fk, unidad_planificada_id uuid null fk,
  tipo_trabajo text,                      -- 'cascada_unidad'
  estado text default 'pendiente',        -- pendiente|en_proceso|hecho|fallido
  intentos int default 0, locked_by text, locked_at timestamptz,
  payload jsonb, error text, created_at timestamptz)            -- ADR-003
```

### 4.2 Puertos (ya existen; aquí se implementan)
`OaRepository`, `DocumentoRepository`, `TrazaRepository`, `JobRepository` ya están en `domain/ports`. **No** se cambian las firmas salvo lo mínimo; se añade:

```ts
// domain/ports — nuevo
export interface PlanificacionAnualRepository {
  guardar(p: PlanificacionAnual): Promise<PlanificacionAnual>;
  obtener(id: string): Promise<PlanificacionAnual | null>;
  listar(filtro: { establecimiento: string; asignatura?: string; nivel?: string; anio?: number }): Promise<PlanificacionAnual[]>;
}
```

### 4.3 Dominio nuevo
```ts
// domain/schemas/planificacionAnual.ts
export const SchemaUnidadPlanificada = z.object({
  orden: z.number().int().positive(),
  titulo: z.string().min(1),
  oaCodigos: z.array(z.string().min(1)).min(1),
  inicio: z.string().date().optional(),
  fin: z.string().date().optional(),
  semanas: z.number().int().positive().optional(),
});
export const SchemaPlanificacionAnual = z.object({
  establecimiento: z.string().min(1),
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  anio: z.number().int(),
  unidades: z.array(SchemaUnidadPlanificada).min(1),
});

// domain/gates/secuenciaAnualGate.ts → ReporteGates (mismo shape que la cascada)
//  - cada oaCodigo ∈ corpus vigente            → bloquea
//  - OA del curso sin asignar a ninguna unidad  → marca (cobertura)
//  - OA repetido entre unidades                 → marca (política configurable)
```

### 4.4 Worker (ADR-003) — bucle
```
loop:
  job = SELECT … WHERE estado='pendiente' FOR UPDATE SKIP LOCKED LIMIT 1
  if !job: sleep/backoff; continue
  marcar(job, 'en_proceso', locked_by, locked_at)
  try:
    ctx = derivarContextoCascada(unidadPlanificada, corpus)      // RF-PA.7
    res = CascadaAulaUseCase.ejecutar(ctx)                        // lógica intacta
    persistir(res.unidad/clase/prueba/deck as documento_generado(borrador) + origen_id)  // RF-PA.9
    persistir(traza_ia por artefacto)                            // RF-PA.10
    exportar .pptx (PptxExportAdapter) y registrar
    marcar(job,'hecho')
  catch e:
    intentos++ ; marcar(job, intentos<N ? 'pendiente' : 'fallido', error=e)
```
La cascada en sí sigue siendo *pure function* sobre `LlmPort`/`ExportPort`; el worker es el único que toca DB y cola.

### 4.5 Adapter LLM vía suscripción (Claude Agent SDK)
Hallazgos verificados (skill `claude-api` + docs Agent SDK):
- **Sí** es posible usar la suscripción para uso **interno/propio** (no ofrecer login de claude.ai a terceros): generar un token de larga vida con `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`, que el Agent SDK consume si **no** hay `ANTHROPIC_API_KEY` (precedencia: API key gana si está presente).
- **Structured output**: el Agent SDK soporta `outputFormat: { type: "json_schema", schema }` y devuelve `message.structured_output`; se valida con `Zod.safeParse` antes de persistir. Es **distinto** de `messages.parse()`+`zodOutputFormat` del SDK con API key — por eso es un **adapter nuevo** detrás del mismo `LlmPort`, no una modificación del `AnthropicLlmAdapter`.
- **ToS / límites**: válido para uso interno; ofrecerlo como SaaS a colegios requeriría API keys o aprobación previa. El token caduca (~1 año) → rotación. Coherente con "por el momento".

```ts
// infra-ai/claudeCode/ClaudeCodeLlmAdapter.ts  (implements LlmPort)
//  - usa @anthropic-ai/claude-agent-sdk `query(...)` con outputFormat json_schema
//  - auth: CLAUDE_CODE_OAUTH_TOKEN (no ANTHROPIC_API_KEY en el entorno del worker)
//  - valida la salida con el MISMO schema Zod de la cascada; falla si no parsea
//  - registra usage para traza_ia
```
Composition root: `crearLlm(env): LlmPort` → `claude-code` si hay token, `samples` en otro caso (y `anthropic-api` reservado para producción futura). El `AnthropicLlmAdapter` existente **se conserva** para ese futuro.

> **Riesgo:** la superficie exacta del Agent SDK (`query`, `outputFormat`, `structured_output`) evoluciona y **no se debe asumir de memoria** — el implementador la verifica contra el repo/docs del Agent SDK (regla de la skill `claude-api`). Por eso H-PA.7 arranca con un **spike** (§9, R1).

---

## 5. Historias → tareas (Conventional Commits)

| Historia | Scope | Resumen | Depende de |
|---|---|---|---|
| **H-PA.1** | `feat(infra-db)` | Esquema Drizzle + migración (§4.1) con `CHECK` HIL | — |
| **H-PA.2** | `feat(ingest)` | Ingesta corpus OA JSON → `objetivo_aprendizaje` bajo `corpus_version` publicada (idempotente) | H-PA.1 |
| **H-PA.3** | `feat(infra-db)` | Adapters Drizzle de `OaRepository`/`DocumentoRepository`/`TrazaRepository`/`JobRepository` | H-PA.1 |
| **H-PA.4** | `feat(domain)` | `SchemaPlanificacionAnual` + `secuenciaAnualGate` (+ tests) | — |
| **H-PA.5** | `feat(application)`+`feat(infra-db)` | Puerto+adapter `PlanificacionAnualRepository`; use cases CRUD; `derivarContextoCascada` | H-PA.3, H-PA.4 |
| **H-PA.6** | `feat(domain)` | Máquina de estados HIL (transiciones puras + tests) | — |
| **H-PA.7** | `feat(infra-ai)` | **Spike** Agent SDK → `ClaudeCodeLlmAdapter` + selección en composition root | (spike primero) |
| **H-PA.8** | `feat(worker)` | Bucle worker (cola + cascada + persistencia + traza + reintentos) | H-PA.3, H-PA.5 |
| **H-PA.9** | `feat(web)` | Encolar + polling de estado + leer resultados persistidos + descarga `.pptx` | H-PA.8 |
| **H-PA.10** | `feat(web)` | Superficie de revisión HIL (aprobar/rechazar → `autor_humano`) | H-PA.6, H-PA.9 |
| **H-PA.11** | `test` / `chore` | Tests de integración (repos/worker), evals-lite, DoD verde | todas |

**Ruta crítica:** H-PA.1 → H-PA.3 → {H-PA.5, H-PA.8} → H-PA.9 → H-PA.10. H-PA.4/H-PA.6 (dominio puro) y el spike de H-PA.7 corren en paralelo. La plomería se valida con `samples`; el LLM en vivo (H-PA.7) puede cerrarse al final.

---

## 6. Criterios de aceptación (CA-PA.n)
- **CA-PA.1** Migración corre limpia en Postgres vacía; intentar `UPDATE documento_generado SET estado_revision='aprobado'` sin `autor_humano` **falla** por el `CHECK`.
- **CA-PA.2** Ingerir el JSON de OA crea filas bajo una `corpus_version` publicada; reingerir no duplica.
- **CA-PA.3** `secuenciaAnualGate` bloquea una unidad con un `oaCodigo` inexistente/derogado y marca cobertura/repetición — con tests sin DB ni LLM.
- **CA-PA.4** Un POST de generación responde de inmediato con un id de job; el worker (con `samples`) produce y **persiste** Unidad+Clase+Prueba+Deck como `borrador` + `traza_ia`, y el `.pptx` es descargable.
- **CA-PA.5** Aprobar un documento en la web lo deja `aprobado` con `autor_humano`; no existe ruta que lo logre sin humano.
- **CA-PA.6** Con `CLAUDE_CODE_OAUTH_TOKEN` presente, una generación corre vía `ClaudeCodeLlmAdapter` y la salida valida contra el schema Zod; sin token, cae a `samples` sin tocar la cascada.
- **CA-PA.7** `lint`/`typecheck` verdes; sin `any` injustificado; sin `console.log`; boundaries ESLint respetados (`domain`/`application` no importan `infra`).

## 7. Plan de pruebas + evals
- **Dominio (sin red):** `secuenciaAnualGate`, máquina de estados HIL, derivación de `ContextoCascada` — unit, deterministas (INV-1).
- **Integración DB:** repos Drizzle contra Postgres efímera (Testcontainers o `pglite`; decisión §9, R4) — CRUD, idempotencia de ingesta, `CHECK` HIL.
- **Worker:** un job de extremo a extremo con `FakeLlm`/`samples` → verifica persistencia de los 4 artefactos + `traza_ia` + estado del job; reintento en fallo simulado.
- **Adapter suscripción:** test con doble del Agent SDK (sin red) validando el contrato `LlmPort` y el `safeParse`. Una prueba *opt-in* (saltada en CI) que pega de verdad si hay token.
- **Web:** smoke del flujo encolar→polling→revisar.
- **Evals-lite:** sobre el sample insignia (Matemática 1º), la cascada persistida pasa los gates con las `marca` esperadas (sin recall@k — eso es M3).

## 8. DoD + invariantes
DoD global (`specs/README.md` §DoD) + esta fase: código + tests; `lint`/`typecheck` verdes; sin `any`/`console.log`; al tocar IA → schema Zod validado + grounding (OA existe+vigente) + `traza_ia`; CA-PA demostrables; PR revisado.

Cómo se materializan los invariantes:
- **INV-1** gates y máquina de estados puros en `domain`, testeados sin DB/LLM.
- **INV-2** el LLM solo produce `borrador`; los gates corren antes de cualquier cambio de estado; el gate LLM (si se añade) solo advierte.
- **INV-3** `documento_generado` nace `borrador` (default) + `CHECK chk_aprobado_requiere_humano`; transición de aprobación exige `autor_humano`.
- **INV-4** `corpus_version` inmutable; `traza_ia.corpus_version_id` congela la versión vista.
- **INV-5** boundaries ESLint; `infra-db`/`apps` dependen de `domain`/`application`, nunca al revés.
- **INV-6** proveedor LLM tras `LlmPort` (`samples`/`claude-code`/`anthropic-api` intercambiables); export tras `ExportPort`.

## 9. Riesgos y preguntas abiertas
- **R1 (spike) · Agent SDK structured output + auth de suscripción.** No asumir la API de memoria; verificar `query`/`outputFormat`/`structured_output` y `CLAUDE_CODE_OAUTH_TOKEN` contra el repo/docs del Agent SDK antes de fijar el adapter. Gatilla H-PA.7.
- **R2 · ToS de la suscripción.** Uso interno/dev: ok. Ofrecerlo a colegios (SaaS) requeriría API keys o aprobación previa → al productizar de verdad, volver al `AnthropicLlmAdapter` (ya existe). Token caduca (~1 año): rotación.
- **P1 · Granularidad de la línea de tiempo:** ¿anual o también semestral? ¿fechas exactas o semanas? *(propuesta por defecto: anual, con `inicio/fin` opcionales **o** `semanas`; ambos soportados, ninguno obligatorio).*
- **P2 · Repetición de OA entre unidades:** ¿permitida? *(propuesta: permitida con `marca`, porque enseñar revisita OA; configurable).*
- **P3 · Motor de plantillas configurable** (`02-aula-cascada.md` RF-2.1..2.3): ¿entra en esta fase o se limita a persistir el `extras` actual? *(propuesta: solo persistir `extras` ahora; motor completo después).*
- **P4 (R4) · DB de pruebas:** Testcontainers (Docker) vs `pglite` (en proceso). *(propuesta: `pglite` para velocidad/CI sin Docker; Testcontainers si se necesita paridad exacta).*
- **P5 · Almacenamiento de `.pptx`:** decisión SDD #5 sigue abierta. *(propuesta interina: bytes en disco/registro; S3 en Fase 5).*

---

> **Estado:** aprobado (2026-06-06). Defaults P1–P5 adoptados. **En construcción desde H-PA.1.**
