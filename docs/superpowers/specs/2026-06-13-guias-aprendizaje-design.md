# Guías de trabajo del alumno — diseño (Fase 6, v2)

> Estado: **aprobado para implementar** (brainstorming 2026-06-13).
> Patrón de referencia: artefacto **hermano** de la prueba formativa (Fase 4) y el PPT infantil (Fase 3).

## 0. Resumen en una frase

Un **nuevo output**: dado un **OA**, generar **guías de trabajo para el alumno** (worksheets de práctica) ancladas al OA — una por cada **conocimiento** del OA, o una sobre un **tema** que ingrese el docente. Texto-céntrica, tramo **3º–6º**. Híbrido (datos fijos del OA + redacción IA), nace **borrador** para revisión docente (HIL).

## 1. Por qué / valor

Potencia el material de aula reutilizando el mismo motor a **costo marginal trivial** (~$0.05–0.08 por guía, ver §9). Cierra el ciclo del docente: del OA no solo salen planificación, prueba y PPT, sino también **guías de práctica** que el alumno desarrolla.

## 2. Decisiones del brainstorming (fijadas)

1. **Fuente de los conocimientos:** la **IA descompone el OA al vuelo** (borrador). No se reusa la planificación ni se ingieren Programas de Estudio. → La guía es **standalone desde un OA**, no depende de una planificación previa (a diferencia de prueba/PPT).
2. **Qué es la guía:** **guía de trabajo del ALUMNO** (6–12), para aprender/practicar (NO para calificar). Un solo entregable (sin hoja-pauta separada).
3. **Tramo:** **3º–6º primero** (texto-céntrico: lectura, comprensión, ejercicios, problemas; imágenes de apoyo opcionales). **1º–2º se difiere** hasta resolver imágenes reales (ver §10).
4. **Enfoque:** artefacto hermano que **reusa el motor de prueba**, construido en **dos tandas** (manual → auto-descomposición).

## 3. Por qué 3º–6º y no 1º–2º (hallazgo de diseño)

Las guías reales de 1º–2º (refs en `docs/pruebas/guias/`) son **~90% imágenes**: unir con líneas, colorear, marcar dibujos, con una sola consigna de texto. El pipeline hoy **describe** imágenes (placeholders), no las **dibuja** (filosofía «imagen = descripción, nunca una imagen real»). Por eso una guía fiel de 1º–2º es el artefacto más difícil de generar bien. En 3º–6º domina el **texto**, que el pipeline ya genera con calidad (como la prueba). 1º–2º se retoma cuando exista solución de imágenes (banco de imágenes).

## 4. Alcance

### Entra
- Artefacto `guia`: guía de trabajo del alumno, tramo 3º–6º.
- **Modo manual** (tanda 1): OA + tema/conocimiento escrito por el docente → 1 guía.
- **Modo auto** (tanda 2): IA descompone el OA en conocimientos → docente **elige cuáles** (HIL) → 1 guía por elegido.
- Export `.docx` (alumno) + `.pdf` (vía soffice, como la prueba).
- Cableado web/worker/UI (botón en la pantalla de aula).

### Fuera (por ahora)
- Tramo **1º–2º** (espera imágenes reales).
- **Imágenes reales** / banco de imágenes (las imágenes siguen siendo descripciones placeholder).
- Hoja-respuestas/pauta docente como variante de export (los datos ya la habilitan; se puede agregar después sin re-generar).
- Generación **batch** «un clic → las N guías» sin que el docente elija (descartado: desperdicio + sin HIL).

## 5. Modelo de datos — `SchemaGuia`

Nuevo schema en `packages/domain/src/schemas/guia.ts`.

**Campos fijos** (el use case los SOBRESCRIBE; la IA no los decide):
- `asignatura: string`
- `curso: string` (nivel)
- `oa: { codigo: string; descripcion: string }` — descripción **verbatim** del corpus.
- `conocimiento: string` — el tema/conocimiento que aborda la guía (lo da el docente en modo manual; lo propone la descomposición en modo auto).
- `perfil_nivel: '3-4' | '5-6'` — por tramo de edad (data-driven, como prueba/PPT).
- `titulo: string`

