# Corpus curado de Faro

> **Qué es:** los datos **curados** del currículum nacional (OA) y —más adelante— de la normativa MINEDUC, en formato citable y versionable. Es la materia prima del foso: alimenta (a) el **seed de Fase 0** ([`specs/00-cimientos.md`](../specs/00-cimientos.md) RF-0.5) y (b) el **CLI de ingesta de Fase 1** ([`specs/01-nucleo-rag.md`](../specs/01-nucleo-rag.md) RF-1.1–1.3), que los carga a una `corpus_version` inmutable (ADR-004).
>
> **No se inventa contenido.** Todo proviene de fuentes oficiales **citadas en cada archivo** (las Bases Curriculares del MINEDUC + `curriculumnacional.cl`). Donde falta un dato (p. ej. el decreto que fija la vigencia) se marca `[VERIFICAR]`, no se rellena.

## Estructura

```
corpus/
├── curriculum/         # Objetivos de Aprendizaje (OA) por asignatura/nivel
│   ├── _manifest.json                # índice: 56 bloques, 791 OA
│   ├── matematica-1-basico.json      ✅ curado a mano (20 OA + 10 habilidades, verificado)
│   └── <asignatura>-<nivel>-basico.json   ✅ 55 archivos extraídos del PDF (script, ver abajo)
└── normativa/          # normas MINEDUC — FUERA DE ALCANCE v2 (ver specs/README §0)
    └── decreto-67-2018-art-18.json  🟡 aparcado (normativa no entra en v2)
```

**Cobertura (v2):** las 10 asignaturas de básica × 1º–6º (Inglés solo 5º–6º, como en el currículum) = **56 bloques, 791 OA**. Generado por `scripts/curriculum/extract_oa.py` (pdfplumber, extracción por coordenadas) y **validado contra el oráculo** (Matemática 1º reproduce los 20 OA exactos). Re-generar: `python scripts/curriculum/extract_oa.py`.

## Procedencia (cómo se generó)

- **Texto autoritativo:** `docs/bases-curriculares-primera-a-sexto-basico.pdf` (Bases Curriculares 1º a 6º Básico, MINEDUC), 414 págs., organizado **asignatura → nivel → eje → OA** (los OA van numerados `1..n` por asignatura/nivel, agrupados por eje; hay una página de **Habilidades** `a–j` por nivel). Extraído con `pdfplumber` y verificado a mano.
- **Código citable:** `https://www.curriculumnacional.cl/curriculum/1o-6o-basico/matematica/1-basico`. La codificación `MA01 OA 01` (`MA`=Matemática, `01`=1º básico, `OA`, `01`=número del objetivo) **no** aparece en las Bases (PDF); es la convención de `curriculumnacional.cl` y se reconstruye desde asignatura+nivel+número.

## Convenciones

- **Mapeo a la entidad `objetivo_aprendizaje`** (blueprint §5.3): `codigo`, `asignatura`, `nivel`, `descripcion`, `indicadores`. Cada archivo JSON es consumible 1:1 por la ingesta.
- **`indicadores`:** vacíos por ahora. Los indicadores de evaluación por OA viven en los **Programas de Estudio** (documento distinto a las Bases Curriculares) y no se incluyen aún. `[VERIFICAR: si la generación de pruebas los requiere, conseguir los Programas de Estudio de la asignatura/nivel.]`
- **`vigencia`:** `[VERIFICAR]` el decreto y la fecha que aprueban estas Bases Curriculares antes de fijar `vigencia_desde` (no se inventa la norma).
- **Citas:** la unidad citable del currículum es el **OA** (glosario CLAUDE.md §10). El `codigo` es la referencia canónica.

## Estado y pendientes

- ✅ **Currículum OA completo (Fase 1)** — 56 bloques / 791 OA, 1º–6º, todas las asignaturas. Extraído del PDF y validado (Matemática 1º = 20/20 vs oráculo).
- 🟡 **OA con extracción dudosa** (5 de 791, ~0.6%) — marcados `"revision": "[VERIFICAR…]"` en el JSON (layout a 2 columnas/notas): `CN02 OA 09`, `LE03 OA 28`, `LE04 OA 27`, `LE06 OA 24`, `MA03 OA 08`. Además 2 OA sin `eje` (`HI06 OA 01`, `IN06 OA 01`). Revisar a mano contra el PDF (no se inventan).
- ⬜ **Habilidades por asignatura** (`a–j`) — solo extraídas en el `matematica-1-basico.json` curado a mano; el resto trae solo OA (suficiente para v2). Extraerlas es mejora futura.
- ⬜ **Indicadores** — vacíos (viven en los Programas de Estudio). En v2 los redacta la IA como `ia_borrador` (decisión híbrida; ver `specs/02-planificacion.md`).
- ⏸️ **Normativa** (Decreto 67/83, reglamentos, 6 planes) — **fuera de alcance v2** (aparcado; ver `specs/README.md §0`).
