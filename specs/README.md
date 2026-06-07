# Especificaciones de desarrollo (Spec-Driven Development) — Faro

> **Qué es esto:** la capa de *spec-driven development* de Faro. Una especificación **por fase** del blueprint (`docs/arquitectura-faro.md` §11), pensada para **dirigir la implementación**: cada spec es lo bastante detallada para construirse sin re-derivar el diseño, pero **no** sustituye al blueprint.
>
> **Fuente de verdad:** ante conflicto entre una spec y `docs/`, **mandan los `docs/`** (en especial `arquitectura-faro.md`, que es el documento técnico maestro). Si una spec contradice el blueprint, es un bug de la spec: señálalo, no lo resuelvas inventando.

---

## 1. Cómo encaja con `docs/`

| Capa | Archivo(s) | Rol |
|---|---|---|
| **Visión** | `docs/solucion-educacion.md` | Producto, negocio, foso, pitch. *Por qué* existe Faro. |
| **Arquitectura** | `docs/arquitectura-faro.md` + ADR 001–004 | *Cómo* se construye. Blueprint autoritativo. |
| **Backlog** | `docs/plan-implementacion-faro.md` | Épicas A–G, estimaciones, plan semanal. |
| **Specs (esta carpeta)** | `specs/NN-*.md` | *Qué construir en cada fase*, como contrato ejecutable: requisitos numerados, contratos concretos, criterios de aceptación, plan de pruebas. |

Una spec **deriva** del blueprint §11 + las épicas del plan, y las **operacionaliza**: convierte la narrativa en requisitos verificables (RF-n), contratos copiables (puertos TS, Zod, DDL, API) y criterios de aceptación demostrables (CA-n). Es el artefacto que un implementador toma y ejecuta.

---

## 2. Mapa de fases

Las fases siguen `docs/arquitectura-faro.md` §11 (construcción por *vertical slices* de producción). Cada fase entrega funcionalidad **vertical, íntegra y de calidad de producción** (no stubs).

| Fase | Spec | Objetivo en una línea | Épicas | Módulo | Estado spec |
|---|---|---|---|---|---|
| **0** | [`00-cimientos.md`](./00-cimientos.md) | Cimientos de producción + primer *vertical slice* real (generador de pruebas de Aula sobre corpus OA mínimo real) | A (+ semillas B/E/G) | M0 (slice) | ✅ Escrita |
| **1** | [`01-nucleo-rag.md`](./01-nucleo-rag.md) | El foso: ingesta real + grafo normativo/curricular + RAG robusto completo (ADR-001) | B | Núcleo | ✅ Escrita |
| **2** | [`02-aula-cascada.md`](./02-aula-cascada.md) | M0 Aula: **cascada** Unidad→Clase→Prueba+`.pptx` con plantillas configurables por colegio (variante NEE/DUA deferida) | G | M0 | ✅ Escrita |
| **3** | `03-normativo.md` | M3: asistente normativo con citas (síncrono+streaming) + auditoría reglamento Decreto 67 | C | M3 | ⬜ Pendiente |
| **4** | `04-pme.md` | M1 parcial: borrador de la Fase Anual del PME con casillas de los 6 planes | D | M1 | ⬜ Pendiente |
| **5** | `05-hardening.md` | Hardening de cumplimiento (DPA, RLS, retención) + piloto 1–2 colegios + observabilidad | E + F | Transversal | ⬜ Pendiente |

> **Dependencias entre fases:** 0 → 1 → {2, 3, 4} → 5. Las fases 2, 3 y 4 son módulos independientes que se apoyan sobre el núcleo de la Fase 1; pueden paralelizarse si hay equipo. La Fase 5 endurece todo lo anterior para el piloto. M2 (NEE completo) queda **fuera del MVP** (ver alcance global).

---

## 3. Anatomía de una spec (plantilla de 9 secciones)

Cada `specs/NN-*.md` sigue esta estructura fija:

1. **Contexto y objetivo** — qué entrega la fase y por qué; decisiones ya confirmadas.
2. **Alcance** — lo que *entra* y lo que *NO entra* (deferido, con la fase destino).
3. **Requisitos funcionales (RF-n)** — enunciados numerados y *testables*.
4. **Diseño técnico + contratos** — estructura, DDL SQL, puertos TS, schemas Zod, contratos de API. Copiable.
5. **Historias → tareas** — desglose en commits convencionales (`feat:`, `chore:`, …).
6. **Criterios de aceptación (CA-n)** — condiciones demostrables que cierran cada RF/historia.
7. **Plan de pruebas + evals** — qué se testea, en qué nivel de la pirámide, con qué umbrales.
8. **DoD + invariantes** — *Definition of Done* de la fase + invariantes que no puede violar.
9. **Riesgos y preguntas abiertas** — lo que puede fallar y lo que el dueño debe responder antes de construir.

