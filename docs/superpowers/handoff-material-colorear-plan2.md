# Handoff — Material para colorear · PLAN 2 (ficha educativa)

> Para una **sesión nueva** de Claude Code en este repo. Copia el bloque "PROMPT" de abajo como primer
> mensaje. Plan 1 (fundación + lámina pura) ya está **construido y mergeado a `main`** (commits
> `06eab65`..`2558e92`); este documento le da a la sesión nueva todo el contexto para planificar y
> ejecutar el Plan 2 sin volver a derivar lo ya decidido.

---

## PROMPT (copia desde aquí)

Implementa la feature **"Material para colorear · PLAN 2 (ficha educativa)"** en este repo (Faro,
monorepo pnpm hexagonal). El **Plan 1 ya está en `main`**: de un OA de 1º–3º sale una *lámina* line-art
B&N (.docx/.pdf) con el dibujo generado por IA (Claude ancla una descripción en inglés al OA → modelo de
imagen dibuja), cacheado por OA, nace borrador (HIL), cableado web/worker/UI con gate de grado ≤ 3. El
Plan 2 añade el **segundo formato**: la **ficha educativa para colorear** = encabezado (Nombre/Curso) +
**ejercicios anclados al OA** + **1 dibujo para colorear**, en un layout A4 combinado, mismo tramo 1º–3º.

### Proceso (usa las superpowers skills, no improvises el flujo)
1. Lee la **fuente de verdad**: `docs/superpowers/specs/2026-06-22-material-colorear-design.md` (§4.2 los
   dos formatos, §5 tramo, §7 **PLAN 2**, §8 legal, §9 invariantes). Lee también el plan del Plan 1 ya
   ejecutado para ver el patrón: `docs/superpowers/plans/2026-06-22-material-colorear-plan1-lamina.md`.
2. Si la **decisión abierta #1** (ejercicios para grados 1º–2º; ver abajo) necesita al dueño, usa
   `superpowers:brainstorming` para cerrarla antes de planificar. Si ya está clara, salta al plan.
3. `superpowers:writing-plans` → produce el plan en `docs/superpowers/plans/AAAA-MM-DD-material-colorear-plan2-ficha.md`.
4. Ejecútalo con `superpowers:subagent-driven-development` (rama nueva desde `main`, subagente fresco por
   tarea + review por tarea + review final de rama). Termina con `superpowers:finishing-a-development-branch`.

### Qué construir (Plan 2, del spec §4.2/§7)
La **ficha educativa para colorear**: un documento A4 que combina, anclado a UN OA:
- **Encabezado** institucional + Nombre/Curso/Fecha (como la guía).
- **1–3 ejercicios** anclados al OA (texto, apropiados al nivel) — **REUSA el motor de ejercicios** (ver
  reuso abajo). Cortos: la ficha es A4, no una guía completa.
- **1 dibujo para colorear** (line-art B&N) ligado al OA/concepto — **REUSA el pipeline de dibujo del
  Plan 1** (cache por OA + descripción de Claude + ImageGenPort + placeholder si no hay API key).
- Nace **borrador** (HIL); el docente puede regenerar el dibujo (como en la lámina).
- **Tramo: solo grado ≤ 3** (1º–3º). Desde 4º **no** se ofrece (gate en use case + UI, como la lámina).
  El PPT infantil y la prueba/guía existentes **no se tocan**.

### Reuso (NO reinventes — todo esto YA está en `main`)
**Pipeline de dibujo (Plan 1, `@faro/domain` + `@faro/infra-ai` + `@faro/infra-export`):**
- `ImageGenPort.generarLineArt(descripcion, opts?): Promise<Buffer|null>` (`opts.aspectRatio`, default '3:4').
- `crearImageGen(env, log): {imageGen, modo}` — adapter **DUAL** Imagen 4 Fast (default) / Gemini Flash
  Image (`FARO_IMAGE_PROVIDER='flash'`); sin API key → `PlaceholderImageGen` (null). `@google/genai` v2.9.0
  ya instalado. `imagen-4.0-fast-generate-001` / `gemini-3.1-flash-image` (model id en una constante, INV-6).
