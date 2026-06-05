# CLAUDE.md — gestor-planificacion-docente ("Faro")

> Este archivo es el punto de entrada para cualquier instancia de Claude Code que trabaje en este repo. Léelo entero antes de actuar. Las **fuentes de verdad** detalladas están en `docs/` (índice al final).

## 1. Qué es este proyecto

**Faro** es un **copiloto de cumplimiento y documentación pedagógica para colegios chilenos (K-12)**. Convierte la normativa MINEDUC y el currículum nacional en **documentos regulados listos para revisar**: pruebas y clases alineadas a Objetivos de Aprendizaje (OA) y al reglamento de evaluación (Decreto 67), el Plan de Mejoramiento Educativo (PME) que consolida 6 planes obligatorios, informes per-alumno (Decreto 67) y PACI (Decreto 83), y un asistente normativo con citas.

**Tagline:** *"El copiloto que convierte la normativa en documentos listos para revisar."*

**Una frase técnica:** Faro es un **encargado de tratamiento** que produce documentos pedagógicos y de cumplimiento con **corrección de nivel legal**, donde el foso **no es el LLM** sino dos *knowledge graphs* curados (normativa MINEDUC con vigencias; currículum nacional / OA) más la lógica de workflow regulado.

## 2. Estado del proyecto

- **Fase:** pre-construcción. La documentación de producto y arquitectura está **madura y revisada**; el código aún **no existe**.
- **Lo que hay:** visión de producto y negocio (`docs/solucion-educacion.md`), blueprint de arquitectura de producción (`docs/arquitectura-faro.md`), plan de implementación por épicas (`docs/plan-implementacion-faro.md`), 4 ADRs, y un prompt de scaffolding.
- **Lo siguiente:** materializar la Fase 0 (cimientos de producción + primer *vertical slice* real del Módulo Aula), según `docs/arquitectura-faro.md` §11.

## 3. Objetivos y alcance

### Objetivo
Devolverle horas al docente y a la dirección escolar generando el papeleo regulado como **borradores citados a la norma vigente**, con revisión humana obligatoria, posicionado como **gestión curricular/pedagógica** (clave para elegibilidad SEP).

### Alcance del MVP (entra) — ver `docs/arquitectura-faro.md` §11 y `docs/solucion-educacion.md` §6
- **Núcleo (el foso):** grafo normativo (6 planes + Decreto 67/83) + corpus de currículum/OA, con grounding y vigencias.
- **M0 Aula** (cuña de uso diario): generador de **pruebas** (alineadas a OA + Decreto 67, con variante NEE/DUA) y **clases** (export `.pptx`).
- **M3:** asistente normativo con citas + auditoría del reglamento de evaluación.
- **M1 (parcial):** borrador de la **Fase Anual del PME** con casillas de los 6 planes.
- Evals (fidelidad normativa, recall@k, alineación a OA) + human-in-the-loop + DPA.

### Fuera de alcance (v1)
Integración API directa con plataformas MINEDUC `[VERIFICAR]`; M2 NEE completo; multi-establecimiento SLEP; **personalización/evaluación adaptativa por alumno** (perfilamiento → fase posterior, requiere consentimiento, ver [E15]).

## 4. Los cuatro módulos (un núcleo, land → expand)

| Módulo | Hace | Usuario | Comprador |
|---|---|---|---|
| **M0 Aula** | Pruebas + clases alineadas a OA y Decreto 67 (con versión NEE/DUA), export `.pptx`/`.docx` | Docente | Colegio (SEP, pedagógico) |
| **M3 Normativo** | Responde normativa con citas; audita el reglamento de evaluación | Docente / directivo | Colegio (freemium → pago) |
| **M1 PME** | Borrador del PME (Fase Estratégica/Anual) y consolida los 6 planes | Jefe UTP / dirección | **Sostenedor / SLEP** |
| **M2 NEE** | Borrador de PACI (Decreto 83) e informes per-alumno (Decreto 67) | Docente / coord. PIE | Colegio (SEP/PIE) |

**Movimiento comercial:** M0 (gancho de uso diario, SEP-elegible) → M3 (complemento "riesgo limitado") → M1 (alto valor, comprador SLEP) → M2 (foso e impacto, dolor del coordinador PIE).

## 5. Arquitectura (resumen — la verdad está en `docs/arquitectura-faro.md`)

**Filosofía:** Ports & Adapters (hexagonal). El dominio regulado (grafo normativo, OA, generación, verificación) es **independiente de frameworks**; los proveedores externos (Voyage, reranker, OCR, export) son adaptadores reemplazables.

**Regla de dependencia (la única que importa):** los `import` apuntan **siempre hacia el dominio**. `infra` y `apps` dependen de `application` y `domain`; nunca al revés.

**Invariantes de arquitectura (el foso, testeable):**
1. **El dominio regulado se testea sin red.** Vigencias, validez de citas, ítem→OA: deterministas, en `domain`, sin DB ni LLM.
2. **El LLM nunca decide; propone borradores.** Todo lo que sale del LLM pasa por *gates* deterministas antes de cambiar de estado (Art. 8 bis Ley 21.719).
3. **Cumplimiento by-design, no by-convention.** `borrador` es el estado inicial forzado por tipo y por constraint de DB; no hay camino de código que cree un documento `aprobado` sin revisor humano.
4. **Corpus versionado** (`corpus_version` inmutable) + `traza_ia.corpus_version_id` = reproducibilidad legal.

