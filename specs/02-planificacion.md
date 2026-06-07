# Fase 2 — Núcleo: generar la planificación en 2 formatos reales (.docx + .pdf), generación híbrida

> **Spec de desarrollo v2** · **Reemplaza** a `02-aula-cascada.md` (retirada). Desacopla la cascada de Aula de toda la capa normativa/RAG de v1.
> **Deriva de:** los **PDF reales** `docs/planificaciones-primera-unidad-primero-basico.pdf` (Formato A) y `docs/planificaciones-primera-unidad-tercero-basico.pdf` (Formato B); el corpus OA de [`01-curriculum-oa.md`](./01-curriculum-oa.md); el schema y la cascada ya construidos; decisiones del dueño (2026-06-07).
> **Lee primero:** [`README.md`](./README.md) (§0 alcance v2, invariantes), [`00-cimientos.md`](./00-cimientos.md), [`01-curriculum-oa.md`](./01-curriculum-oa.md).

---

## 1. Contexto y objetivo

**Objetivo:** que un docente, eligiendo **curso + asignatura + OA** y la **plantilla de su colegio**, obtenga su **planificación** como documento **`.docx` + `.pdf`** que **calca la estructura de tablas** de la plantilla real — generada de forma **híbrida** (datos fijos del currículum + redacción de IA), nacida `borrador` y revisable (HIL).

### 1.1 Dos formatos reales, ambos del mismo colegio (Esc. General José Alejandro Bernales D-114)
El dueño confirmó (2026-06-07) **soportar ambos**, seleccionables por colegio/docente. Son instrumentos distintos:

**Formato A — "Planificación de Unidad"** (PDF 1º básico, horizontal · denso · ~4 páginas por asignatura). Secciones, en orden:
1. **Encabezado:** Establecimiento · Docente · Curso · Asignatura · Duración (semanas) · Horas Pedagógicas · Fecha inicio · Fecha término.
2. **Propósito de la unidad** (¿para qué aprenderán?).
3. **Habilidades del Siglo XXI** (set de checkboxes).
4. **Diversificación de la Enseñanza** — matriz de **5 columnas** de checkboxes: *Metodologías Activas · Estrategias de enseñanza para aprendizajes profundos · Micropracticas · Estrategias de evaluación Formativa · Estrategias de evaluación Sumativa*.
5. **Objetivos de Aprendizaje:** OA **Basal** · OA **Complementarios** · OA **Transversales** (código + texto).
6. **Experiencia de Aprendizaje / Actividades** (lista).
7. **Evaluación:** *Tipo de aprendizaje a evaluar* (Conceptual/Procedimental/Actitudinal) · **Indicadores de evaluación** · *Tipo de evaluación* (Diagnóstica/Formativa/Sumativa) · **Instrumentos** (Rúbrica, Prueba escrita/oral, Lista de cotejo, Escala de apreciación) · **Recursos/Espacios**.

**Formato B — "Planificación: Bloque de Actividades"** (PDF 3º básico, vertical · enfoque DUA · ~1 página por asignatura). Secciones:
1. **Encabezado:** Establecimiento · Docente · Curso · Asignatura · Unidad · Período.
2. **Principios DUA** (1 Representación · 2 Acción y Expresión · 3 Implicación).
3. **Tabla de 4 columnas, una fila por OA:** **Objetivo de Aprendizaje Priorizado · Habilidades · Experiencias de Aprendizaje/Actividades · Evaluación** (Formativa/Sumativa).

> **Regla del dueño:** *no inventar estructuras nuevas.* El render debe **calcar** estas tablas; cualquier sección que no esté en el PDF no va.

### 1.2 Generación híbrida (decisión del dueño)
| Origen | Campos |
|---|---|
| **Datos fijos** (no los toca la IA) | OA (código + texto, desde el corpus de Fase 1); las **listas de checkboxes** (Habilidades S.XXI, Metodologías, Micropracticas, Instrumentos, Recursos, Principios DUA, Tipo de aprendizaje) como **catálogos de referencia**; encabezado (curso/asignatura/duración) = input del docente. |
| **IA (borrador)** | `proposito`, `experiencias/actividades`, `indicadores_evaluacion`, y la **selección sugerida** de checkboxes (qué metodologías/instrumentos marcar para esos OA). Todo nace `ia_borrador` y lo revisa el docente. |