- `BancoImagenesGeneradasPort` { `buscar(clave)→{png,descripcion,concepto}|null`, `guardar(clave,png,meta)` }
  implementado por `BancoImagenesFsAdapter(dirBanco)` en `@faro/infra-export` (`<dirBanco>/<clave>.png` + `.json`).
  **dirBanco = `join(raizRepo(),'generated','imagenes-ia')`** — MISMO que escribe el worker (worker y web lo comparten).
- `claveDibujo(oaCodigo, concepto?): string` (FNV-1a hex, determinista) — la clave de cache. **La ficha y la
  lámina del mismo (OA, concepto) deben compartir el mismo dibujo cacheado: usa la misma clave.**
- `GenerarDescripcionDibujoUseCase(llm)` (`@faro/application`): Claude (tarea 'redaccion') propone
  `{concepto (ES), descripcion_en (EN)}` anclado al OA, con `INSTR_DIBUJO` (restricción legal: sin
  copyright/marca, sin texto en el dibujo) y anti-fuga (`fugaDeTextoEnDescripcion`, 600). Reúsalo tal cual.
- `GenerarMaterialColorearUseCase({descripcion, imageGen, banco})`: orquesta cache→Claude→Imagen→cache.
  Para la ficha probablemente quieras reusar **las piezas** (claveDibujo + banco + GenerarDescripcionDibujo
  + ImageGenPort) en vez del use case entero (que arma una `Lamina`), o factorizar un helper compartido.
- Export: `planoLamina`/`construirDocumentoLamina(plano, imagenPng|null)`/`LaminaExportAdapter` muestran el
  patrón `ImageRun`-con-fallback-a-`cajaPlaceholder` que la ficha replicará.

**Motor de ejercicios (existente, `@faro/application` + `@faro/domain`):**
- `GenerarGuiaUseCase(llm).ejecutarConMeta(ctx: ContextoCascada, conocimiento)` → `Guia {asignatura, curso,
  oa, conocimiento, perfil_nivel:'3-4'|'5-6', titulo, explicacion, ejemplo, ejercicios: ItemPrueba[], desafio?}`.
  `INSTR_GUIA`/`entradaGuia` en `packages/application/src/aula/cascada/generacion.ts`. ⚠️ **RECHAZA tramo
  '1-2'** (`guia_tramo_no_soportado`) — ver decisión #1.
- `SchemaGuia`, `fugaDeTextoEnGuia`, `ItemPrueba` (7 tipos), `itemPlano`, `planoGuia`, `construirDocumentoGuia`
  (helpers docx: `celda/fila/tabla/cajaPlaceholder/notaBorrador`, Document Arial + PORTRAIT A4), `GuiaExportAdapter`.
- Glue compartido: `bloqueCorpus(ctx)`, `exigirParsedConMeta`, `instruccion`, `MetaGeneracion`, `gradoDeNivel(nivel)`.

**Cableado (patrón a espejar, existente):** la cola `material_colorear` (Plan 1) y la cola `guia` son el
molde exacto: `SchemaPayload*` (domain) + `JobRepository.encolar*/tomarSiguiente*` (domain + `JobRepositoryDrizzle`,
tipo_trabajo) + `ProcesarTrabajo*UseCase` (application) + wiring en `apps/worker/src/main.ts` (loop + backoff) +
rutas `apps/web/app/api/aula/<x>` (POST/[jobId]/`documentos/[id]/<x>`) + `prepararExport*` (`apps/web/src/lib`) +
`produccion.ts` + botón en `apps/web/app/aula/planificacion/page.tsx` (espeja `GenerarMaterialColorear`/`GenerarGuia`).

