# Especificaciones de desarrollo (Spec-Driven Development) — Faro **v2**

> **Qué es esto:** la capa de *spec-driven development* de Faro. Una especificación **por fase** pensada para **dirigir la implementación**: cada spec es lo bastante detallada para construirse sin re-derivar el diseño.
>
> **Fuente de verdad:** ante conflicto entre una spec y `docs/`, en lo que sigue **manda esta carpeta `specs/`** y el `CLAUDE.md` raíz, porque los `docs/` describen el alcance **v1 (normativo)** que el dueño **aparcó** (ver §0). Si una spec contradice una decisión registrada del dueño, es un bug de la spec: señálalo, no lo resuelvas inventando.

---

## 0. Cambio de alcance — de v1 (normativo) a v2 (planificaciones) · decisión del dueño, 2026-06-07

Faro **v2** es **más simple y más enfocado** que el producto v1 documentado en `docs/`:

**Qué es v2 (una frase):** un **generador de planificaciones docentes para básica chilena (1º–6º)** — dado **curso + asignatura + OA**, produce la planificación en el **formato real del colegio** (`.docx`/`.pdf`), y desde ella un **PPT infantil** y una **prueba formativa evaluable**. **Sin normativa. Sin RAG.**

**Qué se aparca (fuera de alcance v2, mantenido como referencia):** todo el "foso normativo" de v1 — grafo normativo, **RAG/pgvector**, Decreto 67/83 como motor de validación, **M1 PME**, **M2 PACI/NEE**, **M3 asistente normativo**, gates legales/verificación de citas. No se borra: queda documentado en `docs/` y en [`01-nucleo-rag.md`](./01-nucleo-rag.md) con una nota de "fuera de alcance v2", por si esos módulos vuelven a futuro.

**El único "conocimiento" de v2 son datos, no RAG:** el currículum nacional (OA) como JSON estructurado, consultado de forma **determinista** por `(asignatura, nivel)`. El currículum es estructurado: no necesita búsqueda semántica.

**Por qué el pivote es barato:** el foso normativo **nunca se construyó** (Fase 0/1 se hicieron sin RAG ni pgvector). Lo que sí existe —monorepo hexagonal, persistencia, worker asíncrono, HIL, cascada de Aula, export `.pptx`— **se recicla casi entero**. El cambio real es: (a) modelar **dos formatos reales** de planificación, (b) export `.docx` + `.pdf` que **calcan las tablas**, (c) reorientar PPT y prueba a **público infantil**.

---

## 1. Cómo encaja con `docs/`

| Capa | Archivo(s) | Rol en v2 |
|---|---|---|
| **Visión (v1, histórica)** | `docs/solucion-educacion.md` | Producto/negocio del Faro **normativo**. Útil como visión de largo plazo; **no** es el alcance de build v2. |
| **Arquitectura** | `docs/arquitectura-faro.md` + ADR 002/003/004 | Hexagonal, persistencia, worker, corpus versionado: **vigentes**. Las partes de grafo normativo / RAG / gates legales: **aparcadas** (ver nota en el doc). ADR-001 (RAG): aparcado. |
| **Backlog (v1)** | `docs/plan-implementacion-faro.md` | Épicas A–G del producto normativo. Referencia; el plan v2 vive en estas specs. |
| **Specs v2 (esta carpeta)** | `specs/NN-*.md` | *Qué construir en cada fase de v2*, como contrato ejecutable. **Manda sobre los `docs/` v1.** |

---

## 2. Mapa de fases — v2

Cada fase entrega funcionalidad **vertical, íntegra y de calidad de producción** (no stubs).

