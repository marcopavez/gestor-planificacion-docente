# Spec de diseño — Remediación de defectos del smoke test

- **Fecha:** 2026-06-25
- **Estado:** diseño aprobado por el dueño · pendiente plan de implementación (writing-plans)
- **Origen:** smoke en vivo del 2026-06-25 (Matemática 1º + Artes Visuales 3º) que generó los 6 artefactos con Claude real + imagen real. El dueño revisó el output y confirmó los defectos que se remedian aquí.

---

## 0. Resumen ejecutivo

El smoke produjo 6 artefactos correctos en lo estructural, pero con defectos de **coherencia de contenido** y de **imágenes**. La causa transversal más importante: las **imágenes generadas no estaban ancladas al contenido** (el dibujo de una ficha titulada "conteo de manzanas" mostraba pájaros), y dos artefactos (prueba, guía) **no tenían imágenes reales** (la prueba usaba descripciones de texto; la guía, nada).

Decisión del dueño que reencuadra el trabajo: **generar las imágenes con IA en estilo line-art** (el mismo estilo "para colorear" del dibujo de los pájaros — limpio, contornos gruesos, B/N, sin texto — que es como se ven las pruebas reales en Chile), pero **ancladas al tema** de cada prueba/guía/PPT. No usar más el banco de íconos para estos artefactos.

---

## 1. Alcance

### En alcance (defectos confirmados + decisión de imágenes)

| ID | Defecto | Artefacto |
|----|---------|-----------|
| #1 | Anclaje de concepto incoherente (título ≠ dibujo ≠ ejercicios) | ficha, lámina |
| #3 | Ítems duplicados; "imágenes" eran solo texto (0 imágenes reales); coma colgante | prueba |
| #4 | Calibración pre-lectores (1º–2º): demasiada lectura para 6 años | prueba |
| #5 | Las imágenes de conteo no muestran los objetos a contar; una slide revela el conteo en las opciones | PPT |
| #7 | "Sugerencia de imagen" se cuela en las notas del presentador; (menor) renumeración en guía ítem 5 | PPT, guía |
| NUEVO | **Imágenes line-art generadas por IA, ancladas al contenido**, en **prueba, guía y PPT** | prueba, guía, PPT |

### Fuera de alcance (con justificación)

- **#2 — identificadores (colegio / docente / comuna).** Decisión del dueño (2026-06-25): "lo que vamos a vender es el contenido de la plantilla en sí y los archivos asociados". Los placeholders `[Colegio]` / `[Comuna]` / docente `—` quedan como **espacios para rellenar**; no se agrega campo Comuna ni se modifica el threading del establecimiento. *(Coherente con la regla del repo: no inventar datos chilenos.)*
- **#6 — duplicación de "HABILIDADES DEL SIGLO XXI".** **Falsa alarma**, confirmada: cada opción aparece **una sola vez** en `word/document.xml`; el builder `renderContenidoEtiquetado` (`DocxExportAdapter.ts:375-380`) ya está diseñado para no duplicar (renderiza solo la grilla, sin banner) y hay un test que lo verifica. Lo que se vio fue un artefacto del extractor de texto usado en la inspección (su recorrido recursivo de filas contaba dos veces la tabla de checkboxes anidada).

---

## 2. Invariantes que se mantienen (no negociables)