### Decisiones abiertas a resolver (NO las inventes; ciérralas en brainstorming/planning)
1. **Ejercicios para 1º–2º (LA decisión clave).** El motor de guía RECHAZA tramo '1-2' (`SchemaGuia.perfil_nivel`
   = `['3-4','5-6']`); se difirió "hasta tener imágenes reales" (Tanda 1). **Ahora las imágenes existen** (Plan 1),
   así que la razón del diferimiento ya no aplica. La ficha cubre 1º–3º: grado 3 cae en tramo '3-4' (la guía YA lo
   soporta), pero **grados 1–2 (tramo '1-2') no**. Opciones: (a) extender el motor de ejercicios a '1-2' (ítems para
   pre-lectores: enunciado leído por el docente, apoyo visual; cf. `INSTR_PRUEBA` ya contempla 1-2) — recomendado y
   coherente con que Plan 2 desbloquea 1-2; (b) un set de ejercicios de ficha más simple para 1-2. **Confírmalo con el
   dueño** (decisión de alcance del currículum, no estética).
2. **Fuente del `concepto` para la clave de cache** (para que ficha y lámina compartan dibujo): ¿del OA?,
   ¿del `conocimiento` que escribe el docente?, ¿un campo nuevo? Define una regla determinista.
3. **Cola/tipo nuevo `ficha_colorear`** (mirror de `material_colorear`) vs. reusar. Una cola nueva es lo más limpio.
4. **Layout A4 combinado**: encabezado + 1–3 ejercicios (cortos) + 1 dibujo (ImageRun/placeholder). Reúsa los helpers
   de `construirDocumentoGuia` + el patrón de imagen de `construirDocumentoLamina`. Define el IR `FichaPlano`.

### DoD + gotchas (idénticos al Plan 1)
- **Sin `any`** (`@typescript-eslint/no-explicit-any: error`), **sin `console.log`** (logger de `@faro/observability`).
  Comentarios = el *por qué* en 1 línea. Todo artefacto de IA nace **borrador** (HIL).
- **Tests:** `pnpm exec vitest run <path-desde-la-raíz>` (NO `pnpm --filter X exec vitest run src/...` → "No test files
  found"; el root de vitest es el monorepo). Los tests viven en `packages/*/src/**/*.test.ts` o `apps/*/src/**/*.test.ts`.
- **Typecheck:** `pnpm --filter @faro/<pkg> exec tsc --build` por paquete; `pnpm --filter @faro/web typecheck` para la web.
- **DoD final:** `pnpm lint` (0 warnings) && `pnpm typecheck` && `pnpm test` verdes.
- **INV-5:** dominio/aplicación NO importan infra; solo `apps/worker` y `apps/web/src/lib/produccion.ts` cablean adapters.
  **INV-6:** proveedores tras puerto. **INV-1:** dominio/aplicación testeables con fakes (sin red/disco).
- **Imagen:** sin `GEMINI_API_KEY` el adapter degrada a placeholder (la ficha sale igual, en borrador). Para IDs/precios de
  Claude consulta la skill `claude-api`. Pendiente de smoke con API key real (heredado del Plan 1): confirmar que
  `gemini-3.1-flash-image` respeta `imageConfig.aspectRatio` y re-verificar los IDs de modelo contra la doc de Google.

## (fin del PROMPT)

---

## Apéndice — estado del Plan 1 (para referencia rápida)
- Ejecutado vía subagent-driven-development: 13 tareas, review por tarea + review final de rama (opus) = **Ready to merge**.
  Mergeado a `main` en fast-forward (`f045606`..`2558e92`). Suite: 372 passed / 4 skipped; lint 0; typecheck 0.
- Adapter de imagen **DUAL** (Imagen 4 Fast + Gemini Flash Image) tras `ImageGenPort`, por decisión del dueño
  (Imagen 4 se retira 2026-08-17; el swap es `FARO_IMAGE_PROVIDER=flash`, cero cambios de código).
