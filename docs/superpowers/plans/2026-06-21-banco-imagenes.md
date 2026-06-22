# Banco de imágenes curado — Plan de implementación (Plan 1: infra + PPT)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el PPT infantil inserte **imágenes reales con licencia limpia** (en vez del placeholder punteado), eligiéndolas la IA de un **catálogo fijo** y resolviéndolas el export de forma determinista, con **fallback** al placeholder cuando no hay imagen.

**Architecture:** Un catálogo de imágenes **versionado** (módulo TS type-safe en `domain`, sin I/O — INV-1) + dos funciones puras (`topicosDisponiblesPara`, `resolverImagen`). El schema del deck gana un `topico_imagen?` opcional (aditivo, backward-compat). El `GenerarPptInfantilUseCase` inyecta la lista de tópicos disponibles al prompt (patrón híbrido: la IA elige de la lista, no inventa). El `PptxExportAdapter` resuelve `topico_imagen → archivo PNG` y hace `slide.addImage({ path })`; si no resuelve, mantiene el placeholder actual. Las imágenes físicas viven como assets en `infra-export`.

**Tech Stack:** TypeScript (strict, NodeNext) · Zod · pptxgenjs (`addImage`) · Vitest · monorepo pnpm.

## Global Constraints

- **Sin `any`** injustificado; **sin `console.log`** (logger estructurado de `@faro/observability`).
- **INV-1:** el dominio se testea **sin red ni I/O**. `catalogo.ts`/`resolver.ts` son puros (el `archivo` es un string relativo, no se lee disco en `domain`).
- **INV-5:** los `import` apuntan hacia el dominio. `infra-export`/`application` dependen de `domain`, nunca al revés.
- **INV-6:** el render vive tras `ExportPort`; cambiar de set de assets o de lib = tocar el adapter, no la lógica.
- **Backward-compat:** `topico_imagen` es **opcional** → decks/pruebas/guías ya generados siguen validando (como el resto de Fase 3).
- **Licencias (set semilla):** solo `openclipart` (CC0) / `undraw` / `pixabay`. **Nunca** Storyset ni MINEDUC. Cada entrada registra `fuente` + `licencia`.
- **Idioma:** identificadores y comentarios en español de Chile donde el código ya lo hace; términos técnicos en inglés (port, adapter).
- **Commits:** Conventional Commits con scope de paquete.

---

## File Structure

**Nuevos:**
- `packages/domain/src/imagenes/catalogo.ts` — `EntradaImagen` (Zod), tipos, `IMAGENES_VERSION`, `CATALOGO_IMAGENES`.
- `packages/domain/src/imagenes/resolver.ts` — `topicosDisponiblesPara`, `resolverImagen` (puras).
- `packages/domain/src/imagenes/catalogo.test.ts`, `resolver.test.ts`.
- `packages/infra-export/assets/imagenes/` — PNGs del set semilla (Task 7).
- `packages/infra-export/test/fixtures/imagenes/` — 2 PNGs dummy para tests (Task 4).
- `scripts/curar-imagenes.mjs` — herramienta de curación (Task 7).

**Modificados:**
- `packages/domain/src/index.ts` — re-export de `./imagenes/*`.
- `packages/domain/src/schemas/claseDeck.ts` — `topico_imagen?` en `SlideDeck`.
- `packages/infra-export/src/pptx/PptxExportAdapter.ts` — constructor (`dirAssets`) + `placeholderImagen` (addImage con fallback).
- `packages/application/src/aula/cascada/generacion.ts` — `entradaDeckInfantil` (recibe tópicos) + `INSTR_DECK_INFANTIL`.
- `packages/application/src/aula/cascada/GenerarPptInfantilUseCase.ts` — calcula y pasa los tópicos.
- `apps/worker/src/main.ts`, `apps/web/src/lib/produccion.ts`, `apps/web/src/lib/cascadaDemo.ts` — pasan `dirAssets` (o usan el default).

> **Nota de diseño (desviación menor del spec, intencional):** el catálogo vive como **módulo TS** (no JSON) para evitar import-assertions en NodeNext y ganar type-safety; `IMAGENES_VERSION` aporta el versionado (INV-4). No se introduce `BancoImagenesPort`: las funciones puras de dominio + el `ExportPort` existente ya cubren INV-1/INV-6 con menos superficie (YAGNI).

---

### Task 1: Catálogo de imágenes (schema + datos versionados)

