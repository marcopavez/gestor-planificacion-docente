# Banco de imágenes curado — diseño (v2)

> Estado: **propuesto** (brainstorming 2026-06-21). Pendiente de aprobación del dueño antes de `writing-plans`.
> Patrón de referencia: datos **versionados** como el corpus OA (INV-4) + puerto reemplazable como los exportadores (INV-6) + **la IA elige de un catálogo fijo** como las checkboxes (híbrido).

## 0. Resumen en una frase

Un **banco de imágenes curado, con licencia limpia y versionado**: la IA elige un `topico_imagen` de un **catálogo fijo** (no inventa ni busca), y los exportadores insertan la **imagen real** (PNG) en el `.pptx` (ilustración a color) y en las guías `.docx` (line-art B&N para pintar), con **fallback al placeholder** actual cuando no hay imagen. Reemplaza el "placeholder punteado" de hoy por imágenes reales sin riesgo legal ni de contenido para menores.

## 1. Por qué / valor

Hoy el pipeline **describe** imágenes (`sugerencia_imagen` → caja punteada "IMAGEN: …"), nunca dibuja una real (`PptxExportAdapter.placeholderImagen`). Eso deja el PPT infantil a medio camino y **bloquea las guías de 1º–2º** (son ~90% imágenes; la Tanda 1 de guías las difirió justo por esto — ver `2026-06-13-guias-aprendizaje-design.md` §3, §11). Un banco curado:

- Cierra el PPT infantil (placeholder → ilustración real a color).
- **Desbloquea** el camino a guías con imágenes (line-art B&N para pintar).
- Lo hace **vendible a colegios**: licencias comerciales limpias, sin copyright de terceros.
- **Seguro con menores**: todo lo que sale está pre-curado por humano; no hay imágenes impredecibles.

## 2. Decisiones del brainstorming (fijadas)

1. **Destino = ambos.** El banco contiene y resuelve **dos tipos** de imagen: `linea_bn` (line-art para colorear en guías) y `color` (ilustración para el PPT). Una sola infraestructura, etiquetada por tópico/materia/tramo.
2. **Mecanismo = banco curado + catálogo fijo.** La IA **elige un tópico de una lista fija** que le inyectamos (patrón híbrido, como las checkboxes); el export mapea tópico → archivo **determinista**. Se descartan: búsqueda por API en runtime (riesgo de imagen inapropiada con menores + dependencia de red + no reproducible) y generación IA (costo, inconsistencia del line-art, otro proveedor).
3. **Fuente/licencia.** Solo **Openclipart (CC0)** para line-art B&N y **unDraw / Pixabay** para color — todas **sin atribución** → sin créditos en el documento. **Storyset queda fuera** (exige crédito visible). MINEDUC fuera (NC). Regla del deep-research 2026-06-13: embeber en el output **sí**; alimentar entrenamiento IA **nunca**; no redistribuir como pack. Cada entrada registra `fuente` + `licencia` (trazabilidad).
4. **Set semilla = Matemática 1º–2º + tópicos transversales** (~20–30 imágenes, ambos tipos). Demostrable **sin API key** (Matemática 1º ya tiene samples), y la curación inicial es acotada. Crece incremental después.

## 3. Modelo de datos — el catálogo (versionado)

Catálogo **versionado** análogo al corpus OA (INV-4), para reproducibilidad: un documento registra qué `imagenes_version` vio.

`packages/domain/src/imagenes/catalogo.ts` — schema Zod + el catálogo cargado de un JSON versionado:

```ts
export const EntradaImagen = z.object({
  id: z.string(),                          // slug único: "num-3-bn", "manzana-color"
  topico: z.string(),                      // vocabulario controlado: "numero_3", "manzana", "triangulo"
  materia: z.string().nullable(),          // null = transversal (sirve a cualquier asignatura)
  tramo: z.enum(['1-2', '3-4', '5-6']),
  tipo: z.enum(['linea_bn', 'color']),
  archivo: z.string(),                     // ruta relativa al dir de assets (PNG)
  fuente: z.enum(['openclipart', 'undraw', 'pixabay']),
  licencia: z.string(),                    // "CC0", "unDraw", "Pixabay"
});
export type EntradaImagenT = z.infer<typeof EntradaImagen>;

export const IMAGENES_VERSION = '2026.1';  // inmutable, como corpus_version
export const CATALOGO_IMAGENES: readonly EntradaImagenT[] = /* del JSON versionado */;
```

