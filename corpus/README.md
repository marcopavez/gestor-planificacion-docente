# Corpus curado de Faro

> **Qué es:** los datos **curados** del currículum nacional (OA) y —más adelante— de la normativa MINEDUC, en formato citable y versionable. Es la materia prima del foso: alimenta (a) el **seed de Fase 0** ([`specs/00-cimientos.md`](../specs/00-cimientos.md) RF-0.5) y (b) el **CLI de ingesta de Fase 1** ([`specs/01-nucleo-rag.md`](../specs/01-nucleo-rag.md) RF-1.1–1.3), que los carga a una `corpus_version` inmutable (ADR-004).
>
> **No se inventa contenido.** Todo proviene de fuentes oficiales **citadas en cada archivo** (las Bases Curriculares del MINEDUC + `curriculumnacional.cl`). Donde falta un dato (p. ej. el decreto que fija la vigencia) se marca `[VERIFICAR]`, no se rellena.

## Estructura

```
corpus/
├── curriculum/         # Objetivos de Aprendizaje (OA) por asignatura/nivel
│   └── matematica-1-basico.json     ✅ curado (20 OA, verificado contra el PDF)
└── normativa/          # normas MINEDUC (artículos citables)
    └── decreto-67-2018-art-18.json  🟡 curado (16 literales a–p · pendiente validación del dueño)
```

## Procedencia (cómo se generó)

- **Texto autoritativo:** `docs/bases-curriculares-primera-a-sexto-basico.pdf` (Bases Curriculares 1º a 6º Básico, MINEDUC), 414 págs., organizado **asignatura → nivel → eje → OA** (los OA van numerados `1..n` por asignatura/nivel, agrupados por eje; hay una página de **Habilidades** `a–j` por nivel). Extraído con `pdfplumber` y verificado a mano.
- **Código citable:** `https://www.curriculumnacional.cl/curriculum/1o-6o-basico/matematica/1-basico`. La codificación `MA01 OA 01` (`MA`=Matemática, `01`=1º básico, `OA`, `01`=número del objetivo) **no** aparece en las Bases (PDF); es la convención de `curriculumnacional.cl` y se reconstruye desde asignatura+nivel+número.

## Convenciones

- **Mapeo a la entidad `objetivo_aprendizaje`** (blueprint §5.3): `codigo`, `asignatura`, `nivel`, `descripcion`, `indicadores`. Cada archivo JSON es consumible 1:1 por la ingesta.
- **`indicadores`:** vacíos por ahora. Los indicadores de evaluación por OA viven en los **Programas de Estudio** (documento distinto a las Bases Curriculares) y no se incluyen aún. `[VERIFICAR: si la generación de pruebas los requiere, conseguir los Programas de Estudio de la asignatura/nivel.]`
- **`vigencia`:** `[VERIFICAR]` el decreto y la fecha que aprueban estas Bases Curriculares antes de fijar `vigencia_desde` (no se inventa la norma).
- **Citas:** la unidad citable del currículum es el **OA** (glosario CLAUDE.md §10). El `codigo` es la referencia canónica.

## Estado y pendientes

- ✅ **Matemática 1º básico** — 20 OA + 10 habilidades, verificado contra el PDF. Suficiente para el **seed mínimo de Fase 0** (RF-0.5 pide 2–3 OA reales).
- ⬜ **Resto del currículum** (otras asignaturas/niveles del PDF) — se cura durante la **Fase 1** (ingesta completa). El PDF tiene todo 1º–6º.
- 🟡 **Decreto 67/2018 art. 18** — curado (16 literales a–p, texto oficial BCN/MINEDUC `idNorma=1127255`). **Pendiente de validación del dueño** antes de usarse como fuente de citas (CLAUDE.md: no inventar normas chilenas).
- ⬜ **Reglamento de evaluación real** — falta, para completar el seed de Fase 0 (RF-0.5). Es un documento de un colegio: lo aporta el dueño.
- ⬜ **Decreto 83 + los 6 planes** — se curan en la ingesta de Fase 1.