### 1.3 Qué se recicla (ya construido)
Schemas `PlanificacionUnidad`/`PlanificacionClase` (en `packages/domain/src/schemas`), la cascada de use cases (`packages/application/src/aula/cascada`), persistencia + worker + HIL + `traza_ia`, y `PptxExportAdapter` (Fase 3 lo reusa). Esta fase **ajusta** el schema a superset de A+B y **añade** `DocxExportAdapter` y `PdfExportAdapter`.

---

## 2. Alcance

### 2.1 Entra
- **Catálogo de plantillas configurable** con **2 presets reales** (Bernales Formato A y Formato B), data-driven (secciones → campos → catálogos).
- **Schema `PlanificacionUnidad` superset** de A y B, con `plantilla: 'A' | 'B'` y `extras` para los campos school-specific.
- **Generador híbrido** (`GenerarPlanificacionUseCase`): carga OA del corpus (datos fijos), pide a la IA `proposito`/`experiencias`/`indicadores`/selección de checkboxes, ensambla según la plantilla activa.
- **Export `.docx`** (`DocxExportAdapter`) y **`.pdf`** (`PdfExportAdapter`) que **calcan las tablas** del formato seleccionado.
- **Validaciones deterministas** (gates v2, sin normativa): OA existe en el corpus; campos `requerido` de la plantilla presentes; cada OA basal tiene ≥1 experiencia/indicador.
- **HIL:** `borrador → en_revision → aprobado/rechazado`; edición; `traza_ia`.
- **Catálogos de referencia** (los sets de checkboxes) como datos versionados, no hardcode disperso.

### 2.2 NO entra (deferido / fuera de v2)
| Deferido | A dónde |
|---|---|
| PPT infantil | [`03-ppt-infantil.md`](./03-ppt-infantil.md) |
| Prueba formativa | [`04-prueba-formativa.md`](./04-prueba-formativa.md) |
| Subir-e-inferir la plantilla desde un Word/PDF del colegio (OCR de tablas) | Iteración posterior |
| Theming visual fino (logo, tipografías, colores del colegio) | Iteración posterior (v2 entrega la estructura de tablas fiel) |
| Indicadores **oficiales** (Programas de Estudio) | Cuando el dueño los aporte; en v2 son `ia_borrador` |
| Normativa, Decreto 67/83, citas legales, RAG | **Fuera de v2** (aparcado) |

---

## 3. Requisitos funcionales (RF-2.n)

**Plantillas**
- **RF-2.1 · Plantilla data-driven.** Existe `PlantillaPlanificacion` con `definicion` (secciones → campos; cada campo: `clave`, `etiqueta`, `tipo`, `requerido`, `origen` (`fijo|input|ia`), `catalogo?`, `orden`). El dominio valida la plantilla con tipos puros.
- **RF-2.2 · Dos presets reales.** El seed crea **Formato A** (Bernales 1º, denso) y **Formato B** (Bernales 3º, DUA), reconstruidos **fielmente** de los PDF reales — **sin inventar campos**.
- **RF-2.3 · Selección y edición por establecimiento.** Un colegio activa un preset, lo clona y edita (agregar/quitar/renombrar/`requerido`). La plantilla activa por `(establecimiento, formato)` gobierna generación y export.

**Schema y generación híbrida**
- **RF-2.4 · Schema superset A+B.** `PlanificacionUnidad` (Zod) cubre los campos de ambos formatos: núcleo (`establecimiento, asignatura, nivel, unidad, oa[], experiencias/actividades, indicadores_evaluacion, evaluacion`) + `plantilla` + `extras` (habilidades S.XXI, metodologías, micropracticas, principios DUA, tipo de aprendizaje, instrumentos, recursos). Los constraints de cobertura **no** van en el schema (van en gates).
- **RF-2.5 · Datos fijos desde el corpus.** Los OA (código + texto) provienen de `OaRepository.porAsignaturaNivel` (Fase 1); la IA **no** los redacta ni altera. *(Híbrido — datos fijos)*
- **RF-2.6 · Catálogos de checkboxes fijos.** Habilidades S.XXI, Metodologías Activas, Micropracticas, Instrumentos, Recursos, Principios DUA y Tipo de aprendizaje son **catálogos de referencia** (datos), reproducidos de los PDF. La IA solo **marca** opciones; no agrega opciones nuevas. *(Híbrido — datos fijos)*
- **RF-2.7 · IA redacta el contenido pedagógico.** `GenerarPlanificacionUseCase` pide al `LlmPort` (schema Zod validado): `proposito`, `experiencias/actividades` (≥1 por OA basal), `indicadores_evaluacion` (`fuente: ia_borrador`), y la selección sugerida de checkboxes. *(Híbrido — IA)*
- **RF-2.8 · Ensamblaje según plantilla.** El use case ensambla la `PlanificacionUnidad` cumpliendo la **plantilla activa**: todos los campos `requerido` presentes; los `origen: fijo` tomados de datos; los `origen: ia` del LLM; los `origen: input` del docente.