**Stack no negociable:** monorepo pnpm; Next.js App Router + React + TS `strict`; Postgres + pgvector + tsvector; Drizzle; SDK Anthropic (routing Opus/Sonnet/Haiku); Zod + `zodOutputFormat`; Vitest; generación asíncrona vía cola + worker. Detalle y ADRs en `docs/`.

> **IMPORTANTE sobre el stack de IA:** antes de fijar IDs de modelo, precios, mínimos de caching o límites de tokens, **consulta la skill `claude-api`** — no respondas de memoria. Los IDs vigentes son `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`.

## 6. Cumplimiento (es parte del producto, no un anexo)

- **Rol legal:** Faro = encargado de tratamiento; el colegio/sostenedor = responsable → **DPA por establecimiento**.
- **Datos de menores (Ley 21.719, Art. 16 quáter):** base de licitud por dato (mandato legal vs consentimiento parental). En el MVP se opera **a nivel curso/contenido, no individualizado por alumno** (bajo riesgo).
- **Decisiones automatizadas (Art. 8 bis):** human-in-the-loop obligatorio; `traza_ia` da "información significativa sobre la lógica".
- **Elegibilidad SEP:** posicionar como gestión curricular/calidad escrita en el PME; **nunca** como contabilidad/rendición (prohibido financiar con SEP).
- **Clase de riesgo IA (proyecto de ley):** apoyo a gestión + chatbot normativo = "riesgo limitado".

## 7. Convenciones (heredan del CLAUDE.md global del usuario + principios de este repo)

- **Idioma:** entregables de cara a usuario/jurado en **español de Chile**; términos técnicos en inglés donde es estándar.
- **Código:** claridad sobre cleverness. **Sin `any`** en TypeScript salvo justificación. **Sin `console.log`** en producción (usar el logger estructurado de `observability`).
- **Comentarios:** documenta el *por qué* de decisiones no obvias en 1 línea, no el *qué*.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- **No inventes requisitos.** Si algo es ambiguo o falta un dato local, **pregunta** o márcalo `[VERIFICAR: ...]`. No inventes hechos chilenos (normas, cifras, plazos).
- **DoD (cuando haya código):** código + tests, lint/typecheck verdes, sin `any`, y —si toca IA— schema validado + grounding + `traza_ia`, más CA demostrable y PR revisado. Ver `docs/arquitectura-faro.md` §11.

## 8. Cómo trabajar en este repo

- **Antes de actuar, clasifica la tarea y delega** según el routing del CLAUDE.md global (explorer/researcher/implementer/tester/reviewer/architect/debugger). Excepción: tareas triviales (1 archivo, <20 líneas, cambio obvio) hazlas directo.
- **Para features:** architect produce plan → revisión con el dueño → implementer → tester → reviewer → commit.
- **Fuentes de verdad:** ante conflicto entre este `CLAUDE.md` y los `docs/`, **los `docs/` mandan** en el detalle técnico; este archivo es el mapa. Si detectas contradicción, señálala, no la resuelvas inventando.
- **Anclajes:** las afirmaciones de contexto chileno se referencian con `[E#]` (educación) y `[A#]` (GovTech) — definidos en `docs/master-prompt-chile-govtech-startups.md`. No cites un anclaje sin que exista ahí.

## 9. Índice de documentos (`docs/`)

| Documento | Qué contiene |
|---|---|
| `solucion-educacion.md` | **Visión de producto, negocio y pitch.** Tesis, foso, 4 módulos, GTM, unit economics, riesgos. |
| `arquitectura-faro.md` | **Blueprint de arquitectura de producción.** Ports & adapters, modelo de datos, gates, pipeline RAG, plan por fases. *(El documento técnico maestro.)* |
| `plan-implementacion-faro.md` | Plan de implementación por épicas A–G y DoD. |
| `adr-001-recuperacion-rag.md` | Decisión: recuperación RAG híbrida + grafo + rerank + verificación. |
| `adr-002-monorepo-dominio.md` | Decisión: monorepo pnpm con paquetes de dominio puros. |
| `adr-003-generacion-asincrona.md` | Decisión: generación vía cola + worker (no en el request HTTP). |
| `adr-004-corpus-versionado.md` | Decisión: `corpus_version` inmutable para reproducibilidad legal. |
| `prompt-scaffolding-faro.md` | Prompt de arranque para scaffolding del repo. |
| `educacion-proyectos-run.md` | Notas de ejecución del vertical educación. |
| `master-prompt-chile-govtech-startups.md` | **Knowledge pack verificado** del contexto chileno (anclajes `[E#]`/`[A#]`). |

## 10. Glosario mínimo de dominio

- **PME** — Plan de Mejoramiento Educativo: instrumento MINEDUC que consolida los 6 planes obligatorios; base de cumplimiento SEP y rendición.
- **OA** — Objetivo de Aprendizaje (Bases Curriculares): unidad citable del currículum nacional.
- **Decreto 67/2018** — evaluación, calificación y promoción; obliga reglamento de evaluación (≥16 ítems) subido a SIGE.
- **Decreto 83/2015** — NEE; obliga PACI (Plan de Adecuaciones Curriculares Individualizado) por estudiante.
- **SEP** — Subvención Escolar Preferencial (Ley 20.248): financia software solo si es pedagógico y está en el PME.
- **SLEP** — Servicio Local de Educación Pública (Ley 21.040): nuevo sostenedor/comprador público que reemplaza a los DAEM.
- **PIE** — Programa de Integración Escolar (apoyo NEE).
- **HIL** — human-in-the-loop: revisión humana obligatoria antes de aprobar un documento.
