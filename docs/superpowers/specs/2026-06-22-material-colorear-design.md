# Material para colorear (line-art generado, ligado al OA) — diseño (v2)

> Estado: **aprobado** (brainstorming 2026-06-22). Pendiente: writing-plans → implementación.
> Hermano del banco de imágenes ([`2026-06-21-banco-imagenes-design.md`](./2026-06-21-banco-imagenes-design.md)): aquel cubre **íconos a color para el PPT** (curado, Noto Emoji); este cubre **line-art B&N para imprimir y colorear** (generado, ligado al contenido).

## 0. Resumen en una frase

Faro genera **material impreso para colorear** anclado a un OA: **láminas** (un dibujo line-art grande para pintar) y **fichas educativas** (ejercicios del OA + un dibujo para colorear). El dibujo es **line-art B&N original**, generado por IA y **cacheado por OA/concepto**. Nace **borrador** (HIL).

## 1. Valor / por qué

Cierra el material de aula para los **más chicos (1º–3º)**, donde colorear es la actividad central (motricidad + refuerzo del OA). Resuelve lo que el banco de íconos no puede: **dibujos ricos, originales y ligados al contenido**, sin copyright de terceros (las coloring pages de internet — Pinterest, sitios de profes, personajes Disney — son **inusables comercialmente**; ver §8).

## 2. Decisiones del brainstorming (fijadas)

1. **Qué = ambas formas:** láminas puras (solo dibujo) **y** fichas educativas (ejercicios + dibujo).
2. **Dibujo ligado al contenido (pedagógico):** refleja lo que se aprende (conteo → objetos para contar; "seres vivos" → un animal). No decorativo.
3. **Mecanismo = generación IA con cache** (un banco curado CC0 no tiene variedad ligada al OA). El dibujo se genera una vez por (OA + concepto) y se **reusa** → el banco se auto-llena, el costo no se repite.
4. **Patrón híbrido:** **Claude** (motor actual) propone *qué dibujar* anclado al OA (texto); **Imagen 4 Fast** convierte esa descripción en el **line-art B&N**. Claude da el anclaje pedagógico; Imagen sólo dibuja.
5. **Proveedor de imagen = Google Imagen 4 Fast** (~$0.02/img, commercial-friendly), tras un **`ImageGenPort` reemplazable** (INV-6).
6. **Tramo = 1º a 3º básico** (por grado ≤ 3, no por el tramo agrupado 3-4). **Regla por nivel:** desde **4º**, las **pruebas/fichas NO llevan imágenes** (texto); el **PPT SÍ conserva sus íconos a color en todos los tramos** (banco Noto). *(Decisión del dueño, 2026-06-22.)*
7. **HIL:** dibujo y ejercicios nacen **borrador**; el docente puede **regenerar** el dibujo si no le convence.

## 3. Arquitectura (hexagonal — respeta los invariantes v2)

- **`ImageGenPort`** (dominio): `generarLineArt(descripcion: string, opts): Promise<Buffer>` → PNG B&N. Implementado por `ImagenLineArtAdapter` (infra-ai) que llama Imagen 4 Fast (Gemini API). **Reemplazable**: cambiar de proveedor = cambiar el adapter (INV-6).
  - Prompt template del adapter: `"Black and white line art coloring page, thick clean outlines, simple shapes, no shading, no text, suitable for young children: {descripcion}"`.
- **Anclaje pedagógico (Claude):** un use case pide a Claude (tarea `redaccion`, reusa `bloqueCorpus`/`generacion.ts`) una **descripción de dibujo** apropiada al OA (concreta, apta para colorear, sin texto). Esa descripción alimenta el `ImageGenPort`.
- **Cache / banco generado:** el PNG se guarda por clave determinista (p.ej. hash de la descripción normalizada, o `(oaCodigo, concepto)`). Antes de generar, consulta el cache; si existe, reusa. **Integra con el banco actual**: extiende `EntradaImagen` con `fuente: 'imagen-ia'`, `tipo: 'linea_bn'`; los dibujos generados coexisten con los íconos curados (Noto). Versionado para reproducibilidad (INV-4).
- **Export:** layout `.docx`/`.pdf` con el motor actual (reusa el patrón de `planoGuia`/`planoPrueba`).
- **HIL:** nace borrador (INV-2/3); la regeneración = otra llamada al puerto.

## 4. Los dos formatos