**Export**
- **RF-2.9 · Export `.docx` calcando tablas.** `DocxExportAdapter` renderiza la planificación al **layout exacto** del formato (A: bloque de ~4 páginas por asignatura con sus tablas; B: tabla de 4 columnas por OA). Editable por el docente. *(Salida: ambos — decisión dueño)*
- **RF-2.10 · Export `.pdf`.** `PdfExportAdapter` produce el mismo layout en PDF (solo lectura/impresión). *(Salida: ambos)*
- **RF-2.11 · Fidelidad de estructura.** El documento exportado **no** contiene secciones que no existan en el PDF de referencia del formato (regla "no inventar estructuras"). Verificable por inspección de secciones.

**Gates v2, persistencia, HIL**
- **RF-2.12 · Validaciones deterministas (sin normativa).** Bloquea: campo `requerido` ausente; OA referenciado inexistente en `(asignatura, nivel)`/`corpus_version`; OA basal sin ninguna experiencia/indicador. Marca (no bloquea): calidad pedagógica de las experiencias (IA, advisory). *(INV-1, INV-2)*
- **RF-2.13 · Nace `borrador` + `traza_ia`.** Toda planificación nace `borrador` (INV-3, `CHECK chk_aprobado_requiere_humano`) con `traza_ia` (`corpus_version_id`, modelo, prompt/usage, campos generados). *(INV-3, INV-4)*
- **RF-2.14 · Generación asíncrona.** `POST` crea `documento_generado(planificacion_unidad, borrador, encolado)` + job; el worker genera y valida; `GET` hace poll del estado. *(ADR-003)*
- **RF-2.15 · HIL.** `borrador → en_revision → aprobado` (requiere `autor_humano`) `/ rechazado`; el docente edita cualquier campo (incluidos los `ia_borrador`) antes de aprobar; re-export `.docx`/`.pdf` tras editar. *(INV-3)*

---

## 4. Diseño técnico + contratos

### 4.1 Encaje
Composición de use cases sobre puertos existentes. Reusa `LlmPort`, `OaRepository`, `DocumentoRepository`, `TrazaRepository`, `JobRepository`, worker, gates de `domain`. Agrega `PlantillaRepository`, `ExportPort` con `DocxExportAdapter`/`PdfExportAdapter`, `GenerarPlanificacionUseCase` y las validaciones v2. **Regla de dependencia intacta** (INV-5).

### 4.2 Schema (forma real — alineado al sample `samples/aula-matematica-1b/planificacion-unidad.json`)
```ts
const PlanificacionUnidadSchema = z.object({
  plantilla: z.enum(['A', 'B']),
  establecimiento: z.string(),
  docente: z.string().optional(),
  asignatura: z.string(),
  nivel: z.string(),                       // "1º básico" … "6º básico"
  unidad: z.string(),
  // Formato A:
  proposito: z.string().optional(),
  duracion_semanas: z.number().int().positive().optional(),
  horas_pedagogicas: z.number().int().positive().optional(),
  // Formato B:
  periodo: z.string().optional(),
  // Comunes:
  oa: z.array(z.object({
    codigo: z.string(), categoria: z.enum(['basal','complementario','transversal','priorizado']),
    descripcion: z.string(), habilidades: z.array(z.string()).default([]),
  })).min(1),
  experiencias: z.array(z.string()).default([]),         // IA borrador
  indicadores_evaluacion: z.array(z.object({
    oa: z.string(), texto: z.string(), fuente: z.enum(['oficial','ia_borrador']),
  })).default([]),                                        // IA borrador en v2
  evaluacion: z.object({
    tipo: z.array(z.enum(['diagnostica','formativa','sumativa'])).default([]),
    instrumentos: z.array(z.string()).default([]),        // catálogo fijo
  }),
  extras: z.record(z.unknown()).default({}),              // habilidades_siglo_xxi, metodologias_activas,
})                                                        // micropracticas, principios_dua, tipo_aprendizaje, recursos
```

