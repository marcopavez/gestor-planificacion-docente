# CLAUDE.md — gestor-planificacion-docente ("Faro") · **v2**

> Punto de entrada para cualquier instancia de Claude Code en este repo. Léelo entero antes de actuar. El **plan de build vigente** vive en `specs/` (empieza por `specs/README.md`). Los `docs/` describen la **visión v1 (normativa)**, hoy **aparcada** (ver §9).

## 1. Qué es este proyecto (v2)

**Faro v2** es un **generador de planificaciones docentes para educación básica chilena (1º–6º)**. Dado **curso + asignatura + Objetivos de Aprendizaje (OA)**, produce la **planificación con el formato real del colegio** (`.docx` y `.pdf`, calcando sus tablas), y desde ella un **PPT infantil interactivo** y una **prueba formativa evaluable** aptos para niños de 6–12 años.

**Una frase técnica:** una app que toma datos **estructurados** del currículum nacional (OA por asignatura/nivel) y, de forma **híbrida** (datos fijos + redacción de IA), llena **plantillas de planificación configurables** que se exportan a documentos fieles a los formatos reales de los colegios. **Sin normativa. Sin RAG.**

**Cambio de rumbo (2026-06-07):** el dueño simplificó el producto. Se **eliminó** todo el "foso normativo" de v1 (grafo normativo, RAG, Decreto 67/83, PME, PACI, asistente normativo). El detalle del pivote está en `specs/README.md` §0.

## 2. Estado del proyecto

- **Construido (Fase 0 + productización previa):** monorepo hexagonal (pnpm), persistencia (Postgres + Drizzle), worker asíncrono (cola), HIL (`borrador→revisado`), cascada de Aula y export `.pptx`. Suite verde en `main`.
- **Lo siguiente (v2):** **Fase 1** (corpus OA 1º–6º, todas las asignaturas) y **Fase 2** (núcleo: planificación en 2 formatos, export `.docx`/`.pdf`). Ver `specs/`.
- **En espera del dueño:** referencias de estilo para **Fase 3** (PPT infantil) y **Fase 4** (prueba formativa).

## 3. Objetivo y alcance (v2)

### Objetivo
Devolverle horas al docente generando su **planificación** (y, desde ella, PPT y prueba) como **borradores listos para revisar**, fieles al formato de su colegio.

### Entra (MVP v2)
- **Datos de currículum:** OA de 1º–6º básico, **todas las asignaturas** de la malla, como JSON versionado (extraído de las Bases Curriculares). *(Fase 1)*
- **Núcleo de planificación:** **2 formatos reales** configurables (A denso, B DUA), generación **híbrida**, export **`.docx` + `.pdf`** que calcan las tablas. *(Fase 2)*
- **PPT infantil** colorido/interactivo (6–12 años) desde la planificación. *(Fase 3)*
- **Prueba formativa** evaluable apta para niños. *(Fase 4)*
- **HIL** (revisión docente) transversal.

### Fuera de alcance (v2)
Normativa de cualquier tipo (RAG, Decreto 67/83 como motor, citas legales); **PME** (M1), **PACI/NEE** (M2), **asistente normativo** (M3); multi-establecimiento SLEP; personalización por alumno; integración API con plataformas MINEDUC. *(Todo esto era v1 — aparcado, no borrado; §9.)*

## 4. Las dos features (un núcleo: la planificación)

1. **Planificación → documento.** Curso + asignatura + OA → planificación en **el formato del colegio** (`.docx`/`.pdf`). Dos formatos reales soportados, seleccionables:
   - **Formato A — "Planificación de Unidad"** (denso): portada + Propósito + Habilidades S.XXI + Diversificación de la enseñanza (5 columnas) + OA (basal/complementario/transversal) + Experiencias + Evaluación (indicadores, instrumentos, recursos).
   - **Formato B — "Bloque de Actividades"** (DUA, compacto): encabezado + Principios DUA + tabla de 4 columnas por OA (OA priorizado · Habilidades · Experiencias · Evaluación).
2. **Desde la planificación → material de aula:** un **PPT infantil** y una **prueba formativa**, ambos aptos para 6–12 años.

> **Generación híbrida:** los **OA** (texto oficial) y las **listas de checkboxes** son **datos fijos** (currículum/catálogos); la **IA** solo redacta `proposito`, `experiencias/actividades` e `indicadores`, y sugiere qué checkboxes marcar. Todo nace `borrador` y lo revisa el docente.

## 5. Arquitectura (resumen — detalle en `specs/` y en las partes vigentes de `docs/arquitectura-faro.md`)

**Filosofía:** Ports & Adapters (hexagonal). El dominio (currículum/OA, plantillas, generación, validación) es **independiente de frameworks**; los proveedores externos (LLM, export `.docx`/`.pdf`/`.pptx`) son **adaptadores reemplazables**.

**Regla de dependencia (la única que importa):** los `import` apuntan **siempre hacia el dominio**. `infra` y `apps` dependen de `application`/`domain`; nunca al revés.

**Invariantes v2 (testeable — en `specs/README.md` §5):**
1. El dominio se testea **sin red** (validación de schema, "el OA existe", campos requeridos, ítem→OA).
2. La **IA propone; el docente decide** (HIL); la IA nunca aprueba un documento.
3. **Borrador by-design:** todo documento nace `borrador` (`CHECK chk_aprobado_requiere_humano`); `aprobado` exige `autor_humano`.
4. **Currículum versionado** (`corpus_version` inmutable) para reproducibilidad.