- **Imágenes físicas:** PNG en `packages/infra-export/assets/imagenes/` (las lee el export). El catálogo (dominio) solo guarda metadatos + ruta relativa: el dominio queda **sin I/O** (INV-1).
- **Vocabulario de tópicos:** cerrado y curado. El set semilla define ~20–30 tópicos (números 0–20, conteo, formas básicas, frutas, animales, familia, cuerpo, objetos de aula…).

## 4. Cómo elige la IA (cambio de schema, aditivo)

La IA **no** escribe texto libre para resolver la imagen: elige un tópico del catálogo.

- **PPT** (`SlideDeck`, `claseDeck.ts`): añadir `topico_imagen: z.string().optional()`. La IA lo llena con un tópico **de la lista que le inyectamos** para ese `(materia, tramo)`; `sugerencia_imagen` se conserva para las notas del orador. Campo opcional → decks viejos válidos (backward-compat, como el resto de Fase 3).
- **Guía** (`SchemaGuia` / `ItemPrueba`, `guia.ts`/`prueba.ts`): añadir `topico_imagen?` (aditivo) para insertar line-art de apoyo en un ejercicio.
- **Inyección al prompt:** el use case que arma el prompt pasa `topicosDisponiblesPara(materia, tramo, tipo)` (función pura del dominio) a la instrucción en `generacion.ts`, igual que hoy se inyectan los catálogos de checkboxes. La IA elige **solo de esa lista**; si elige algo fuera (o nada), se resuelve a `null` → fallback.

## 5. Resolución (dominio puro + puerto)

Dominio (sin I/O, INV-1):

```ts
// topicos disponibles para inyectar al prompt
export function topicosDisponiblesPara(
  materia: string, tramo: Tramo, tipo: TipoImagen,
): string[];

// selección DETERMINISTA: misma entrada → misma imagen (reproducible).
// si un tópico tiene varias candidatas, índice estable por seed (id del documento).
export function resolverImagen(
  topico: string, materia: string, tramo: Tramo, tipo: TipoImagen, seed?: string,
): EntradaImagenT | null;
```

- **Determinista** por diseño (coherente con `corpus_version`/INV-4): mismo deck → mismas imágenes.
- Matching: `topico` exacto + `tipo`; `materia` exacta **o** `transversal`; `tramo` exacto con degradación razonable (un transversal de tramo cercano sirve). Si nada calza → `null`.

`BancoImagenesPort` (dominio) que el adapter de export implementa (INV-6): `bytesDe(entrada): Buffer` (lee el PNG). Cambiar de set de assets = cambiar el adapter, no la lógica.

## 6. Integración en export

- **PPT** (`PptxExportAdapter.placeholderImagen`): si `topico_imagen` resuelve a una entrada `color`, `slide.addImage({ data, x, y, w, h })` en el mismo recuadro donde hoy va el placeholder; si **no** resuelve, se mantiene **la caja punteada actual** (degradación elegante, nada se rompe). La sugerencia textual sigue en las notas del orador.
- **Guía** (`GuiaExportAdapter`/`planoGuia`): si un ejercicio trae `topico_imagen` que resuelve a `linea_bn`, se inserta la imagen B&N de apoyo (tamaño "para pintar"); si no, sin imagen.
- pptxgenjs y la lib `.docx` aceptan PNG embebido (base64/buffer). Las fuentes son SVG (Openclipart/unDraw) → se **rasterizan a PNG** en la curación (§7), no en runtime.

## 7. Curación (cómo armamos el set semilla)

Un script de curación (no corre en producción; herramienta de build del catálogo):

1. Descarga por keyword de tópico: **Openclipart** (CC0) para `linea_bn`; **unDraw/Pixabay** para `color`.
2. **Rasteriza** SVG → PNG (resvg/sharp) a un tamaño estándar; normaliza nombres.
3. Genera/actualiza el JSON del catálogo (`id`, `topico`, `materia|null`, `tramo`, `tipo`, `archivo`, `fuente`, `licencia`).
4. **Revisión humana** (mía — las decisiones de imagen son del producto): que el line-art sea "pintable" y la ilustración apropiada para niños. **Esta revisión ES el filtro de seguridad**: nada entra sin curar.

El set semilla queda commiteado (assets + JSON). La descarga no se re-ejecuta en CI; el catálogo es un artefacto versionado.

## 8. Licencia / seguridad (resumen operativo)

| Fuente | Tipo | Atribución | Uso en Faro |
|---|---|---|---|
| Openclipart | `linea_bn` | No (CC0) | ✅ embeber |
| unDraw | `color` | No | ✅ embeber (nunca entrenar IA) |
| Pixabay | `color` | No | ✅ embeber (cuidar personas/marcas) |
| Storyset | — | **Sí** | ❌ fuera (no cargar créditos) |
| MINEDUC | — | NC | ❌ fuera (solo referencia de estilo) |