### 4.3 Catálogos de referencia (datos fijos, reproducidos de los PDF)
`corpus/catalogos/planificacion.json` — sets cerrados: `habilidades_siglo_xxi`, `metodologias_activas`, `estrategias_ensenanza`, `micropracticas`, `estrategias_eval_formativa`, `estrategias_eval_sumativa`, `instrumentos_evaluacion`, `recursos_espacios`, `principios_dua`, `tipo_aprendizaje`. La IA elige de estos sets; **no** los amplía.

### 4.4 Export
```ts
interface ExportPort {
  aDocx(plan: PlanificacionUnidad, plantilla: PlantillaPlanificacion): Promise<ArchivoExportado>
  aPdf(plan: PlanificacionUnidad, plantilla: PlantillaPlanificacion): Promise<ArchivoExportado>
}
```
- `.docx`: librería de generación de Word con **tablas** (p. ej. `docx`); el layout se deriva de la `definicion` de la plantilla → mapeo 1:1 a las tablas del PDF.
- `.pdf`: render del mismo layout (HTML/plantilla → PDF, o el `.docx` → PDF). `[VERIFICAR]` motor de PDF en §9.

---

## 5. Historias → tareas

- **H-2.1** `feat(domain): schema PlanificacionUnidad superset A+B + catálogos` .
- **H-2.2** `feat(domain): PlantillaPlanificacion data-driven + 2 presets reales (A, B)` .
- **H-2.3** `feat(application): GenerarPlanificacionUseCase (híbrido datos+IA)` .
- **H-2.4** `feat(domain): validaciones v2 (OA existe, requeridos, cobertura)` .
- **H-2.5** `feat(infra-export): DocxExportAdapter (calca tablas A y B)` .
- **H-2.6** `feat(infra-export): PdfExportAdapter` .
- **H-2.7** `feat(web): seleccionar formato/plantilla + curso/asignatura/OA → generar → revisar (HIL) → exportar` .

---

## 6. Criterios de aceptación (CA-2.n)

- **CA-2.1** Generar para *(Matemática, 1º básico, Formato A)* produce un `.docx` y un `.pdf` cuyas secciones y tablas **coinciden** con el PDF de referencia A (mismas secciones, mismo orden, sin secciones inventadas).
- **CA-2.2** Generar para *(Lenguaje, 3º básico, Formato B)* produce la tabla de **4 columnas por OA** (Formato B).
- **CA-2.3** Los OA del documento son **idénticos** a los del corpus (código + texto); la IA solo redactó `proposito`/`experiencias`/`indicadores` y marcó checkboxes.
- **CA-2.4** Un OA referenciado que no existe en el corpus **bloquea** la generación con error claro.
- **CA-2.5** El documento nace `borrador`; pasa a `aprobado` solo con `autor_humano`; editar un campo `ia_borrador` y re-exportar refleja el cambio.

---

## 7. Plan de pruebas

- **Unit (domain):** schema A/B; validaciones (OA existe, requeridos, cobertura); catálogos cerrados. Sin red.
- **Unit (infra-export):** el `.docx`/`.pdf` generado contiene exactamente las secciones/tablas del formato (assert sobre estructura), tamaño > 0.
- **Integración (application):** `GenerarPlanificacionUseCase` con `FakeLlm` (datos fijos reales + IA simulada) produce una planificación que valida y cubre los OA basales.
- **e2e (web):** seleccionar formato → generar → editar `ia_borrador` → aprobar → exportar `.docx`+`.pdf`.

---

## 8. DoD + invariantes

DoD global (README §4) + : ambos formatos exportan `.docx` y `.pdf` fieles a los PDF (RF-2.9/10/11); generación híbrida con datos fijos intactos (RF-2.5/6); nace `borrador` + `traza_ia` (INV-3/4); validaciones sin red (INV-1); regla de dependencia (INV-5); export tras puerto (INV-6). Sin `any`, sin `console.log`.

---

## 9. Riesgos y preguntas abiertas

- **Motor de PDF** `[VERIFICAR]`: `.docx`→PDF (LibreOffice headless) vs HTML→PDF (Puppeteer/`@react-pdf`). Elegir en H-2.6 según fidelidad/peso de dependencia.
- **Fidelidad de tablas en `.docx`:** las matrices densas del Formato A (5 columnas de checkboxes) requieren cuidado de layout; presupuestar iteración visual.
- **Catálogos:** reproducir los sets de checkboxes **exactamente** como en los PDF (no traducir ni resumir); fuente = los dos PDF reales.
- **Indicadores `ia_borrador`:** si el dueño exige fidelidad oficial, conseguir los Programas de Estudio (mejora, no bloquea).