**Campos redactados por la IA** (nacen borrador):
- `explicacion: string` — texto breve que enseña el conocimiento (apropiado al tramo).
- `ejemplo: string` — 1 ejemplo resuelto/modelado.
- `ejercicios: ItemPrueba[]` — **REUSA `ItemPrueba`** (`packages/domain/src/schemas/prueba.ts`): tipos `seleccion_multiple`, `verdadero_falso`, `completacion`, `desarrollo`, `ordenar`, `terminos_pareados` (NO `pictorico` en 3-6 por ahora). Práctica graduada recordar→aplicar.
- `desafio?: ItemPrueba` — 1 ítem opcional de mayor exigencia.

**Economía del reuso de `ItemPrueba`:**
- Hereda el **render** de `planoPrueba` (`packages/infra-export/src/docx/planoPrueba.ts`).
- Hereda el **guard anti-fuga** (`fugaDeTextoEnPrueba`/`LIMITE_TEXTO_ITEM`, ya en `prueba.ts`) — se aplica a los `ejercicios`/`desafio`, y se extiende a `explicacion`/`ejemplo`.
- Hereda la coherencia por tipo de ítem (una correcta, etc.).
- Los ejercicios llevan sus respuestas en los datos (`alternativas.correcta`, `respuesta_correcta`), que **no se muestran al alumno** → habilita una hoja-respuestas docente futura sin re-generar.

## 6. Generación híbrida

- **Grounding:** `bloqueCorpus` (OA verbatim) — standalone, como `GenerarPlanificacionUnidadUseCase`. La IA ancla `explicacion`/`ejemplo`/`ejercicios` al `conocimiento` + OA.
- **Instrucción nueva** `INSTR_GUIA` en `generacion.ts`: redacta explicación + ejemplo + ejercicios apropiados al tramo; no inventa OA; texto del campo SOLO contenido para el alumno (mismo refuerzo anti-fuga que `INSTR_PRUEBA`).
- **Modelo:** ruta `redaccion` → Sonnet 4.6 (mismo router; sin cambios).
- Nace **borrador** (INV-3); los gates los corre el orquestador/HIL.

### Descomposición OA → conocimientos (tanda 2)
- Paso/llamada **aparte**: `GenerarConocimientosUseCase` + `SchemaConocimientos` (`{ conocimientos: { titulo: string; foco: string }[] }`).
- Grounding `bloqueCorpus` (el OA). Output chico → barato (~$0.02).
- El docente revisa/elige en la UI (HIL, sin desperdicio). Por cada conocimiento elegido se encola un job `guia` con ese `conocimiento` fijo.

## 7. Arquitectura — espejo de prueba/PPT

| Pieza | Archivo (nuevo, espejo del de prueba) |
|---|---|
| Payload del job | `domain/schemas/payloadGuia.ts` (`SchemaPayloadGuia`: `oaCodigo`, `nivel`, `asignatura`, `conocimiento`, `corpusVersionId`) |
| Schema artefacto | `domain/schemas/guia.ts` (`SchemaGuia`, §5) |
| Descomposición | `domain/schemas/conocimientos.ts` + `application/.../GenerarConocimientosUseCase.ts` (tanda 2) |
| Generación | `application/.../GenerarGuiaUseCase.ts` (espejo de `GenerarPruebaFormativaUseCase`) |
| Orquestación cola | `application/.../ProcesarTrabajoGuiaUseCase.ts` (espejo de `ProcesarTrabajoPruebaUseCase`) |
| Gate | factorizar la validación **por-ítem** de `pedagogicalGate` para que corra sobre cualquier `ItemPrueba[]` (la usan prueba y guía) + anti-fuga |
| Export | `infra-export/.../GuiaExportAdapter.ts` + `planoGuia.ts` que reusa `planoPrueba` para `ejercicios` y agrega secciones `explicacion`/`ejemplo` |
| Cola DB | `JobRepository.encolarGuia` / `tomarSiguienteGuia` (espejo de `encolarPrueba`/`tomarSiguientePrueba`) |
| Web | `app/api/aula/guia` (+ `app/api/aula/oa/conocimientos` en tanda 2); `app/documentos/[id]/guia?variante=`; botón en la pantalla de aula |