Invariante de seguridad de contenido: **toda imagen del banco pasó revisión humana** → no hay sorpresas con menores (a diferencia de la búsqueda por API, descartada por esto).

## 9. Arquitectura — archivos

| Pieza | Archivo |
|---|---|
| Schema + catálogo | `packages/domain/src/imagenes/catalogo.ts` + `catalogo-imagenes.json` (versionado) |
| Resolución (dominio puro) | `packages/domain/src/imagenes/resolver.ts` (`topicosDisponiblesPara`, `resolverImagen`) |
| Puerto | `packages/domain/src/ports/BancoImagenesPort.ts` |
| Assets físicos (PNG) | `packages/infra-export/assets/imagenes/` |
| Adapter | `packages/infra-export/src/imagenes/BancoImagenesAdapter.ts` (lee PNG, implementa el puerto) |
| Cambio schema PPT | `packages/domain/src/schemas/claseDeck.ts` (`topico_imagen?`) |
| Cambio schema guía | `packages/domain/src/schemas/guia.ts` / `prueba.ts` (`topico_imagen?` en ítem) |
| Inyección prompt | `packages/application/.../generacion.ts` (lista de tópicos a la instrucción) + el use case del consumidor |
| Export PPT | `packages/infra-export/src/pptx/PptxExportAdapter.ts` (`placeholderImagen` → `addImage` con fallback) |
| Export guía | `packages/infra-export/src/docx/planoGuia.ts` (insertar `linea_bn`) |
| Curación (build) | `scripts/curar-imagenes.mjs` (descarga + rasteriza + genera catálogo) |

## 10. Testing (dominio sin red, INV-1)

- `catalogo.test.ts`: el JSON valida contra `EntradaImagen`; integridad (ids únicos, `archivo` existe, `licencia` ∈ permitidas, sin Storyset/MINEDUC).
- `resolver.test.ts`: `resolverImagen` es **determinista** (misma seed → misma entrada); transversal sirve a cualquier materia; tópico inexistente → `null`; `topicosDisponiblesPara` devuelve solo lo del filtro.
- `claseDeck.test.ts` / `guia.test.ts`: `topico_imagen` opcional → decks/guías previos siguen válidos (backward-compat).
- Export (IR, sin descomprimir): el PPT con `topico_imagen` resuelto produce un `addImage`; sin resolver, mantiene el placeholder; la guía inserta la imagen B&N. (El test de bytes/PNG real puede ir como integración acotada del adapter.)
- DoD: lint/typecheck verdes, sin `any`, suite verde.

## 11. Alcance

### Entra (este spec)
- Catálogo versionado + schema + resolución determinista (dominio puro).
- Puerto + adapter que lee los PNG (infra-export).
- Cambio aditivo de schema (`topico_imagen?`) en PPT y guía + inyección de tópicos al prompt.
- Cableado a **dos consumidores**: PPT infantil (color, con fallback) y export de guías (line-art B&N de apoyo).
- Script de curación + **set semilla** Matemática 1º–2º + transversales (ambos tipos), commiteado.

### Fuera (por ahora)
- **Guías de 1º–2º "full-imagen"** como perfil propio (perfil de generación distinto; **habilitado** por este banco, pero es su propio spec/ciclo).
- Cobertura masiva del catálogo (todas las materias/cursos) — se cura incremental.
- Búsqueda por API en runtime y generación IA (descartadas, §2).
- Storyset y cualquier fuente con atribución obligatoria.
- Theming por colegio / logos.

## 12. Abiertos / `[VERIFICAR]`

- **Re-confirmar licencias al integrar** (los términos cambian): Openclipart CC0, `undraw.co/license`, `pixabay.com/service/license-summary`. La regla "no entrenar IA con los assets" (unDraw) aplica al producto entero.
- **Tamaño/resolución estándar** del PNG para line-art "pintable" vs ilustración de slide: lo fija la curación (decisión de producto), no hay fuente externa.
- **Cobertura de tópicos del set semilla:** la lista exacta (~20–30) se cierra en la curación; debe cubrir lo que la IA tiende a sugerir para Matemática 1º–2º (números, conteo, formas, objetos contables).
- **Desbloqueo de guías 1º–2º:** este banco es el prerequisito que la spec de guías (§3, §11) esperaba; su cableado completo es el siguiente paso natural.