---

## 4. Convenciones

- **Numeración:** `RF-<fase>.<n>` para requisitos (ej. `RF-0.7`); `CA-<fase>.<n>` para criterios de aceptación; `H-<fase>.<n>` para historias. Estables: no se renumeran; lo obsoleto se marca *(retirado)*.
- **Trazabilidad:** cada RF referencia su origen en `docs/` (`§` del blueprint, épica del plan, ADR). No se inventan requisitos (convención del dueño).
- **Commits:** Conventional Commits. Cada historia mapea a uno o más commits con su *scope* de paquete (`feat(domain):`, `feat(infra-ai):`, …).
- **`[VERIFICAR: ...]`:** dato local o externo sin confirmar. **No se inventa**: se marca y se traslada a §9 de la spec y a la tabla global de §6 de este índice.
- **Anclajes `[E#]`/`[A#]`:** afirmaciones del contexto chileno verificadas en `docs/master-prompt-chile-govtech-startups.md`. Solo se citan anclajes que existan ahí.
- **DoD heredado:** toda historia hereda el DoD global (abajo) **además** del DoD específico de su fase.
- **Idioma:** especificaciones en español de Chile; términos técnicos en inglés donde es estándar (port, adapter, gate, retrieval).

### DoD global (toda historia, todas las fases)
Código + tests; `lint` y `typecheck` verdes; **sin `any`** injustificado; **sin `console.log`** en producción (logger estructurado). Si toca IA: **schema Zod validado + grounding verificado + `traza_ia` registrada**. CA cumplido y demostrable; PR revisado y mergeado con commit convencional. *(De `plan-implementacion-faro.md` §9 + `arquitectura-faro.md` §11.)*

---

## 5. Invariantes transversales (el foso — aplican a TODAS las fases)

Estos invariantes son **criterios de aceptación globales**: ninguna fase puede violarlos. Son el foso expresado como arquitectura testeable (`arquitectura-faro.md` §0, §1.2, §9; CLAUDE.md §5).

- **INV-1 · El dominio regulado se testea sin red.** Vigencias, validez de citas (existe + vigente), ítem→OA, una-sola-correcta, RRF: deterministas, en `packages/domain`, con tests **sin DB ni LLM**.
- **INV-2 · El LLM nunca decide; propone borradores.** Todo lo que sale del LLM pasa por *gates* deterministas antes de poder cambiar de estado (Art. 8 bis, Ley 21.719 [E15]/[A13d]). El gate LLM solo *advierte/escala*, nunca *aprueba*.
- **INV-3 · Cumplimiento by-design, no by-convention.** Todo documento **nace `borrador`** (forzado por tipo y por el `CHECK chk_aprobado_requiere_humano`). **No existe camino de código** que cree un documento `aprobado` sin `autor_humano` (HIL obligatorio).
- **INV-4 · Corpus versionado = reproducibilidad legal.** `corpus_version` inmutable al publicar; cada `traza_ia` referencia la `corpus_version` exacta que vio la generación (ADR-004).
- **INV-5 · Regla de dependencia.** Los `import` apuntan **siempre hacia el dominio**. `infra`/`apps` dependen de `application`/`domain`; nunca al revés. Enforzado por ESLint boundaries + fronteras físicas de paquete (ADR-002).
- **INV-6 · Proveedores externos son adapters reemplazables.** Voyage, reranker, OCR, export `.pptx` viven tras puertos. Cambiar de proveedor = cambiar un adapter (+ reindexar si toca embeddings), no tocar la lógica de negocio.

Cada spec, en su §8, indica **cómo** materializa los invariantes que toca (p. ej. el `CHECK` de DB, el lint de boundaries, el `borrador` inicial).

---

## 6. Preguntas abiertas globales (el dueño debe responder antes de construir)

De `arquitectura-faro.md` §13. Se listan aquí con la **fase que bloquean** y su **estado**. No se inventan respuestas.

