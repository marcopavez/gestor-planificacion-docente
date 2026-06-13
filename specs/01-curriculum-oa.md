# Fase 1 — Datos de currículum: OA de 1º–6º básico (todas las asignaturas), sin RAG

> **✅ FASE COMPLETA (2026-06-07).** El corpus está poblado para **todas las asignaturas de las Bases Curriculares**: 56 bloques / 791 OA (1º–6º; Inglés solo 5º–6º) + 32 OAT, `corpus_version 2026.1`, con test de integridad (`packages/infra-corpus/src/integridad.test.ts`). Extraído con `scripts/curriculum/extract_oa.py` (pdfplumber) y validado contra oráculo. ~0.9% de OA marcados `[VERIFICAR]` por layout del PDF (no inventados). Lo que sigue abajo es el contrato original de la fase, conservado como referencia.
>
> **Spec de desarrollo v2** · Reemplaza a [`01-nucleo-rag.md`](./01-nucleo-rag.md) (aparcada).
> **Deriva de:** la decisión del dueño (2026-06-07) de **eliminar RAG/normativa**; `docs/bases-curriculares-primera-a-sexto-basico.pdf` como fuente; el corpus curado en `corpus/curriculum/`; ADR-004 (corpus versionado).
> **Lee primero:** [`README.md`](./README.md) (§0 cambio de alcance, invariantes), [`00-cimientos.md`](./00-cimientos.md).

---

## 1. Contexto y objetivo

El **único "conocimiento"** de Faro v2 es el **currículum nacional**: los Objetivos de Aprendizaje (OA) de las Bases Curriculares. No es búsqueda semántica: es un **catálogo estructurado** que se consulta de forma **determinista** por `(asignatura, nivel)`.

**Objetivo:** disponer del currículum OA de **1º a 6º básico, para todas las asignaturas de las Bases Curriculares**, como **JSON versionado** en `corpus/curriculum/`, cargable por el dominio a través del puerto `OaRepository` ya existente, de modo que la Fase 2 pueda, dado `(asignatura, nivel)`, ofrecer al docente los OA reales para seleccionar — **sin inventar ningún OA**.

### 1.1 Por qué NO RAG
El currículum es un conjunto **cerrado y estructurado** (asignatura → nivel → lista finita de OA con código y texto oficial). La selección correcta es una **consulta por clave**, no una recuperación por similitud. RAG/pgvector aquí sería sobre-ingeniería (decisión del dueño, README §0).

### 1.2 Decisiones confirmadas
- **Fuente única:** `docs/bases-curriculares-primera-a-sexto-basico.pdf` (Bases Curriculares 1º–6º). Extracción con **python + pdfplumber** (workflow de extracción ya establecido en el repo).
- **Indicadores:** **no** vienen en las Bases (viven en los Programas de Estudio). En v2 se dejan **vacíos** en el corpus; la Fase 2 los redacta con IA (`ia_borrador`) por la decisión **híbrida**. Si el dueño aporta el Programa de Estudio de una asignatura/nivel, se incorporan los oficiales.
- **Versionado:** cada publicación del corpus es una `corpus_version` inmutable (ADR-004), referenciada por las generaciones.

---

## 2. Alcance

### 2.1 Entra
- **Extracción + curación** de los OA de las Bases Curriculares para 1º–6º básico, **todas las asignaturas** (Lenguaje, Matemática, Cs. Naturales, Historia/Geografía y Cs. Sociales, Artes Visuales, Música, Ed. Física y Salud, Tecnología, Orientación; Inglés 5º–6º) + OAT.
- **Formato canónico** `corpus/curriculum/<asignatura>-<nivel>.json` (mismo esquema que el sample de Matemática 1º ya curado).
- **Carga determinista** vía `OaRepository.porAsignaturaNivel(asignatura, nivel)` → `ObjetivoAprendizaje[]`.
- **Versionado** del corpus (`corpus_version`) + un manifiesto que lista qué asignatura/nivel está disponible.
- **Validación** de que cada archivo cumple el schema (códigos OA con formato, sin duplicados, texto no vacío).

### 2.2 NO entra (deferido / fuera de v2)
| Deferido | A dónde |
|---|---|
| Indicadores oficiales (Programas de Estudio) | Cuando el dueño aporte el Programa; mientras, IA en Fase 2 |
| Priorización curricular oficial / OA priorizados MINEDUC | `[VERIFICAR]`; iteración posterior |
| Normativa (Decreto 67/83), grafo, RAG, embeddings | **Fuera de v2** (aparcado) |
| Currículum de 7º básico en adelante (media) | Fuera de v2 (v2 = básica 1º–6º) |

---

## 3. Requisitos funcionales (RF-1.n)

- **RF-1.1 · Esquema canónico del corpus.** Cada `corpus/curriculum/<asignatura>-<nivel>.json` tiene: `asignatura`, `nivel`, `corpus_version`, y `oa: [{ codigo, descripcion, eje?, habilidades?, indicadores: [] }]`. El código OA conserva la nomenclatura oficial (p. ej. `MA01 OA 03`). *(Sample existente)*
- **RF-1.2 · Cobertura del currículum.** Existe un archivo por cada `(asignatura, nivel)`, 1º a 6º, para **todas las asignaturas de las Bases**. Un **manifiesto** (`corpus/curriculum/_manifest.json`) enumera lo disponible y su `corpus_version`. *(Decisión dueño: todas las asignaturas — ✅ cumplido: 56 bloques)*
- **RF-1.3 · Extracción trazable, sin invención.** Los OA se extraen del PDF de Bases con python+pdfplumber; cada archivo registra su procedencia. Ningún OA se redacta a mano: si la extracción es dudosa, se marca `[VERIFICAR]`, no se inventa. *(Convención del dueño: no inventar hechos chilenos)*
- **RF-1.4 · Carga por el puerto de dominio.** `OaRepository.porAsignaturaNivel(asignatura, nivel)` devuelve los OA del archivo correspondiente; error tipado si no existe esa combinación. Determinista, testeable sin red. *(INV-1)*
- **RF-1.5 · Versionado inmutable.** Publicar el corpus sella una `corpus_version`; las generaciones (Fase 2) referencian la versión vista. Re-extraer ⇒ nueva versión, no mutación. *(ADR-004, INV-4)*
- **RF-1.6 · Validación de integridad.** Un script/test valida cada archivo: schema correcto, códigos OA únicos y bien formados, `nivel`/`asignatura` consistentes con el nombre del archivo, `indicadores` vacío permitido. *(INV-1)*