**Stack:** monorepo pnpm; Next.js App Router + React + TS `strict`; Postgres + Drizzle; SDK Anthropic / Claude Code; Zod; Vitest; generación asíncrona vía cola + worker. **Sin pgvector / sin RAG en v2.**

> **IMPORTANTE sobre el stack de IA:** antes de fijar IDs de modelo, precios o límites de tokens, **consulta la skill `claude-api`** — no respondas de memoria. IDs vigentes: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`.

## 6. Convenciones (heredan del CLAUDE.md global del usuario)

- **Idioma:** entregables de cara a usuario en **español de Chile**; términos técnicos en inglés donde es estándar.
- **Código:** claridad sobre cleverness. **Sin `any`** salvo justificación. **Sin `console.log`** en producción (logger estructurado de `observability`).
- **Comentarios:** el *por qué* de decisiones no obvias en 1 línea, no el *qué*.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- **No inventes requisitos ni hechos chilenos.** Si algo es ambiguo o falta un dato local, **pregunta** o márcalo `[VERIFICAR: ...]`. Para las plantillas: **no inventes estructuras** que no estén en los PDF reales.
- **DoD:** código + tests, lint/typecheck verdes, sin `any`; si toca IA: schema validado + el contenido nace `borrador` para revisión. Ver `specs/README.md` §4.

## 7. Cómo trabajar en este repo

- **Antes de actuar, clasifica la tarea y delega** según el routing del CLAUDE.md global (explorer/researcher/implementer/tester/reviewer/architect/debugger). Excepción: tareas triviales (1 archivo, <20 líneas, cambio obvio) hazlas directo.
- **Para features:** architect produce plan → revisión con el dueño → implementer → tester → reviewer → commit.
- **Fuentes de verdad (v2):** **mandan `specs/` y este `CLAUDE.md`.** Ante conflicto con `docs/`, recuerda que los `docs/` son v1 (normativo, aparcado). Si detectas contradicción, señálala, no la resuelvas inventando.

## 8. Índice de documentos

**Vigente (v2):**
| Documento | Qué contiene |
|---|---|
| `specs/README.md` | **Mapa de fases v2** + invariantes + alcance. *Punto de entrada del build.* |
| `specs/00-cimientos.md` | Cimientos (construidos). |
| `specs/01-curriculum-oa.md` | **Fase 1:** datos de currículum OA 1º–6º, sin RAG. |
| `specs/02-planificacion.md` | **Fase 2:** núcleo — 2 formatos, híbrido, `.docx`/`.pdf`. |
| `specs/03-ppt-infantil.md` | **Fase 3:** PPT infantil *(stub, espera referencias)*. |
| `specs/04-prueba-formativa.md` | **Fase 4:** prueba formativa *(stub, espera referencias)*. |

**Referencia / vigente parcial:**
| Documento | Estado |
|---|---|
| `docs/arquitectura-faro.md` + ADR-002/003/004 | Hexagonal, persistencia, worker, corpus versionado: **vigentes**. Resto: aparcado. |
| `docs/planificaciones-primera-unidad-{primero,tercero}-basico.pdf` | **Las plantillas reales** (Formato A y B). Fuente de verdad de la estructura de tablas. |
| `docs/bases-curriculares-primera-a-sexto-basico.pdf` | Fuente de los OA (Fase 1). |

**Aparcado (v1 normativo — referencia, no se construye):** `docs/solucion-educacion.md`, `docs/plan-implementacion-faro.md`, `docs/adr-001-recuperacion-rag.md`, `specs/01-nucleo-rag.md`.

## 9. Qué era v1 (aparcado, por si vuelve)

Faro v1 era un **copiloto de cumplimiento normativo** cuyo "foso" eran dos *knowledge graphs* curados (normativa MINEDUC con vigencias; currículum) + RAG + workflow regulado, con 4 módulos: **M0 Aula**, **M3 Normativo** (asistente con citas + auditoría Decreto 67), **M1 PME** (Plan de Mejoramiento Educativo, comprador SLEP/sostenedor), **M2 NEE** (PACI Decreto 83, datos individualizados de menores). v2 conserva solo la cuña de aula (planificación), sin la capa normativa. La documentación v1 queda íntegra en `docs/` (con notas de "aparcado") por si esos módulos se retoman.

## 10. Glosario mínimo (v2)

- **OA** — Objetivo de Aprendizaje (Bases Curriculares): unidad citable del currículum nacional; el **único piso fijo** (lo demás —formato, indicadores— varía por colegio).
- **Básica** — educación básica chilena; el MVP cubre **1º a 6º**.
- **Planificación de Unidad / Bloque** — los dos instrumentos reales que Faro replica (Formato A / Formato B).
- **DUA** — Diseño Universal para el Aprendizaje (3 principios: Representación, Acción y Expresión, Implicación); estructura el Formato B.
- **Indicadores de evaluación** — evidencias observables por OA; viven en los Programas de Estudio (no en las Bases) → en v2 los redacta la IA como borrador.
- **HIL** — human-in-the-loop: revisión docente obligatoria antes de aprobar un documento.
- **Híbrido** — generación que combina **datos fijos** (OA, catálogos) con **redacción de IA** (experiencias, indicadores).