| # | Pregunta | Bloquea | Estado |
|---|---|---|---|
| 1 | `voyage-law-2`: ¿se confirma el modelo y su **dimensión exacta**? ¿Hay API key para Fase 1? | Fase 1 (fija `corpus_version.embedding_dim` y `vector(N)`) | Fase 0 resuelta: arranca con `FakeEmbeddings`. Voyage real **pendiente** `[VERIFICAR]`. |
| 2 | Reranker: ¿Cohere Rerank o pase barato de Haiku? | Fases 0–1 | Resuelta para arranque: **Haiku** (sin dependencia nueva). Cohere = opción Fase 1. |
| 3 | OCR/Document AI: ¿qué proveedor se compra? | Fase 3/5 (ingesta de reglamentos/diagnósticos) | **Pendiente** (build-vs-buy decidido: comprar; falta proveedor concreto → `OcrAdapter` + DPA). |
| 4 | Despliegue: ¿Vercel (serverless) o Node server propio? | Fase 0/5 (cómo se hostea `apps/worker`) | Resuelta para arranque: **Node server local + worker**. Prod **pendiente**. |
| 5 | Object storage: ¿qué S3-compatible para `.pptx`/`.docx`/`.pdf`? | Fase 2 | **Pendiente** (subprocesador + retención). |
| 6 | Corpus inicial real: ¿qué asignatura/curso y qué subset de OA? | Fase 0/1 | 🟡 Parcial: **Matemática 1° básico** curado (`corpus/curriculum/`) + **Decreto 67 art. 18** curado, pendiente validación (`corpus/normativa/`). Falta el **reglamento de evaluación real** (lo aporta el dueño). |
| 7 | `effort` por costo: ¿Opus `high` en razonamiento normativo o capar a `medium`? | Fase 3/4 (unit economics) | **Pendiente** (presupuesto piloto). |
| 8 | Multi-tenancy día-1: ¿el piloto incluye un SLEP (multi-establecimiento)? | Decide si RLS entra en Fase 0 o Fase 5 | Resuelta para arranque: RLS a **Fase 5**. |
| 9 | APDP / regulación operativa previa al 1-dic-2026 (Ley 21.719): ¿guía operativa a reflejar en transparencia/DPA? | Fase 5 | **Pendiente** `[VERIFICAR]`. |
| 10 | Horas ahorradas (baseline): ¿medimos baseline propio en el piloto? | Fase 5 (métrica de pitch) | **Pendiente** `[VERIFICAR]` (no hay estudio chileno verificable). |

---

## 7. Alcance global del MVP (recordatorio)

**Entra** (`solucion-educacion.md` §6, `arquitectura-faro.md` §11): núcleo (6 planes + Decreto 67/83 subset + corpus OA), **M0 Aula** (pruebas con variante NEE/DUA + clases `.pptx`), **M3** (asistente normativo + auditoría de reglamento), **M1 parcial** (Fase Anual del PME), evals + HIL + DPA.

**NO entra (v1):** integración API directa con plataformas MINEDUC `[VERIFICAR]`; **M2 NEE completo**; multi-establecimiento SLEP; **personalización/evaluación adaptativa por alumno** (perfilamiento → fase posterior con consentimiento [E15]).

---

## 8. Estado y próximos pasos

- ✅ **Escritas:** Fase 0 (`00-cimientos.md`), Fase 1 (`01-nucleo-rag.md`), Fase 2 (`02-aula-cascada.md`).
- ⬜ **Pendientes:** Fases 3–5. Se redactan con la misma plantilla cuando el dueño lo indique (orden sugerido: 3 → 4 → 5).
- 🔁 **Re-secuenciación (dueño, 2026-06-06):** tras **cerrar el demo de Aula**, la siguiente fase de construcción es **productizar M0 Aula** (persistencia + HIL + worker asíncrono + **línea de tiempo / Planificación Anual**), **no** el RAG. El foso RAG (`01-nucleo-rag.md`) y todo `pgvector` se **posponen a M3** (el currículum es estructurado: OA por `(asignatura, nivel)` = consulta determinista, no búsqueda semántica). Plan aprobado: [`../docs/plan-fase-1-productizacion-aula.md`](../docs/plan-fase-1-productizacion-aula.md). Este índice se actualizará al promover ese plan a spec numerada.

> **Nota (sesión 2026-06-06):** la Fase 2 se expandió por decisión del dueño de "pruebas + clases" a la **cascada completa de planificación** (Unidad → Clase → Prueba + `.pptx`) con plantillas configurables por colegio; ver `02-aula-cascada.md` §1.3.

> Para arrancar la construcción, el punto de entrada es [`00-cimientos.md`](./00-cimientos.md). Antes de codear, resolver las preguntas abiertas que bloquean la fase (tabla §6) — en particular la **entrega del corpus mínimo real** (#6).