---

## 4. Diseño técnico + contratos

### 4.1 Estructura de archivos
```
corpus/curriculum/
  _manifest.json                  # { corpus_version, disponibles: [{asignatura, nivel, archivo}] }
  matematica-1-basico.json        # ya existe
  lenguaje-1-basico.json
  ciencias-naturales-1-basico.json
  ... (asignatura × nivel)
```

### 4.2 Schema (TS/Zod, en `packages/domain`)
```ts
// ObjetivoAprendizaje: ya modelado en domain. Forma del corpus (alineada al sample real):
const ObjetivoAprendizajeSchema = z.object({
  codigo: z.string(),                 // "MA01 OA 03" — nomenclatura oficial
  descripcion: z.string().min(1),     // texto oficial del OA
  eje: z.string().optional(),         // eje curricular, si la asignatura lo define
  habilidades: z.array(z.string()).default([]),
  indicadores: z.array(IndicadorSchema).default([]),  // vacío en v2 (se llena en Fase 2)
})

const CorpusAsignaturaNivelSchema = z.object({
  asignatura: z.string(),
  nivel: z.string(),                  // "1º básico" … "6º básico"
  corpus_version: z.string(),
  oa: z.array(ObjetivoAprendizajeSchema).min(1),
})
```

### 4.3 Puerto (ya existe en `domain/ports`)
```ts
interface OaRepository {
  porAsignaturaNivel(asignatura: string, nivel: string): Promise<ObjetivoAprendizaje[]>
  // implementación v2: lee el JSON del corpus (no DB obligatoria para el catálogo).
}
```

### 4.4 Pipeline de extracción (`apps/ingest`)
1. `pdfplumber` sobre el PDF de Bases → texto/tablas por asignatura/nivel.
2. Parser por asignatura (los códigos OA siguen patrones por asignatura: `MA`, `LE`, `CN`, `HI`, …).
3. Salida a `corpus/curriculum/<asignatura>-<nivel>.json` + actualización del manifiesto.
4. Validación (RF-1.6) antes de sellar la `corpus_version`.

---

## 5. Historias → tareas

- **H-1.1** `chore(ingest): extractor pdfplumber de Bases Curriculares` — script que vuelca texto/tablas por asignatura/nivel.
- **H-1.2** `feat(ingest): parser OA por asignatura → corpus/curriculum/*.json` — un parser por familia de códigos.
- **H-1.3** `feat(domain): validación de corpus + manifiesto + corpus_version` — schema + test de integridad.
- **H-1.4** `feat(infra): OaRepository sobre JSON del corpus` — carga determinista por `(asignatura, nivel)`.
- **H-1.5** `chore(corpus): poblar 1º–6º para todas las asignaturas de las Bases` — datos (iterativo por asignatura). ✅ hecho (56 bloques / 791 OA).

---

## 6. Criterios de aceptación (CA-1.n)

- **CA-1.1** Para cada `(asignatura, nivel)` del currículum existe un JSON válido que pasa la validación de integridad.
- **CA-1.2** `OaRepository.porAsignaturaNivel("Matemática", "1º básico")` devuelve los OA reales del archivo, y `("Inglés","6º básico")` (si no curado aún) devuelve un error tipado claro.
- **CA-1.3** Ningún OA fue redactado a mano: trazabilidad al PDF en cada archivo; lo dudoso está marcado `[VERIFICAR]`.
- **CA-1.4** Re-extraer produce una `corpus_version` nueva; las versiones previas siguen accesibles.

---

## 7. Plan de pruebas

- **Unit (domain):** validación de schema; integridad de códigos/duplicados; error tipado en combinación inexistente. Sin red.
- **Integración (ingest):** sobre un subset del PDF real, el parser produce un JSON que valida.
- **Cobertura de datos:** test que recorre el manifiesto y valida todos los archivos disponibles.

---

## 8. DoD + invariantes

DoD global (README §4) + : todos los archivos del manifiesto validan; `OaRepository` testeado sin red (**INV-1**); corpus sellado como `corpus_version` inmutable (**INV-4**); carga vía puerto (**INV-5/6**). Sin `any`, sin `console.log`.

---

## 9. Riesgos y preguntas abiertas

- **#4 (README):** lista exacta de asignaturas — ✅ **resuelto: todas las de las Bases Curriculares** (ver banner de estado al inicio).
- **Calidad de extracción del PDF:** las tablas de las Bases pueden requerir parsers por asignatura; presupuestar curación manual de revisión (no de redacción).
- **Indicadores:** ausentes a propósito en v2; si el dueño prioriza fidelidad, conseguir los Programas de Estudio convierte los indicadores `ia_borrador` en oficiales (mejora de Fase 2, no bloquea).