**Files:**
- Create: `packages/domain/src/imagenes/catalogo.ts`
- Test: `packages/domain/src/imagenes/catalogo.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `EntradaImagen` (ZodObject), `EntradaImagenT`, `TipoImagen = 'linea_bn'|'color'`, `TramoImagen = '1-2'|'3-4'|'5-6'`, `IMAGENES_VERSION: string`, `CATALOGO_IMAGENES: readonly EntradaImagenT[]`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/domain/src/imagenes/catalogo.test.ts
import { describe, expect, it } from 'vitest';
import { CATALOGO_IMAGENES, EntradaImagen, IMAGENES_VERSION } from './catalogo.js';

const FUENTES_PERMITIDAS = new Set(['openclipart', 'undraw', 'pixabay']);

describe('catálogo de imágenes', () => {
  it('expone una versión inmutable', () => {
    expect(IMAGENES_VERSION).toMatch(/^\d{4}\.\d+$/);
  });

  it('toda entrada valida contra EntradaImagen', () => {
    for (const e of CATALOGO_IMAGENES) {
      expect(EntradaImagen.safeParse(e).success).toBe(true);
    }
  });

  it('los ids son únicos', () => {
    const ids = CATALOGO_IMAGENES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('solo usa fuentes con licencia permitida (nunca Storyset/MINEDUC)', () => {
    for (const e of CATALOGO_IMAGENES) {
      expect(FUENTES_PERMITIDAS.has(e.fuente)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @faro/domain exec vitest run src/imagenes/catalogo.test.ts`
Expected: FAIL — el módulo `./catalogo.js` no existe.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/domain/src/imagenes/catalogo.ts
// Catálogo de imágenes curado, versionado y con licencia limpia (INV-4).
// Es DATA pura: `archivo` es una ruta relativa (string); el dominio nunca lee disco (INV-1).
// Lo consume el export (resuelve la ruta absoluta) y el use case (lista de tópicos al prompt).
import { z } from 'zod';

export const TRAMOS_IMAGEN = ['1-2', '3-4', '5-6'] as const;
export type TramoImagen = (typeof TRAMOS_IMAGEN)[number];
export const TIPOS_IMAGEN = ['linea_bn', 'color'] as const;
export type TipoImagen = (typeof TIPOS_IMAGEN)[number];

export const EntradaImagen = z.object({
  id: z.string(), // slug único: "num-3-bn", "manzana-color"
  topico: z.string(), // vocabulario controlado: "numero_3", "manzana", "triangulo"
  materia: z.string().nullable(), // null = transversal (sirve a cualquier asignatura)
  tramo: z.enum(TRAMOS_IMAGEN),
  tipo: z.enum(TIPOS_IMAGEN),
  archivo: z.string(), // ruta RELATIVA al dir de assets (PNG)
  fuente: z.enum(['openclipart', 'undraw', 'pixabay']),
  licencia: z.string(), // "CC0", "unDraw", "Pixabay"
});
export type EntradaImagenT = z.infer<typeof EntradaImagen>;

// Inmutable (como corpus_version): un documento puede registrar qué versión del banco vio.
export const IMAGENES_VERSION = '2026.1';

// El set semilla real lo llena la curación (Task 7). Arranca con una entrada de cada tipo para
// que los tests de integridad tengan algo válido; crece sin tocar el código.
export const CATALOGO_IMAGENES: readonly EntradaImagenT[] = [
  {
    id: 'numero_3-bn',
    topico: 'numero_3',
    materia: null,
    tramo: '1-2',
    tipo: 'linea_bn',
    archivo: 'transversal/numero_3-bn.png',
    fuente: 'openclipart',
    licencia: 'CC0',
  },
  {
    id: 'conteo-color',
    topico: 'conteo',
    materia: 'Matemática',
    tramo: '1-2',
    tipo: 'color',
    archivo: 'matematica/conteo-color.png',
    fuente: 'undraw',
    licencia: 'unDraw',
  },
];
```

- [ ] **Step 4: Add the re-export**

En `packages/domain/src/index.ts`, junto a los otros `export * from './...'`, añade:

```typescript
export * from './imagenes/catalogo.js';
export * from './imagenes/resolver.js';
```

(Si `resolver.js` aún no existe, el typecheck del paso siguiente lo crea en Task 2; para que Task 1 compile sola, añade solo la línea de `catalogo.js` aquí y la de `resolver.js` en Task 2, Step 4.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @faro/domain exec vitest run src/imagenes/catalogo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/imagenes/catalogo.ts packages/domain/src/imagenes/catalogo.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): catálogo de imágenes versionado (EntradaImagen + integridad)"
```

---

### Task 2: Resolución pura (tópicos disponibles + selección determinista)

**Files:**
- Create: `packages/domain/src/imagenes/resolver.ts`
- Test: `packages/domain/src/imagenes/resolver.test.ts`
- Modify: `packages/domain/src/index.ts` (re-export de `resolver.js`, si no se añadió en Task 1)

**Interfaces:**
- Consumes: `CATALOGO_IMAGENES`, `EntradaImagenT`, `TipoImagen`, `TramoImagen` (Task 1).
- Produces:
  - `topicosDisponiblesPara(asignatura: string, tramo: TramoImagen, tipo: TipoImagen): string[]`
  - `resolverImagen(topico: string, asignatura: string, tramo: TramoImagen, tipo: TipoImagen, seed?: string): EntradaImagenT | null`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/domain/src/imagenes/resolver.test.ts