| Fase | Spec | Objetivo en una línea | Estado |
|---|---|---|---|
| **0** | [`00-cimientos.md`](./00-cimientos.md) | Cimientos: monorepo hexagonal + persistencia + worker asíncrono + HIL + export base | ✅ **construido** |
| **1** | [`01-curriculum-oa.md`](./01-curriculum-oa.md) | **Datos de currículum:** OA de 1º–6º básico, todas las asignaturas, como JSON versionado. Sin RAG. | ✅ **construido** — 56 bloques / 791 OA + 32 OAT, todas las asignaturas, `corpus@2026.1` |
| **2** | [`02-planificacion.md`](./02-planificacion.md) | **Núcleo:** generar la planificación en **2 formatos reales** (A denso, B DUA), configurable, export **.docx + .pdf**. Generación **híbrida** (datos fijos + IA). | ✅ **construido** — núcleo + auditoría de fidelidad resuelta |
| **3** | [`03-ppt-infantil.md`](./03-ppt-infantil.md) | Desde la planificación, un **PPT colorido e interactivo** para 6–12 años. | 🟡 **MVP construido** — tramo 5º–6º en calibración (refs en investigación) |
| **4** | [`04-prueba-formativa.md`](./04-prueba-formativa.md) | Desde la planificación, una **prueba formativa evaluable apta para niños**. | 🟡 **motor construido** — falta cablear en web/worker + UI |
| **5** | `05-piloto.md` *(por escribir)* | Pulido + piloto en 1–2 colegios. | ⬜ |

> **Aparcada (no es fase v2):** [`01-nucleo-rag.md`](./01-nucleo-rag.md) — el RAG/grafo normativo del producto v1. Mantenida como referencia (ver nota al inicio del archivo).

**Dependencias:** 0 → 1 → 2 → {3, 4} → 5. F3 y F4 dependen de F2 (consumen la planificación) y pueden paralelizarse.

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

- **Numeración:** `RF-<fase>.<n>` para requisitos; `CA-<fase>.<n>` para criterios; `H-<fase>.<n>` para historias. Estables: no se renumeran; lo obsoleto se marca *(retirado)*.
- **Trazabilidad:** cada RF referencia su origen (PDF de plantilla real, Bases Curriculares, decisión del dueño). **No se inventan requisitos** (convención del dueño).
- **Commits:** Conventional Commits. Cada historia mapea a uno o más commits con su *scope* de paquete.
- **`[VERIFICAR: ...]`:** dato local o externo sin confirmar. **No se inventa**: se marca y se traslada a §9 de la spec.
- **Idioma:** specs en español de Chile; términos técnicos en inglés donde es estándar (port, adapter, template, render).

### DoD global (toda historia, todas las fases)
Código + tests; `lint` y `typecheck` verdes; **sin `any`** injustificado; **sin `console.log`** en producción (logger estructurado). Si toca IA: **schema Zod validado** + el contenido generado nace `borrador` para revisión del docente. CA cumplido y demostrable; PR revisado y mergeado con commit convencional.

---

## 5. Invariantes transversales (aplican a TODAS las fases v2)

Son **criterios de aceptación globales**: ninguna fase puede violarlos. Versión v2 (sin el framing legal de v1).

- **INV-1 · El dominio se testea sin red.** Validación de schema, "el OA existe en el corpus", "los campos requeridos de la plantilla están presentes", ítem→OA, "una sola alternativa correcta": deterministas, en `packages/domain`, con tests **sin DB ni LLM**.
- **INV-2 · La IA propone; el docente decide.** Lo que sale del LLM (experiencias/actividades, indicadores, ítems) es **borrador**; pasa por validaciones deterministas y por **revisión humana (HIL)** antes de darse por bueno. La IA nunca "aprueba" un documento.
- **INV-3 · Borrador by-design.** Todo documento **nace `borrador`** (forzado por el `CHECK chk_aprobado_requiere_humano`). **No existe camino de código** que cree un documento `aprobado` sin `autor_humano`. *(Es el tagline del producto: "listo para revisar".)*
- **INV-4 · Currículum versionado.** `corpus_version` inmutable: cada generación referencia la versión exacta del currículum OA que vio (ADR-004), para reproducibilidad.
- **INV-5 · Regla de dependencia.** Los `import` apuntan **siempre hacia el dominio**. `infra`/`apps` dependen de `application`/`domain`; nunca al revés (ESLint boundaries + fronteras de paquete, ADR-002).
- **INV-6 · Proveedores externos = adapters reemplazables.** El LLM y los exportadores (`.docx`, `.pdf`, `.pptx`) viven tras puertos. Cambiar de motor de render o de proveedor de IA = cambiar un adapter, no la lógica de negocio.