1. **Lámina para colorear** — 1 dibujo line-art grande a página + título/consigna ("Pinta el dibujo"). El más simple: solo necesita la descripción (Claude) → dibujo (Imagen) → layout. *Primer entregable.*
2. **Ficha educativa para colorear** — encabezado (Nombre/Curso) + **ejercicios anclados al OA** (REUSA `GenerarGuia`/`GenerarPrueba`) + 1 dibujo para colorear. Layout A4 que combina ejercicios + dibujo. *Como la ref de "sumas para colorear", con dibujo ORIGINAL (nunca personajes con derechos).*

## 5. Tramo y regla por nivel (alcance fino)

- **Material para colorear (láminas + fichas):** se ofrece **solo para 1º–3º básico** (grado ≤ 3).
- **Desde 4º:** las pruebas/fichas son **sin imagen** (no se ofrece el dibujo); el material visual de 4º+ es texto. *(No tocar el motor de prueba para 4º+ salvo asegurar que no exige imagen.)*
- **PPT infantil:** **independiente de esto** — sigue usando el banco de íconos a color (Noto) en **todos los tramos** (1-2 / 3-4 / 5-6). No se modifica.

## 6. Costo (con números reales)

- Dibujo: **~$0.02** (Imagen 4 Fast), **cacheado por OA/concepto** → se paga una vez.
- Ejercicios de la ficha: **~como una guía** (~$0.05–0.08, Sonnet 4.6; ver [[costo-llm-por-artefacto]] del proyecto).
- Lámina pura: ~$0.02 (dibujo) + la descripción de Claude (~$0.005).

## 7. Decomposición — dos planes

Cada plan entrega software funcional y testable por sí solo.

- **PLAN 1 — fundación + lámina pura:**
  `ImageGenPort` + `ImagenLineArtAdapter` (Imagen 4 Fast) + cache/banco generado + `GenerarDescripcionDibujoUseCase` (Claude ancla al OA) + el output **lámina para colorear** (.docx/.pdf) + cableado web/worker/UI (botón desde un OA, tramo ≤ 3) + HIL (regenerar). **Demostrable:** de un OA de 1º–3º sale una lámina line-art real.
- **PLAN 2 — ficha educativa:** reusa la fundación + **el motor de guías/prueba** para los ejercicios + el layout combinado (encabezado + ejercicios + dibujo). Misma restricción de tramo.

## 8. Restricción legal (no negociable)

- **Prohibido** usar coloring pages / fichas de internet (Pinterest, sitios de profes, etc.): tienen **copyright** del autor (watermarks) y a menudo **personajes con derechos** (p.ej. Disney/Frozen). Inusables en un producto comercial.
- Los dibujos se **generan originales**; el prompt **nunca** pide personajes con copyright/marca. Output de Imagen = uso comercial permitido (licencia del proveedor); el copyright *exclusivo* de un dibujo IA es irrelevante para este caso.

## 9. Testing + invariantes

- **INV-1 (dominio sin red):** el `ImageGenPort` es un puerto; el dominio se testea con un doble (fake) que devuelve un PNG fijo. La resolución/cache determinista se testea sin red.
- **INV-2/3 (HIL/borrador):** el dibujo y los ejercicios nacen borrador; el docente revisa/regenera.
- **INV-4 (versionado):** el banco generado registra versión; el dibujo se liga al `corpus_version` del OA.
- **INV-6 (puerto reemplazable):** cambiar Imagen por otro proveedor = nuevo adapter, sin tocar la lógica.
- **DoD del proyecto:** código + tests; `pnpm typecheck` y suite verdes; sin `any`/`console.log`; lint limpio.

## 10. Abiertos / `[VERIFICAR]`

- **Clave de API de Imagen** (`GEMINI_API_KEY` o equivalente) — la aporta el dueño; sin ella, el adapter no genera (modo degradado: placeholder o sample).
- **Endpoint/SDK exacto de Imagen 4 Fast** (Gemini API `generateImages` / Vertex) — el ejecutor lo verifica contra la doc vigente del proveedor al implementar el adapter (no asumir de memoria).
- **Calidad real del line-art** para 1º–2º (contornos suficientemente gruesos): calibrar el prompt template con muestras durante el Plan 1.
- **Gotcha del repo:** comando de test = `pnpm exec vitest run <path-desde-la-raíz>` (NO `pnpm --filter X exec vitest run src/...`).