Patrón de persistencia idéntico: el worker toma el job → genera → corre el gate → persiste **un borrador** (`tipo='guia'`, `origen_id=null` porque es standalone desde el OA) + su `traza_ia` en una transacción (`uow`). `estado_generacion='validado'|'fallido'` según el gate. Reintento acotado ante throw (incluye el guard anti-fuga → reintenta, INV-2).

## 8. Validación, gates y HIL

- **Anti-fuga:** extender el guard ya existente (`fugaDeTextoEnPrueba`) para cubrir `explicacion`/`ejemplo` de la guía (o un `fugaDeTextoEnGuia` análogo). La IA puede volcar razonamiento en texto libre; se rechaza → reintenta (INV-2: basura nunca se persiste/exporta).
- **Coherencia:** cada ejercicio ancla al `conocimiento`/OA; reglas por tipo de ítem. Las reglas por-ítem de `pedagogicalGate` (una correcta, `ordenar` sin duplicados, `terminos_pareados` con ambas columnas) hoy iteran `prueba.items`; se **factorizan** para correr sobre cualquier `ItemPrueba[]` (los `ejercicios` + `desafio` de la guía), evitando duplicar lógica.
- **HIL:** nace borrador; el docente revisa antes de aprobar (INV-2/INV-3). En modo auto, además elige los conocimientos antes de generar.

## 9. Costo estimado (con números reales medidos en `traza_ia`)

- Por guía: **~$0.05–0.08** (Sonnet 4.6; output domina). Comparable a la prueba.
- Descomposición OA→conocimientos: **~$0.02** (output chico, como la planificación).
- Ejemplo: un OA con 4 conocimientos ≈ $0.02 (descomp) + 4×$0.06 ≈ **~$0.26** si se generan las 4.

## 10. Testing

Espejo de los tests de prueba (dominio sin red):
- `guia.test.ts`: `SchemaGuia` valida; reuso de `ItemPrueba`; anti-fuga rechaza texto desmesurado en `explicacion`/`ejemplo`/`ejercicios`.
- `GenerarGuiaUseCase.test.ts`: ensambla guía válida con fake LLM; SOBRESCRIBE campos fijos; rechaza fuga.
- `GenerarConocimientosUseCase.test.ts` (tanda 2): descompone un OA en N conocimientos.
- `ProcesarTrabajoGuiaUseCase.test.ts`: cola → genera → gate → persiste borrador + traza.
- Export IR: `planoGuia` produce secciones (explicación/ejemplo/ejercicios) en orden, sin descomprimir el `.docx`.
- DoD: lint/typecheck verdes, sin `any`, suite verde.

## 11. Abiertos / `[VERIFICAR]`

- **Estructura real de guía 3º–6º:** las 3 referencias en `docs/pruebas/guias/` son de 1º. La estructura «explicación → ejemplo → ejercicios» es canónica, pero conviene conseguir **1–2 PDFs reales de guía de 3º–6º** para calcar el formato exacto (regla «no inventar estructuras»). Marcado `[VERIFICAR]` hasta tener la ref.
- **1º–2º:** retomar cuando exista banco de imágenes (deep-research de licencias ya iniciado: unDraw/Pixabay/Storyset).

## 12. Plan de tandas

- **Tanda 1 (MVP):** §5 schema (sin descomposición) + `GenerarGuiaUseCase` + gate + export + cola + web/UI, **modo manual** (OA + tema). Pilotear valor.
- **Tanda 2:** `GenerarConocimientosUseCase` + UI de lista/selección de conocimientos (HIL) + encolar 1 job por elegido.