---

## 6. Datos y preguntas abiertas — v2

| # | Tema | Bloquea | Estado |
|---|---|---|---|
| 1 | **Corpus OA 1º–6º, todas las asignaturas:** extraer de `docs/bases-curriculares-primera-a-sexto-basico.pdf` (python + pdfplumber). | Fase 1 (es su entregable) | ✅ **Resuelto.** 56 bloques / 791 OA + 32 OAT, `corpus@2026.1`, con test de integridad. ~0.9% de OA marcados `[VERIFICAR]` por layout del PDF (no inventados). |
| 2 | **Indicadores de evaluación:** viven en los *Programas de Estudio* (no en las Bases). | Fase 2 (campo "indicadores") | Resuelto por decisión **híbrida**: la IA los redacta como `ia_borrador`. Si el dueño aporta el Programa de Estudio, se usan los oficiales. |
| 3 | **Referencias de estilo del PPT infantil y de la prueba.** | Fases 3 y 4 | ⬜ El dueño las comparte. |
| 4 | **Lista exacta de asignaturas.** | Fase 1 | ✅ **Resuelto: TODAS las de las Bases Curriculares.** Lenguaje y Comunicación, Matemática, Ciencias Naturales, Historia/Geografía y Cs. Sociales, Artes Visuales, Música, Ed. Física y Salud, Tecnología, Orientación (1º–6º) + Idioma Extranjero Inglés (5º–6º) + OAT. (Religión queda fuera: no está en las Bases.) |
| 5 | **Theming visual del export** (logo/colores del colegio en el `.docx`/`.pdf`). | Fase 2 (iteración) | v2 entrega la estructura de tablas fiel; el theming fino es iteración posterior. |

---

## 7. Alcance del producto — v2

> Ya no estamos en etapa MVP: las Fases 0–4 están construidas y el currículum cubre todas las asignaturas. Lo que sigue es productización (cablear Fases 3/4 en web/worker + UI), calibración del tramo 5º–6º y piloto.

**Entra:** datos de currículum OA (1º–6º, todas las asignaturas); generador de planificación en **2 formatos reales** configurables; export **.docx + .pdf**; generación **híbrida** (OA/listas = datos fijos, experiencias/indicadores = IA borrador); **PPT infantil**; **prueba formativa** apta para niños; HIL (revisión docente).

**NO entra (v2):** normativa de cualquier tipo (RAG, Decreto 67/83 como motor, citas legales); PME (M1); PACI/NEE (M2); asistente normativo (M3); multi-establecimiento SLEP; personalización por alumno; integración API con plataformas MINEDUC.

---

## 8. Estado y próximos pasos

- ✅ **Construido:** Fases 0–2 completas (cimientos, corpus OA completo, núcleo de planificación con export `.docx`/`.pdf` fiel) + Fase 3 (PPT infantil, MVP) y Fase 4 (motor de prueba formativa).
- ▶️ **Siguiente:** cablear los motores de Fase 3 (PPT) y Fase 4 (prueba) en web/worker + UI; calibrar el tema del tramo **5º–6º** con las referencias de estilo en investigación; limpiar rótulos "Decreto 67" stale; Fase 5 (piloto).
- ⏸️ **En espera del dueño:** referencias de estilo del tramo **5º–6º** (sin material local) — en investigación vía deep research; estrategia de banco de imágenes con licencia.