import { describe, expect, it } from 'vitest';
import type { EntradaImagenT } from './catalogo.js';
import { resolverImagenEn, topicosDisponiblesEn } from './resolver.js';

// Catálogo de prueba (inyectado): no dependemos del set real curado.
const CAT: EntradaImagenT[] = [
  { id: 'a', topico: 'manzana', materia: null, tramo: '1-2', tipo: 'color', archivo: 'x/a.png', fuente: 'pixabay', licencia: 'Pixabay' },
  { id: 'b', topico: 'manzana', materia: null, tramo: '1-2', tipo: 'color', archivo: 'x/b.png', fuente: 'pixabay', licencia: 'Pixabay' },
  { id: 'c', topico: 'conteo', materia: 'Matemática', tramo: '1-2', tipo: 'color', archivo: 'x/c.png', fuente: 'undraw', licencia: 'unDraw' },
  { id: 'd', topico: 'numero_3', materia: null, tramo: '1-2', tipo: 'linea_bn', archivo: 'x/d.png', fuente: 'openclipart', licencia: 'CC0' },
];

describe('topicosDisponiblesEn', () => {
  it('devuelve tópicos de la materia + transversales, del tipo y tramo pedidos', () => {
    const t = topicosDisponiblesEn(CAT, 'Matemática', '1-2', 'color');
    expect(new Set(t)).toEqual(new Set(['manzana', 'conteo']));
  });
  it('una materia ajena no ve los tópicos exclusivos de otra', () => {
    const t = topicosDisponiblesEn(CAT, 'Música', '1-2', 'color');
    expect(t).toEqual(['manzana']); // 'conteo' es exclusivo de Matemática
  });
  it('filtra por tipo', () => {
    expect(topicosDisponiblesEn(CAT, 'Matemática', '1-2', 'linea_bn')).toEqual(['numero_3']);
  });
});