1. **Hexagonal:** los `import` apuntan al dominio; `infra`/`apps` dependen de `application`/`domain`, nunca al revés. El dominio se testea **sin red**.
2. **HIL borrador by-design:** todo artefacto nace `borrador`; la IA propone, el docente decide. El `CHECK chk_aprobado_requiere_humano` sigue vigente.
3. **Degradación sin API key:** sin `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `crearImageGen` devuelve `PlaceholderImageGen` y los artefactos se generan igual (con placeholder visible), en `borrador`. Esto **debe** seguir valiendo para prueba/guía/PPT tras este cambio.
4. **Sin `any` injustificado; sin `console.log` en producción; Conventional Commits.**

---

## 3. Diseño por área

### A. Anclaje de un concepto único — ficha / lámina (#1)

**Causa raíz (grounded):**
- `GenerarFichaUseCase.ts:43` pasa `opts?.concepto` (que en el smoke era `undefined`) al generador de ejercicios, en vez del `dibujo.concepto` ya resuelto → la rama "dibujo" y la rama "ejercicios" son dos llamadas LLM independientes que eligen motivos distintos ("manzanas" vs "globos").
- Dentro de `GenerarDescripcionDibujoUseCase` / `INSTR_DIBUJO` (`generacion.ts:277-288`), el LLM devuelve `{ concepto, descripcion_en }` **sin amarre léxico** entre ambos: `concepto="conteo de manzanas"` pero `descripcion_en="birds in trees"`. El modelo de imagen solo recibe `descripcion_en`.
- `claveDibujo(oa, '')` (`claveDibujo.ts:19`) colisiona conceptos distintos cuando no se pasa `concepto` → un cache HIT puede devolver el dibujo de otra generación.

**Diseño del fix — un solo `concepto` que alimenta las tres salidas:**
1. Resolver **un** `concepto` por artefacto (del payload si viene; si no, lo propone el LLM de descripción) y threadearlo a: **título**, **prompt del dibujo** y **ejercicios**.
   - `GenerarFichaUseCase.ts:43` → pasar `dibujo.concepto` al generador de ejercicios.
2. **Anclar `descripcion_en` al `concepto`:** en `INSTR_DIBUJO`, exigir que `descripcion_en` sea la representación visual del `concepto` (así "conteo de manzanas" ⇒ dibujo de manzanas). Ambos campos salen de la misma llamada estructurada, así que una instrucción firme basta; no se requiere segunda llamada.
3. **Cache estable:** `claveDibujo` se calcula sobre el `concepto` **resuelto**, no sobre el input vacío.
4. **Coherencia ficha↔lámina (nota de diseño):** para que ficha y lámina del mismo OA muestren el **mismo** dibujo, el `concepto` debe resolverse **una sola vez** y pasarse a ambos jobs (p. ej. un `tema` opcional del docente, o resolución única en el flujo). Sin eso, cada artefacto queda coherente internamente (título = dibujo = ejercicios) pero ficha y lámina pueden mostrar motivos distintos. El plan decide el mecanismo exacto.

### B. Imágenes line-art generadas y ancladas al contenido — prueba, guía, PPT (NUEVO + #3-imágenes + #5)

**Principio:** reutilizar el pipeline de line-art que **ya existe** para ficha/lámina y extenderlo a prueba, guía y PPT, con la descripción del dibujo **anclada al contenido específico** (OA + concepto + enunciado del ítem / texto de la slide). El estilo es el mismo de los pájaros: `construirPromptLineArt` (`GeminiFlashImageAdapter.ts:43`, `ImagenLineArtAdapter.ts:26`) — *"black and white line art coloring page, thick clean outlines, simple shapes, no shading, no text, suitable for young children"*.

**Infraestructura reutilizada:**
- `ImageGenPort.generarLineArt(descripcion, opts)` y la factoría DUAL `crearImageGen` (Imagen 4 Fast / Gemini Flash Image, `FARO_IMAGE_PROVIDER`).
- `BancoImagenesGeneradasPort` (cache) + una clave estable estilo `claveDibujo` (hash FNV-1a de la descripción normalizada) para reusar PNGs idénticos.
- El patrón de "resolver una ilustración desde una descripción anclada + cache" se generaliza desde `ResolverDibujoUseCase` (hoy específico de OA+concepto) a un resolver reutilizable por prueba/guía/PPT. El plan decide si se generaliza el use case existente o se extrae un hermano (`ResolverIlustracionUseCase(ctx, descripcionAnclada, claveEstable)`).

**Cambios de modelo (schema):**
- **`ItemPrueba`** (compartido por **prueba y guía**) reemplaza el campo libre `imagen: string` (hoy una *descripción* de texto, `prueba.ts:35`) por un campo estructurado **`imagen?: { descripcion: string }`**, donde `descripcion` es una frase anclada al `enunciado` del ítem (ej.: *"siete estrellas en una entrada de show"*; *"una fila de cinco instrumentos: guitarra, tambor, flauta, trompeta, violín"*). Como la guía reusa `ItemPrueba`, **gana imágenes con el mismo cambio**.
- **`SlideDeck`** (PPT, `claseDeck.ts:13-30`): se reemplaza la dupla `topico_imagen` + `sugerencia_imagen` por **`imagen?: { descripcion: string }`** anclada al texto de la slide. La slide de conteo describe los N objetos dentro de la escena (*"siete estrellas…"*), de modo que **una sola ilustración muestra los objetos a contar** (esto reemplaza la idea previa de "render de N copias de un ícono").

**Flujo de generación (worker, asíncrono — como ya hace ficha):**
1. El LLM de prueba/guía/PPT emite, por ítem/slide pictórico, la `imagen.descripcion` anclada (ya conoce el enunciado/slide; es una sola llamada).
2. El job correspondiente (`ProcesarTrabajoPruebaUseCase`, `ProcesarTrabajoGuiaUseCase`, `ProcesarTrabajoPptInfantilUseCase`) gana la dependencia **`imageGen`** (hoy solo la tienen ficha/material-colorear; cableada en `apps/worker/src/main.ts:157`).
3. Cada `descripcion` → `construirPromptLineArt` → `imageGen.generarLineArt` → PNG cacheado en el banco.
4. El export embebe el PNG real:
   - Prueba: `planoPrueba.ts:267` + `itemsAlumno.ts:106-167` (hoy renderiza `IMAGEN: <texto>` en una caja con borde) → insertar la imagen real.
   - Guía: `planoGuia` / `itemPlano` (reusa `itemsAlumno`) → idem, gratis.
   - PPT: `PptxExportAdapter.placeholderImagen` (`PptxExportAdapter.ts:147-178`) → insertar la ilustración generada en vez del ícono del banco.
5. **Degradación:** si `imageGen` es `PlaceholderImageGen` (sin API key) o devuelve `null`, se mantiene el placeholder visible actual; el artefacto sale igual en `borrador`.

**Consecuencia:** el **banco de íconos Noto** (`domain/src/imagenes/catalogo.ts`, `resolver.ts`, `topicosDisponiblesPara`) deja de usarse en el PPT infantil. El plan decide si se retira o se deja inerte (no es objetivo de este spec borrarlo).

**Fix de prompt asociado a #5:** en `INSTR_DECK_INFANTIL` (`generacion.ts:164`), prohibir explícitamente que el **texto de las opciones** revele la cantidad (nada de *"★★★ (3 estrellas)"*); las opciones de un ítem de conteo son solo el número/etiqueta, y la cantidad se ve en la ilustración.

### C. Calidad de la prueba — dedup + calibración pre-lectores (#3-dedup + #4)

**Causa raíz (grounded):**
- **Duplicados:** ni `INSTR_PRUEBA` (`generacion.ts:130-143`) ni `SchemaPrueba` imponen unicidad de enunciados; `fugaDeTextoEnPrueba` (`prueba.ts:71-98`) solo vigila longitud. Por eso salieron los ítems 4 y 5 casi idénticos.
- **Calibración:** el tramo **no** llega a `entradaPrueba` (`generacion.ts:233-235`); `INSTR_PRUEBA:140` tiene una sola línea débil para 1-2. Contraste: `entradaDeckInfantil` (`generacion.ts:252`) **sí** pasa el tramo y `INSTR_DECK_INFANTIL` tiene reglas detalladas por tramo.

**Diseño del fix:**
1. **Dedup:** (a) instrucción de unicidad en `INSTR_PRUEBA` ("cada ítem evalúa algo distinto; no repitas enunciados ni la misma pregunta con otra imagen"); (b) guard post-parse `itemsDuplicados()` (enunciados idénticos o muy similares) → `GeneracionError` → reintento acotado, insertado en `GenerarPruebaFormativaUseCase.ts:45-47` (junto al guard de fuga). Esto también cubre la coma colgante (era del antiguo campo `imagen` de texto, que se reestructura).
2. **Calibración pre-lectores:** pasar `tramoDeNivel(unidad.nivel)` (`claseDeck.ts:110-116`) a `entradaPrueba` y enriquecer `INSTR_PRUEBA` con reglas por tramo, modeladas sobre `INSTR_DECK_INFANTIL`. Para tramo **1-2**:
   - Enunciados cortos, pensados para ser **leídos por el/la docente**.
   - **Máximo 2 alternativas** en selección múltiple.
   - **Al menos un ítem pictórico** con imagen real del pipeline B.
   - **Prohibido** V/F con secuencias largas y ordenar > 3 elementos.

### D. Pulidos (#7 + menor de guía)

1. **#7 — "Sugerencia de imagen" en notas:** `PptxExportAdapter.notas()` (`PptxExportAdapter.ts:130-134`) anexa `sugerencia_imagen` siempre que esté presente. Con el rediseño de B, `sugerencia_imagen` desaparece del schema de slide (se reemplaza por `imagen.descripcion`), así que la fuga se elimina de raíz; `notas()` queda solo con `notas_docente`.
2. **Menor — guía ítem 5 renumera 1/2/3 internamente:** ajuste de formato/prompt para que los sub-ítems usen numeración continua o letras, evitando reiniciar en "1".

---

## 4. Riesgo conocido: cantidades exactas en las ilustraciones

Los modelos de imagen **no renderizan cantidades exactas de forma confiable** (el dibujo de los pájaros tenía ~16, no un número fijado). Para un ítem de conteo con respuesta **pre-fijada** ("son 7"), la imagen podría dibujar 6 u 8 y romper la pauta.

**Mitigación adoptada (robusta y simple, apoyada en HIL):** los ítems de **conteo para pre-lectores** se formulan como **respuesta abierta / de completar** ("¿Cuántas ___ hay? Escribe el número"), donde la respuesta se **lee de la imagen** y la pauta indica "la cantidad dibujada", que el docente confirma en la revisión (HIL). Esto elimina la fragilidad sin construir un pipeline de visión nuevo, y es coherente con cómo se evalúa a niños de 1º–2º.

**Endurecimiento futuro (no en este alcance):** un paso de verificación con visión (Claude vision cuenta lo dibujado y ajusta/confirma la pauta a la imagen, con regeneración acotada) para soportar ítems de conteo de selección múltiple con clave fija.

---

## 5. Estrategia de testing (sin red, TDD)

- **Dominio:** schema de `ItemPrueba` con `imagen: { descripcion }` (válido/ inválido); `SlideDeck` con `imagen`; detector `itemsDuplicados()`; `entradaPrueba` incluye el tramo (función pura); `construirPromptLineArt` aplica el estilo a la descripción anclada.
- **Application (mock `LlmPort` + `ImageGenPort`):** `GenerarFichaUseCase` pasa `dibujo.concepto` a ejercicios (regresión #1); el resolver de ilustración cachea por clave estable y degrada a `null`; los use cases de prueba/guía/PPT emiten `imagen.descripcion` por ítem/slide.
- **Infra/export:** prueba/guía/PPT embeben el PNG real cuando hay imagen y caen al placeholder cuando `imageGen` devuelve `null`; `PptxExportAdapter.notas()` ya no incluye "Sugerencia de imagen"; el texto de opciones de conteo no revela la cantidad.
- **Sin red en el dominio; los adapters de imagen no se ejercitan contra la API real en la suite** (se mockea `ImageGenPort`).

---

## 6. Definition of Done

- Código + tests verdes; `pnpm typecheck` y `pnpm lint` (eslint `--max-warnings 0`) en 0; sin `any` injustificado.
- Todo artefacto sigue naciendo `borrador` (HIL); degrada a placeholder sin API key.
- Prueba, guía y PPT muestran **imágenes line-art reales ancladas al contenido** cuando hay API key; los ítems de conteo pre-lectores no dependen de cantidades exactas pre-fijadas.
- La prueba 1º–2º cumple las reglas de tramo (≤2 alternativas, sin V/F largas, ≥1 ítem pictórico) y no tiene ítems duplicados.

---

## 7. Decisiones que el plan debe cerrar (no bloquean el diseño)

1. **Generalizar `ResolverDibujoUseCase`** vs. extraer `ResolverIlustracionUseCase` hermano para la resolución anclada + cache compartida.
2. **Mecanismo del `concepto` único** ficha↔lámina (tema del docente opcional, o resolución única en el flujo) para que compartan dibujo.
3. **Clave de cache** para ilustraciones ancladas de prueba/guía/PPT (hash de la descripción normalizada) y su normalización.
4. **Retiro vs. dejar inerte** el banco de íconos Noto del PPT infantil.
5. **Idioma de `imagen.descripcion`** (EN como hoy `descripcion_en`, o ES) y dónde se aplica `construirPromptLineArt`.