describe('resolverImagenEn', () => {
  it('un tópico inexistente devuelve null', () => {
    expect(resolverImagenEn(CAT, 'dinosaurio', 'Matemática', '1-2', 'color')).toBeNull();
  });
  it('es DETERMINISTA: misma seed → misma entrada', () => {
    const r1 = resolverImagenEn(CAT, 'manzana', 'Matemática', '1-2', 'color', 'doc-1');
    const r2 = resolverImagenEn(CAT, 'manzana', 'Matemática', '1-2', 'color', 'doc-1');
    expect(r1?.id).toBe(r2?.id);
  });
  it('respeta materia (exacta o transversal) y tipo', () => {
    const r = resolverImagenEn(CAT, 'conteo', 'Matemática', '1-2', 'color');
    expect(r?.id).toBe('c');
    expect(resolverImagenEn(CAT, 'conteo', 'Música', '1-2', 'color')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @faro/domain exec vitest run src/imagenes/resolver.test.ts`
Expected: FAIL — `./resolver.js` no existe.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/domain/src/imagenes/resolver.ts
// Resolución PURA (INV-1): qué imagen del catálogo corresponde a (tópico, asignatura, tramo, tipo).
// Determinista por `seed` → reproducible (coherente con corpus_version). Sin I/O: devuelve la entrada
// (con su `archivo` relativo); leer el PNG es responsabilidad del adapter de export.
import { CATALOGO_IMAGENES, type EntradaImagenT, type TipoImagen, type TramoImagen } from './catalogo.js';

/** Una entrada aplica si coincide tipo+tramo y la materia es la misma o transversal (null). */
function aplica(e: EntradaImagenT, asignatura: string, tramo: TramoImagen, tipo: TipoImagen): boolean {
  return e.tipo === tipo && e.tramo === tramo && (e.materia === null || e.materia === asignatura);
}

/** Hash estable y barato de un string (FNV-1a de 32 bits) para la selección determinista. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Variante testeable: opera sobre un catálogo inyectado. */
export function topicosDisponiblesEn(
  catalogo: readonly EntradaImagenT[],
  asignatura: string,
  tramo: TramoImagen,
  tipo: TipoImagen,
): string[] {
  const topicos = new Set<string>();
  for (const e of catalogo) {
    if (aplica(e, asignatura, tramo, tipo)) topicos.add(e.topico);
  }
  return [...topicos];
}

/** Variante testeable: opera sobre un catálogo inyectado. */
export function resolverImagenEn(
  catalogo: readonly EntradaImagenT[],
  topico: string,
  asignatura: string,
  tramo: TramoImagen,
  tipo: TipoImagen,
  seed = '',
): EntradaImagenT | null {
  const candidatas = catalogo.filter((e) => e.topico === topico && aplica(e, asignatura, tramo, tipo));
  if (candidatas.length === 0) return null;
  // Orden estable por id + índice determinista por seed → misma entrada para el mismo documento.
  const ordenadas = [...candidatas].sort((a, b) => a.id.localeCompare(b.id));
  return ordenadas[hash(seed) % ordenadas.length];
}

// --- API pública: liga al catálogo real ---
export function topicosDisponiblesPara(asignatura: string, tramo: TramoImagen, tipo: TipoImagen): string[] {
  return topicosDisponiblesEn(CATALOGO_IMAGENES, asignatura, tramo, tipo);
}
export function resolverImagen(
  topico: string,
  asignatura: string,
  tramo: TramoImagen,
  tipo: TipoImagen,
  seed?: string,
): EntradaImagenT | null {
  return resolverImagenEn(CATALOGO_IMAGENES, topico, asignatura, tramo, tipo, seed);
}
```

- [ ] **Step 4: Ensure the re-export exists**

Confirma que `packages/domain/src/index.ts` tiene `export * from './imagenes/resolver.js';` (añádelo si no se hizo en Task 1).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @faro/domain exec vitest run src/imagenes/resolver.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/imagenes/resolver.ts packages/domain/src/imagenes/resolver.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): resolución determinista de imágenes (tópicos disponibles + selección)"
```

---

### Task 3: Campo `topico_imagen` en el deck (aditivo, backward-compat)

**Files:**
- Modify: `packages/domain/src/schemas/claseDeck.ts:13-26` (el objeto `SlideDeck`)
- Test: `packages/domain/src/schemas/claseDeck.test.ts` (añadir casos)

**Interfaces:**
- Produces: `SlideDeck` con `topico_imagen?: string`.

- [ ] **Step 1: Write the failing test**

Añade a `packages/domain/src/schemas/claseDeck.test.ts`:

```typescript
import { SlideDeck } from './claseDeck.js';

describe('SlideDeck.topico_imagen', () => {
  it('acepta un slide con topico_imagen', () => {
    const s = SlideDeck.parse({
      momento: 'inicio', titulo: 'T', contenido: ['a'], notas_docente: 'n', topico_imagen: 'conteo',
    });
    expect(s.topico_imagen).toBe('conteo');
  });
  it('sigue siendo opcional (slides previos sin el campo validan)', () => {
    const s = SlideDeck.parse({ momento: 'inicio', titulo: 'T', contenido: [], notas_docente: 'n' });
    expect(s.topico_imagen).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @faro/domain exec vitest run src/schemas/claseDeck.test.ts -t topico_imagen`
Expected: FAIL — `topico_imagen` no existe en el schema (el primer test no encuentra el campo / da undefined).

- [ ] **Step 3: Write minimal implementation**

En `packages/domain/src/schemas/claseDeck.ts`, dentro de `SlideDeck`, justo después de `sugerencia_imagen: z.string().optional(),` (línea 18) añade:

```typescript
  // Tópico del catálogo de imágenes (Task banco): la IA lo elige de la lista fija que se le inyecta.
  // El export lo resuelve a una imagen real (color); si no resuelve, cae al placeholder. Opcional →
  // backward-compat con decks ya generados. `sugerencia_imagen` se conserva para las notas del orador.
  topico_imagen: z.string().optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @faro/domain exec vitest run src/schemas/claseDeck.test.ts`
Expected: PASS (incluye los 2 nuevos + los previos).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/schemas/claseDeck.ts packages/domain/src/schemas/claseDeck.test.ts
git commit -m "feat(domain): SlideDeck.topico_imagen opcional (la IA elige del catálogo)"
```

---

### Task 4: El export inserta la imagen real (con fallback al placeholder)

**Files:**
- Modify: `packages/infra-export/src/pptx/PptxExportAdapter.ts` (constructor + `placeholderImagen`)
- Create: `packages/infra-export/test/fixtures/imagenes/transversal/conteo-color.png` (un PNG mínimo válido)
- Test: `packages/infra-export/src/pptx/PptxExportAdapter.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `resolverImagen`, `tramoDeNivel` (`@faro/domain`).
- Produces: `PptxExportAdapter` con 3er parámetro `dirAssets`.

- [ ] **Step 1: Crea el PNG de fixture**

Genera un PNG 1×1 válido (no se inspecciona el contenido, solo que `addImage` no falle):

```bash
mkdir -p packages/infra-export/test/fixtures/imagenes/transversal
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0aIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\x0d\x0a\x2d\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > packages/infra-export/test/fixtures/imagenes/transversal/conteo-color.png
```

- [ ] **Step 2: Write the failing test**

Añade a `packages/infra-export/src/pptx/PptxExportAdapter.test.ts` (reusa el patrón de los tests existentes: construir un `ClaseDeck` con `tema` y exportar a un dir temporal). El catálogo real no tiene aún la imagen del fixture, así que el test inyecta su propio dir de assets y un deck cuyo `topico_imagen` resuelve contra el **catálogo real**; para aislarlo del set real, el test verifica el comportamiento de **fallback** y el de **inserción** usando un tópico que sí esté en el catálogo semilla (`conteo`, Matemática 1-2, color):

```typescript
import { tramoDeNivel } from '@faro/domain';

describe('PptxExportAdapter — imágenes reales', () => {
  it('exporta sin error y produce un .pptx no vacío cuando un slide trae topico_imagen resoluble', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
    const dirAssets = join(process.cwd(), 'test/fixtures/imagenes');
    const adapter = new PptxExportAdapter(dir, logger, dirAssets);
    const deck = deckInfantilDePrueba({ topico_imagen: 'conteo', nivel: '1º básico', asignatura: 'Matemática' });
    const r = await adapter.exportarPptx(deck);
    expect(r.bytes).toBeGreaterThan(1000);
  });

  it('cae al placeholder (no rompe) cuando el tópico no resuelve a ninguna imagen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
    const adapter = new PptxExportAdapter(dir, logger, join(process.cwd(), 'test/fixtures/imagenes'));
    const deck = deckInfantilDePrueba({ topico_imagen: 'inexistente-xyz', nivel: '1º básico', asignatura: 'Matemática' });
    const r = await adapter.exportarPptx(deck);
    expect(r.bytes).toBeGreaterThan(1000); // exporta igual, con el recuadro punteado
  });
});
```

> Nota para el ejecutor: si en el archivo de test no existe un helper `deckInfantilDePrueba`, créalo a partir del `ClaseDeck` que ya construyen los tests vecinos (con `tema: TEMAS_DECK_INFANTIL['1-2']` y un único slide `tipo:'contenido'` que reciba el `topico_imagen` del parámetro). Reusa el `logger` y los imports (`mkdtemp`, `tmpdir`, `join`) ya presentes en el archivo.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @faro/infra-export exec vitest run src/pptx/PptxExportAdapter.test.ts -t "imágenes reales"`
Expected: FAIL — `PptxExportAdapter` no acepta un 3er argumento / `placeholderImagen` no inserta imagen.

- [ ] **Step 4: Implementación — constructor + resolución de imagen**

En `packages/infra-export/src/pptx/PptxExportAdapter.ts`:

1. Amplía los imports del dominio (línea 7-13) con `resolverImagen` y `tramoDeNivel` (son valores, no solo tipos → import normal, no `import type`):

```typescript
import { resolverImagen, tramoDeNivel } from '@faro/domain';
```

2. Añade `dirAssets` al constructor (línea 45-48), con un default junto al paquete:

```typescript
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    // Dir raíz de los PNG del banco de imágenes. Default: assets del propio paquete infra-export.
    private readonly dirAssets: string = new URL('../../assets/imagenes', import.meta.url).pathname,
  ) {}
```

3. Reemplaza el cuerpo de `placeholderImagen` (línea 133-154) para intentar primero la imagen real y caer al placeholder:

```typescript
  private placeholderImagen(
    slide: ReturnType<Pptx['addSlide']>,
    s: SlideDeckType,
    tema: TemaDeckInfantilType,
    deck: ClaseDeck,
  ): void {
    // 1) Imagen real del banco: la IA eligió un topico_imagen del catálogo → la resolvemos (color).
    if (s.topico_imagen) {
      const tramo = tramoDeNivel(deck.nivel);
      const entrada = resolverImagen(s.topico_imagen, deck.asignatura, tramo, 'color', deck.titulo);
      if (entrada) {
        // pptxgenjs lee el archivo al escribir; le pasamos la ruta absoluta (dirAssets + relativo).
        slide.addImage({
          path: join(this.dirAssets, entrada.archivo),
          x: 3.0, y: 2.0, w: 4.0, h: 2.6,
          sizing: { type: 'contain', w: 4.0, h: 2.6 },
        });
        return;
      }
    }
    // 2) Fallback: el placeholder punteado de siempre (cuando no hay tópico o no resuelve).
    const sugerencia = s.sugerencia_imagen?.trim();
    if (!sugerencia) return;
    slide.addText(`IMAGEN: ${sugerencia}`, {
      x: 1.0, y: 4.3, w: 8, h: 1.0,
      fontSize: 14, fontFace: tema.fuente.cuerpo,
      align: 'center', valign: 'middle', color: tema.paleta.acento,
      line: { color: tema.paleta.acento, width: 1.5, dashType: 'dash' },
    });
  }
```

4. `placeholderImagen` ahora necesita el `deck` (para `asignatura`/`nivel`/`titulo`). Propaga `deck` a los 3 call-sites: `slideContenidoInfantil` (línea 295), `slideQueSigue` (línea 327) y `slideInteraccion` (línea 364). Para eso, pasa `deck` a esos métodos. La vía mínima: en `exportarPptx` el bucle infantil ya tiene `deck` (línea 60-62) — cambia las firmas de `slideInfantil`/`slideContenidoInfantil`/`slideQueSigue`/`slideInteraccion`/`slideBaseInfantil` para recibir `deck: ClaseDeck` y reenvíalo hasta `placeholderImagen`. Ejemplo del cambio en el dispatcher:

```typescript
// línea 61-62 (en exportarPptx):
for (const slide of deck.slides) {
  this.slideInfantil(pptx, slide, deck.tema, deck);
}
```

```typescript
// firma y cuerpo del dispatcher:
private slideInfantil(pptx: Pptx, s: SlideDeckType, tema: TemaDeckInfantilType, deck: ClaseDeck): void {
  switch (s.tipo) {
    case 'pregunta':
    case 'elige':
      this.slideInteraccion(pptx, s, tema, deck);
      break;
    case 'que_sigue':
      this.slideQueSigue(pptx, s, tema, deck);
      break;
    default:
      this.slideContenidoInfantil(pptx, s, tema, deck);
  }
}
```

Aplica el mismo añadido de parámetro `deck: ClaseDeck` a `slideContenidoInfantil`, `slideQueSigue` y `slideInteraccion`, y en cada uno cambia su llamada `this.placeholderImagen(slide, s, tema)` por `this.placeholderImagen(slide, s, tema, deck)`. (`slideBaseInfantil` no llama a `placeholderImagen`; no necesita `deck`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @faro/infra-export exec vitest run src/pptx/PptxExportAdapter.test.ts`
Expected: PASS (los nuevos + todos los previos del adapter).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @faro/infra-export exec tsc --build`
Expected: sin errores. (Si `import.meta.url` diera problema de tipos, confirma que el `tsconfig` del paquete usa `module: NodeNext`; ya lo usa el resto del paquete.)

- [ ] **Step 7: Commit**

```bash
git add packages/infra-export/src/pptx/PptxExportAdapter.ts packages/infra-export/src/pptx/PptxExportAdapter.test.ts packages/infra-export/test/fixtures/imagenes
git commit -m "feat(infra-export): el PPT inserta la imagen real del banco con fallback al placeholder"
```

---

### Task 5: La IA elige el tópico — inyección al prompt

**Files:**
- Modify: `packages/application/src/aula/cascada/generacion.ts` (`INSTR_DECK_INFANTIL` + `entradaDeckInfantil`)
- Modify: `packages/application/src/aula/cascada/GenerarPptInfantilUseCase.ts`
- Test: `packages/application/src/aula/cascada/GenerarPptInfantilUseCase.test.ts` (añadir un caso)

**Interfaces:**
- Consumes: `topicosDisponiblesPara` (`@faro/domain`).
- Produces: `entradaDeckInfantil(unidad, tramo, topicosColor: string[]): string`.

- [ ] **Step 1: Write the failing test**

Añade a `packages/application/src/aula/cascada/GenerarPptInfantilUseCase.test.ts` un caso que capture la `entradaUsuario` pasada al LLM y verifique que incluye los tópicos disponibles. Usa el patrón del fake LLM ya presente en el archivo; si el fake no captura los args, extiéndelo para guardar `entradaUsuario`:

```typescript
it('inyecta los tópicos de imagen disponibles en la entrada del LLM', async () => {
  let entradaCapturada = '';
  const llm: LlmPort = {
    generar: async (args) => {
      entradaCapturada = args.entradaUsuario;
      return { parsed: deckBorradorValido(), stopReason: 'end_turn', usage: USAGE0, modelo: 'claude-sonnet-4-6' };
    },
  };
  await new GenerarPptInfantilUseCase(llm).ejecutar(unidadMatematica1());
  // El set semilla tiene 'conteo' (Matemática, 1-2, color) → debe ofrecerse a la IA.
  expect(entradaCapturada).toContain('conteo');
  expect(entradaCapturada.toLowerCase()).toContain('topico_imagen');
});
```

> Nota: reusa los helpers del archivo (el que arma una `PlanificacionUnidad` de Matemática 1º y un deck borrador válido). Si se llaman distinto, ajústalos; lo esencial es la aserción sobre `entradaCapturada`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @faro/application exec vitest run src/aula/cascada/GenerarPptInfantilUseCase.test.ts -t "tópicos de imagen"`
Expected: FAIL — la entrada no menciona los tópicos ni `topico_imagen`.

- [ ] **Step 3: Implementación — entrada + instrucción + use case**

1. En `generacion.ts`, cambia la firma y el cuerpo de `entradaDeckInfantil` (línea 215-224) para recibir e incluir los tópicos:

```typescript
/** Entrada para el PPT infantil: la planificación + el tramo + los tópicos de imagen disponibles. */
export function entradaDeckInfantil(
  unidad: PlanificacionUnidad,
  tramo: '1-2' | '3-4' | '5-6',
  topicosColor: readonly string[],
): string {
  const listaTopicos = topicosColor.length
    ? topicosColor.join(', ')
    : '(no hay imágenes disponibles para este nivel; omite topico_imagen)';
  return [
    `Unidad: ${unidad.unidad} (${unidad.asignatura} · ${unidad.nivel})`,
    `Tramo de edad: ${tramo} básico`,
    `Tópicos de imagen disponibles (elige uno EXACTO de esta lista para 'topico_imagen', o ninguno): ${listaTopicos}`,
    `Planificación de unidad (JSON):`,
    JSON.stringify(unidad),
    '',
    'Genera los slides del PPT infantil para esta unidad, anclados a su propósito, experiencias, OA e indicadores.',
  ].join('\n');
}
```

2. En `generacion.ts`, añade una línea a `INSTR_DECK_INFANTIL` (dentro del array, antes del cierre — junto a las viñetas de cada slide, línea ~166):

```typescript
    "- Si un slide se beneficia de una imagen, pon en 'topico_imagen' UN valor EXACTO de la lista de tópicos disponibles de la entrada (no inventes tópicos). Si ninguno aplica, omite el campo.",
```

3. En `GenerarPptInfantilUseCase.ts`, importa `topicosDisponiblesPara` (línea 14) y calcula los tópicos antes de llamar al LLM (línea 26-35):

```typescript
import { SchemaClaseDeck, temaDeckInfantil, topicosDisponiblesPara, tramoDeNivel } from '@faro/domain';
```

```typescript
    const tramo = tramoDeNivel(unidad.nivel);
    const tema = temaDeckInfantil(unidad.nivel, unidad.asignatura);
    const topicosColor = topicosDisponiblesPara(unidad.asignatura, tramo, 'color');

    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaClaseDeck,
      system: [bloqueCorpusUnidad(unidad), INSTR_DECK_INFANTIL],
      entradaUsuario: entradaDeckInfantil(unidad, tramo, topicosColor),
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @faro/application exec vitest run src/aula/cascada/GenerarPptInfantilUseCase.test.ts`
Expected: PASS (el nuevo + los previos).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/generacion.ts packages/application/src/aula/cascada/GenerarPptInfantilUseCase.ts packages/application/src/aula/cascada/GenerarPptInfantilUseCase.test.ts
git commit -m "feat(application): el PPT infantil ofrece a la IA los tópicos de imagen disponibles"
```

---

### Task 6: Cablear `dirAssets` en los composition roots

**Files:**
- Modify: `apps/worker/src/main.ts:92`
- Modify: `apps/web/src/lib/produccion.ts:106`
- Modify: `apps/web/src/lib/cascadaDemo.ts:92`

**Interfaces:**
- Consumes: `PptxExportAdapter` (3er parámetro `dirAssets`).

- [ ] **Step 1: Decide la fuente de `dirAssets`**

El default del constructor (`assets/imagenes` junto al paquete) ya funciona en producción. Esta task hace **explícito** el cableado solo donde convenga override (ninguno hoy) y verifica que el default resuelve. Como el default cubre los 3 roots, el cambio es **verificación**, no edición — salvo que el bundling de Next rompa `import.meta.url`.

- [ ] **Step 2: Verifica el default en runtime (worker)**

Run: `pnpm --filter @faro/worker exec tsc --build`
Expected: sin errores (el 3er parámetro es opcional; los call-sites existentes siguen válidos).

- [ ] **Step 3: Si el bundling de Next no resuelve `import.meta.url`**

Solo si el smoke (Task 7, Step 5) muestra que la web no encuentra los assets: en `produccion.ts` y `cascadaDemo.ts`, pasa la ruta explícita como 3er argumento, p.ej. `join(raizRepo(), 'packages/infra-export/assets/imagenes')` (reusa el `raizRepo()` ya importado en esos archivos). Documenta el cambio en el commit.

- [ ] **Step 4: Commit (si hubo cambios; si no, omite)**

```bash
git add apps/web/src/lib/produccion.ts apps/web/src/lib/cascadaDemo.ts
git commit -m "chore(web): ruta explícita del banco de imágenes en los roots de producción/demo"
```

---

### Task 7: Curar el set semilla (Matemática 1º-2º + transversales)

**Files:**
- Create: `scripts/curar-imagenes.mjs`
- Create: `packages/infra-export/assets/imagenes/**` (PNGs curados)
- Modify: `packages/domain/src/imagenes/catalogo.ts` (`CATALOGO_IMAGENES` con las entradas reales)

> Esta task NO es TDD (es obtención + curación de assets, con decisión visual humana). Su "test" son los criterios de aceptación + la suite verde.

- [ ] **Step 1: Escribe el script de curación**

`scripts/curar-imagenes.mjs`: dado un manifiesto de tópicos `{ topico, materia|null, tramo, tipo, query, fuente }`, descarga el recurso (Openclipart CC0 para `linea_bn`; Pixabay API / unDraw para `color`), **rasteriza SVG→PNG** (resvg o sharp) a tamaño estándar (line-art ~800×800 px B&N; color ~1200×900 px) en `packages/infra-export/assets/imagenes/<materia|transversal>/<id>.png`, y emite las entradas del catálogo a stdout para pegarlas en `catalogo.ts`. Sin claves embebidas: la de Pixabay se lee de `process.env.PIXABAY_API_KEY`. Si una dependencia (sharp/resvg) no está, el script avisa y NO inventa: lista lo que falta.

- [ ] **Step 2: Define el manifiesto de tópicos semilla**

~20-30 tópicos. Transversales (`materia: null`): `numero_0..numero_10`, `conteo`, `mas`, `menos`, `igual`, `circulo`, `cuadrado`, `triangulo`, `manzana`, `pelota`, `lapiz`. Matemática 1-2 (`materia: 'Matemática'`): `decena`, `suma`, `resta`, `figuras_2d`, `patron`, `comparar_cantidades`. Para cada uno, ambos tipos cuando aplique (B&N para pintar + color para ilustrar).

- [ ] **Step 3: Ejecuta la curación y revisa visualmente**

Run: `node scripts/curar-imagenes.mjs` (con `PIXABAY_API_KEY` si se usa Pixabay).
Revisa cada PNG: que el line-art sea "pintable" (contornos limpios, sin relleno) y la ilustración apropiada para niños. **Descarta** lo dudoso (esta revisión es el filtro de seguridad).

- [ ] **Step 4: Pega las entradas reales en el catálogo**

Reemplaza el `CATALOGO_IMAGENES` semilla de Task 1 por las entradas emitidas (manteniendo el formato `EntradaImagenT`). Verifica integridad:

Run: `pnpm --filter @faro/domain exec vitest run src/imagenes/catalogo.test.ts`
Expected: PASS (ids únicos, fuentes permitidas, todas validan).

- [ ] **Step 5: Smoke (opcional, requiere servidores arriba)**

Con Docker + `pnpm seed` + `pnpm dev`: genera un PPT infantil de Matemática 1º desde la UI. Confirma que las slides muestran **imágenes reales** (no el recuadro punteado) donde la IA puso un `topico_imagen` válido, y que las demás caen al placeholder sin romper.

- [ ] **Step 6: Commit**

```bash
git add scripts/curar-imagenes.mjs packages/infra-export/assets/imagenes packages/domain/src/imagenes/catalogo.ts
git commit -m "feat(imagenes): set semilla curado (Matemática 1º-2º + transversales) + script de curación"
```

---

### Task 8: Verificación global

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Typecheck completo**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 2: Suite completa**

Run: `pnpm test`
Expected: todos verdes (los ~308 previos + los nuevos de catálogo/resolver/claseDeck/adapter/use case). Ningún test roto.

- [ ] **Step 3: Lint de los paquetes tocados**

Run: `pnpm exec eslint packages/domain/src/imagenes packages/infra-export/src/pptx packages/application/src/aula/cascada --max-warnings 0`
Expected: sin salida. Sin `any`, sin `console.log`.

---

## Self-Review (hecho)

**1. Spec coverage** (contra `2026-06-21-banco-imagenes-design.md`):
- §3 catálogo versionado → Task 1. §4 cómo elige la IA (schema + inyección) → Tasks 3, 5. §5 resolución determinista → Task 2. §6 integración export PPT → Task 4 (el de **guías** queda al Plan 2 hermano, ver abajo). §7 curación + set semilla → Task 7. §8 licencias → Task 1 (test de fuentes permitidas) + Task 7. §10 testing → cada task trae sus tests; Task 8 cierra global.
- **Gap deliberado:** §6/§11 "cableado a guías (B&N)" NO está en este plan — es el **Plan 2** (reusa `EntradaImagen`/`resolverImagen` ya construidos; toca `ItemPrueba.topico_imagen`, `INSTR_GUIA` y `planoGuia.ts`). Se explicita para no leerlo como cobertura.

**2. Placeholder scan:** sin "TBD/TODO/etc." Las imágenes reales del set las produce Task 7 (no es placeholder: es una task con criterios). El `CATALOGO_IMAGENES` semilla de Task 1 es real y válido; Task 7 lo amplía.

**3. Type consistency:** `EntradaImagenT`, `TipoImagen`, `TramoImagen`, `topicosDisponiblesPara`/`resolverImagen` (API real) y `topicosDisponiblesEn`/`resolverImagenEn` (variantes testeables con catálogo inyectado) usados consistentemente entre Tasks 1, 2, 4 y 5. `placeholderImagen(slide, s, tema, deck)` con la firma nueva propagada a los 3 call-sites en Task 4. `entradaDeckInfantil(unidad, tramo, topicosColor)` consistente entre Task 5 (def) y el use case (uso).
