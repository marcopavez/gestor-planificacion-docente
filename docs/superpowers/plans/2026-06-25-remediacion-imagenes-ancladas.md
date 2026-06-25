# Remediación de imágenes ancladas (Plan 2 de 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la **prueba**, la **guía** y el **PPT infantil** ilustraciones **line-art generadas por IA y ancladas al contenido** (reusando el pipeline line-art ya existente para ficha/lámina), más #5 (las preguntas de conteo MUESTRAN los objetos a contar y NO revelan la cantidad en las opciones) y #7 (eliminar la fuga de "Sugerencia de imagen" en las notas del PPT). Es la fase 2 de 2: el Plan 1 (`2026-06-25-remediacion-calidad-generacion.md`) ya cerró el anclaje ficha/lámina (#1), el dedup (#3) y la calibración por tramo (#4).

**Architecture:** Una clave de cache nueva en `domain` (`claveIlustracion`), un resolver reutilizable en `application` (`ResolverIlustracionUseCase`, hermano de `ResolverDibujoUseCase`), dos campos opcionales en los schemas `ItemPrueba` y `SlideDeck`, un helper de resolución por job, el cableado en los tres `ProcesarTrabajo*UseCase` (la resolución de imágenes va como PASO **fuera** de la transacción), el wiring en el worker, y la inserción del PNG real en los tres exports (docx de prueba/guía + pptx). Todo se valida sin red (mocks de `LlmPort`/`ImageGenPort`; el banco mockeado en memoria; los adapters con un `dirBanco` de fixture). Los `Generar*UseCase` son LLM-only y **no** cambian de constructor: la resolución de imágenes vive en los `ProcesarTrabajo*UseCase`, igual que la ficha hoy resuelve su dibujo dentro de su use case.

**Tech Stack:** TypeScript strict, monorepo pnpm, Vitest, Zod. Generación híbrida vía `LlmPort`; imágenes vía `ImageGenPort` (line-art) + `BancoImagenesGeneradasPort` (cache file-backed). Export `.docx`/`.pptx` vía `docx`/`pptxgenjs`.

## Global Constraints

- **Regla hexagonal:** `domain` y `application` NUNCA importan de `@faro/infra-*`. El dominio se testea **sin red**. `infra`/`apps` dependen de `application`/`domain`, nunca al revés.
- **HIL borrador by-design:** todo artefacto sigue naciendo `borrador`; estos cambios no alteran el estado. La IA propone (la descripción de la imagen); el docente revisa.
- **Degradación sin API key:** sin `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `crearImageGen` devuelve un `ImageGen` cuyo `generarLineArt` retorna `null`; el resolver devuelve `null`, el ítem/slide NO gana `imagen_clave`, y el export cae al placeholder de texto actual. El artefacto sale igual, en `borrador`.
- **Atomicidad:** la generación de imágenes (red/IO del proveedor) va **antes** de `uow.enTransaccion(...)`, nunca dentro. Si el proveedor lanza un error transitorio, el job reintenta (el `try` ya existe en cada `ProcesarTrabajo*`).
- **Sin `any` injustificado; sin `console.log`. Conventional Commits.**
- **Verde antes de cada commit:** corre desde la raíz `pnpm exec vitest run <ruta>` (la suite del archivo/paquete), y al cierre `pnpm typecheck` + `pnpm lint` (eslint `--max-warnings 0`). `pnpm -r typecheck/lint` NO cubre `packages/*` — usa los scripts root.
- **Riesgo conocido — cantidades exactas (spec §4):** los modelos de imagen **no** dibujan cantidades exactas de forma confiable (el dibujo de los pájaros tenía ~16, no un número fijado). Por eso los ítems/slides de **conteo para pre-lectores** se formulan como **respuesta abierta** ("¿Cuántas ___ hay? Escribe el número") cuya respuesta se lee de la imagen y el/la docente confirma en la revisión (HIL) — NO multiple-choice con clave numérica fija. Esto se codifica en los prompts (Task 8), no en el schema.

---

### Task 1: `claveIlustracion` — clave de cache estable por descripción (domain)

Las ilustraciones de prueba/guía/PPT se cachean por la **descripción anclada** (no por `(oa, concepto)` como la ficha). Necesitamos una clave determinista, normalizada (trim, minúsculas, espacios colapsados) y segura como nombre de archivo. Reusamos el **mismo** FNV-1a de `claveDibujo.ts` para no divergir de hash; lo factorizamos en un helper compartido del módulo `imagenes/`.

**Files:**
- Create: `packages/domain/src/imagenes/fnv1a.ts`
- Create: `packages/domain/src/imagenes/claveIlustracion.ts`
- Modify: `packages/domain/src/imagenes/claveDibujo.ts` (usa el helper compartido en vez del FNV-1a inline)
- Modify: `packages/domain/src/index.ts` (exporta `claveIlustracion`)
- Test: `packages/domain/src/imagenes/claveIlustracion.test.ts`

**Interfaces:**
- Produces: `claveIlustracion(descripcion: string): string` — hex de 8 chars, FNV-1a de `('ilustracion|' + descripcion.trim().toLowerCase().replace(/\s+/g,' '))`.
- Produces (helper interno): `fnv1aHex(s: string): string`.

Decisión (cierra spec §7.3): **factorizo** el FNV-1a en `fnv1a.ts` y lo comparten `claveDibujo` y `claveIlustracion` — el hash es idéntico en ambos, duplicarlo invitaría a divergencia silenciosa. El prefijo `'ilustracion|'` separa los espacios de claves (una ilustración y un dibujo de ficha con el mismo texto NO colisionan).

- [ ] **Step 1: Write the failing test**

Crea `packages/domain/src/imagenes/claveIlustracion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { claveIlustracion } from './claveIlustracion.js';

describe('claveIlustracion', () => {
  it('normaliza espacios y mayúsculas → misma clave', () => {
    const a = claveIlustracion('Siete estrellas en una entrada de show');
    const b = claveIlustracion('  siete   estrellas en una   ENTRADA de show  ');
    expect(a).toBe(b);
  });

  it('descripciones distintas dan claves distintas', () => {
    expect(claveIlustracion('siete estrellas')).not.toBe(claveIlustracion('cinco instrumentos'));
  });

  it('la clave es hex de 8 chars (segura como nombre de archivo)', () => {
    expect(claveIlustracion('una fila de cinco instrumentos')).toMatch(/^[0-9a-f]{8}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/imagenes/claveIlustracion.test.ts`
Expected: FAIL — `claveIlustracion` no existe (módulo no encontrado).

- [ ] **Step 3: Write minimal implementation**

Crea `packages/domain/src/imagenes/fnv1a.ts`:

```ts
// packages/domain/src/imagenes/fnv1a.ts
// FNV-1a 32-bit → hex de 8 chars. Compartido por claveDibujo (cache por OA/concepto) y
// claveIlustracion (cache por descripción anclada). Una sola implementación → no diverge el hash.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Hash FNV-1a 32-bit de `s`, como hex de 8 chars con padding (estable, seguro como nombre de archivo). */
export function fnv1aHex(s: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
```

Crea `packages/domain/src/imagenes/claveIlustracion.ts`:

```ts
// packages/domain/src/imagenes/claveIlustracion.ts
// Clave determinista del banco generado para ILUSTRACIONES ancladas (prueba/guía/PPT): hash de la
// DESCRIPCIÓN normalizada (no de OA/concepto como claveDibujo). Pura (INV-1), sin disco. El prefijo
// 'ilustracion|' separa el espacio de claves del de la ficha (no colisionan con claveDibujo).

import { fnv1aHex } from './fnv1a.js';

/** Clave hex (8 chars) de una ilustración por su descripción (trim, minúsculas, espacios colapsados). */
export function claveIlustracion(descripcion: string): string {
  const normal = `ilustracion|${descripcion.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  return fnv1aHex(normal);
}
```

Reescribe `packages/domain/src/imagenes/claveDibujo.ts` para usar el helper (comportamiento idéntico — la salida no cambia):

```ts
// packages/domain/src/imagenes/claveDibujo.ts
// Clave determinista del banco generado (cache por OA/concepto). Pura (INV-1), sin disco.
// FNV-1a 32-bit (helper compartido en fnv1a.ts) → hex estable, seguro como nombre de archivo.
// Plan 1 usa concepto='' (una lámina canónica por OA); Plan 2 pasa un concepto.

import { fnv1aHex } from './fnv1a.js';

/** Clave hex del dibujo para (oaCodigo, concepto). Determinista → cache reutilizable. */
export function claveDibujo(oaCodigo: string, concepto = ''): string {
  const normal = `${oaCodigo.trim()}|${concepto.trim().toLowerCase()}`;
  return fnv1aHex(normal);
}
```

En `packages/domain/src/index.ts`, justo después de la línea `export { claveDibujo } from './imagenes/claveDibujo.js';`, añade:

```ts
export { claveIlustracion } from './imagenes/claveIlustracion.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/domain/src/imagenes/claveIlustracion.test.ts packages/domain/src/imagenes/catalogo.test.ts`
Expected: PASS. Corre también la suite que usa `claveDibujo` para confirmar que el refactor no cambió la salida:
Run: `pnpm exec vitest run packages/application/src/aula/cascada/ResolverDibujoUseCase.test.ts packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts`
Expected: PASS (las claves siguen idénticas).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/imagenes/fnv1a.ts packages/domain/src/imagenes/claveIlustracion.ts packages/domain/src/imagenes/claveDibujo.ts packages/domain/src/imagenes/claveIlustracion.test.ts packages/domain/src/index.ts
git commit -m "feat(imagenes): claveIlustracion (cache por descripción) + FNV-1a compartido"
```

---

### Task 2: `ResolverIlustracionUseCase` — resolver anclado + cache (application)

Hermano de `ResolverDibujoUseCase` pero genérico: resuelve UNA ilustración line-art desde una **descripción anclada** (no de `(oa, concepto)`), con cache por `claveIlustracion`. Lo usarán prueba/guía/PPT vía el helper de la Task 3. Sin red en el test (dobles de `imageGen`/`banco`, como `ResolverDibujoUseCase.test.ts`).

**Files:**
- Create: `packages/application/src/aula/cascada/ResolverIlustracionUseCase.ts`
- Modify: `packages/application/src/index.ts` (export del use case + tipo de deps)
- Test: `packages/application/src/aula/cascada/ResolverIlustracionUseCase.test.ts`

**Interfaces:**
- Consumes: `ImageGenPort.generarLineArt(descripcion, { aspectRatio })`, `BancoImagenesGeneradasPort.buscar/guardar`, `claveIlustracion`, `IMAGENES_VERSION`, `MetaDibujo`, `OpcionesLineArt`.
- Produces: `class ResolverIlustracionUseCase` con `constructor(deps: { imageGen: ImageGenPort; banco: BancoImagenesGeneradasPort })` y `resolver(descripcion: string, oaCodigo: string, opts?: { aspectRatio?: OpcionesLineArt['aspectRatio'] }): Promise<string | null>` (devuelve la clave si hay PNG; `null` si degradado).
- Produces: `interface DependenciasResolverIlustracion`.

- [ ] **Step 1: Write the failing test**

Crea `packages/application/src/aula/cascada/ResolverIlustracionUseCase.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { BancoImagenesGeneradasPort, DibujoCacheado } from '@faro/domain';
import { claveIlustracion } from '@faro/domain';
import { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';

const DESC = 'siete estrellas en una entrada de show';

describe('ResolverIlustracionUseCase', () => {
  it('cache HIT: devuelve la clave sin llamar a generarLineArt', async () => {
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
    const cacheado: DibujoCacheado = { png: Buffer.from('x'), descripcion: DESC, concepto: DESC };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => cacheado), guardar: vi.fn(async () => {}) };

    const uc = new ResolverIlustracionUseCase({ imageGen, banco });
    const clave = await uc.resolver(DESC, 'MA01 OA 01');

    expect(clave).toBe(claveIlustracion(DESC));
    expect(imageGen.generarLineArt).not.toHaveBeenCalled();
    expect(banco.guardar).not.toHaveBeenCalled();
  });

  it('cache MISS: genera, guarda y devuelve la clave (aspectRatio 1:1 por defecto)', async () => {
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png-bytes')) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverIlustracionUseCase({ imageGen, banco });
    const clave = await uc.resolver(DESC, 'MA01 OA 01');

    expect(clave).toBe(claveIlustracion(DESC));
    expect(imageGen.generarLineArt).toHaveBeenCalledWith(DESC, { aspectRatio: '1:1' });
    expect(banco.guardar).toHaveBeenCalledOnce();
    const [claveGuardada, png, meta] = (banco.guardar as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(claveGuardada).toBe(claveIlustracion(DESC));
    expect(png).toEqual(Buffer.from('png-bytes'));
    expect(meta).toMatchObject({ oaCodigo: 'MA01 OA 01', descripcion: DESC, modelo: 'imagegen' });
  });

  it('sin API key (generarLineArt → null): devuelve null y NO guarda (degradación)', async () => {
    const imageGen = { generarLineArt: vi.fn(async () => null) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverIlustracionUseCase({ imageGen, banco });
    const clave = await uc.resolver(DESC, 'MA01 OA 01');

    expect(clave).toBeNull();
    expect(banco.guardar).not.toHaveBeenCalled();
  });

  it('respeta opts.aspectRatio cuando se pasa', async () => {
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverIlustracionUseCase({ imageGen, banco });
    await uc.resolver(DESC, 'MA01 OA 01', { aspectRatio: '16:9' });

    expect(imageGen.generarLineArt).toHaveBeenCalledWith(DESC, { aspectRatio: '16:9' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ResolverIlustracionUseCase.test.ts`
Expected: FAIL — `ResolverIlustracionUseCase` no existe (módulo no encontrado).

- [ ] **Step 3: Write minimal implementation**

Crea `packages/application/src/aula/cascada/ResolverIlustracionUseCase.ts`:

```ts
// packages/application/src/aula/cascada/ResolverIlustracionUseCase.ts
// Resolver genérico de ILUSTRACIONES line-art ancladas (prueba/guía/PPT). Hermano de ResolverDibujoUseCase,
// pero la clave es la DESCRIPCIÓN anclada (claveIlustracion), no (OA, concepto): la descripción ya conoce
// el enunciado/slide. cache HIT → reusa el PNG; MISS → Imagen dibuja → se cachea. Sin Imagen (sin API key)
// → png=null → devuelve null (degradación: el ítem/slide no gana imagen_clave; el export usa el placeholder).
// INV-5: importa SOLO de @faro/domain — nunca @faro/infra-*.

import type {
  BancoImagenesGeneradasPort,
  ImageGenPort,
  MetaDibujo,
  OpcionesLineArt,
} from '@faro/domain';
import { claveIlustracion, IMAGENES_VERSION } from '@faro/domain';

export interface DependenciasResolverIlustracion {
  readonly imageGen: ImageGenPort;
  readonly banco: BancoImagenesGeneradasPort;
}

export class ResolverIlustracionUseCase {
  private readonly imageGen: ImageGenPort;
  private readonly banco: BancoImagenesGeneradasPort;

  constructor(deps: DependenciasResolverIlustracion) {
    this.imageGen = deps.imageGen;
    this.banco = deps.banco;
  }

  /**
   * Resuelve la ilustración de `descripcion`; devuelve su clave de cache, o null si no se pudo generar
   * (sin API key). `oaCodigo` solo alimenta la metadata del banco (trazabilidad). `aspectRatio` default 1:1.
   */
  async resolver(
    descripcion: string,
    oaCodigo: string,
    opts?: { aspectRatio?: OpcionesLineArt['aspectRatio'] },
  ): Promise<string | null> {
    const clave = claveIlustracion(descripcion);

    const cacheado = await this.banco.buscar(clave);
    if (cacheado !== null) return clave;

    const png = await this.imageGen.generarLineArt(descripcion, { aspectRatio: opts?.aspectRatio ?? '1:1' });
    if (png === null) return null; // degradación: sin Imagen, no se cachea

    const meta: MetaDibujo = {
      oaCodigo,
      concepto: descripcion.slice(0, 80),
      descripcion,
      modelo: 'imagegen',
      imagenesVersion: IMAGENES_VERSION,
    };
    await this.banco.guardar(clave, png, meta);
    return clave;
  }
}
```

En `packages/application/src/index.ts`, después del bloque de `ResolverDibujoUseCase` (líneas ~42-43), añade:

```ts
export { ResolverIlustracionUseCase } from './aula/cascada/ResolverIlustracionUseCase.js';
export type { DependenciasResolverIlustracion } from './aula/cascada/ResolverIlustracionUseCase.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ResolverIlustracionUseCase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/ResolverIlustracionUseCase.ts packages/application/src/aula/cascada/ResolverIlustracionUseCase.test.ts packages/application/src/index.ts
git commit -m "feat(imagenes): ResolverIlustracionUseCase (resolver anclado + cache compartida)"
```

---

### Task 3: `ItemPrueba` gana `imagen_clave` (domain)

La prueba (y la guía, que reusa `ItemPrueba`) necesitan llevar la **clave** del PNG resuelto, además de la `imagen` (descripción) ya existente que sigue siendo el alt-text / la base para generar. Campo opcional → backward-compatible. NO se añade al guard `fugaDeTextoEnItems`: la clave es corta (8 chars), no es texto libre de la IA.

**Files:**
- Modify: `packages/domain/src/schemas/prueba.ts` (`ItemPrueba`)
- Test: `packages/domain/src/schemas/prueba.test.ts`

**Interfaces:**
- Produces: `ItemPrueba` con `imagen_clave: z.string().optional()`. `ItemPruebaType` lo gana por inferencia.

- [ ] **Step 1: Write the failing test**

Añade a `packages/domain/src/schemas/prueba.test.ts` (importa `ItemPrueba` desde `./prueba.js` si no está ya importado en el archivo):

```ts
import { ItemPrueba } from './prueba.js';

describe('ItemPrueba.imagen_clave', () => {
  const base = {
    oa: 'MA01 OA 01',
    habilidad: 'recordar' as const,
    tipo: 'pictorico' as const,
    enunciado: '¿Cuántas estrellas hay? Escribe el número.',
    imagen: 'siete estrellas en una entrada de show',
  };

  it('parsea un ítem con imagen_clave (clave del PNG resuelto)', () => {
    const r = ItemPrueba.parse({ ...base, imagen_clave: 'a1b2c3d4' });
    expect(r.imagen_clave).toBe('a1b2c3d4');
  });

  it('parsea un ítem SIN imagen_clave (backward-compatible)', () => {
    const r = ItemPrueba.parse(base);
    expect(r.imagen_clave).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/schemas/prueba.test.ts`
Expected: FAIL — el primer `it` falla: `imagen_clave` no está en el schema, Zod lo elimina del objeto parseado → `r.imagen_clave` es `undefined`, no `'a1b2c3d4'`.

- [ ] **Step 3: Write minimal implementation**

En `packages/domain/src/schemas/prueba.ts`, dentro de `ItemPrueba`, justo después del campo `imagen` (línea ~35), añade:

```ts
  // Para 'pictorico': DESCRIPCIÓN placeholder de la imagen (misma filosofía que sugerencia_imagen del
  // deck) — nunca una imagen real. Es además el texto base para GENERAR la ilustración (alt-text).
  imagen: z.string().optional(),
  // Clave del PNG line-art resuelto desde `imagen` (la pone el ProcesarTrabajo*, no la IA). El export
  // resuelve <dirBanco>/<imagen_clave>.png; si falta, cae al placeholder de `imagen`. Opcional → back-compat.
  imagen_clave: z.string().optional(),
```

(Reemplaza el bloque de `imagen` existente por estos dos campos: el comentario de `imagen` se conserva y se añade `imagen_clave` debajo.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/domain/src/schemas/prueba.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/schemas/prueba.ts packages/domain/src/schemas/prueba.test.ts
git commit -m "feat(prueba): ItemPrueba gana imagen_clave (PNG resuelto) opcional"
```

---

### Task 4: `SlideDeck` gana `imagen`/`imagen_clave` y pierde `topico_imagen`/`sugerencia_imagen` (domain)

El deck pasa del catálogo de íconos (`topico_imagen` + `sugerencia_imagen`) a una **descripción anclada** (`imagen`) + su **clave** resuelta (`imagen_clave`). Zod ignora claves desconocidas → los decks viejos persistidos con `topico_imagen` siguen parseando (la clave extra se descarta). Eliminar `sugerencia_imagen` del schema borra la fuente de #7 de raíz.

**Files:**
- Modify: `packages/domain/src/schemas/claseDeck.ts` (`SlideDeck`)
- Test: `packages/domain/src/schemas/claseDeck.test.ts`

**Interfaces:**
- Produces: `SlideDeck` con `imagen: z.string().optional()` y `imagen_clave: z.string().optional()`, SIN `topico_imagen` ni `sugerencia_imagen`. `SlideDeckType` lo refleja.

- [ ] **Step 1: Write the failing test**

Añade a `packages/domain/src/schemas/claseDeck.test.ts` (importa `SlideDeck` desde `./claseDeck.js` si no está ya importado):

```ts
import { SlideDeck } from './claseDeck.js';

describe('SlideDeck imagen anclada (Plan 2)', () => {
  const base = {
    momento: 'inicio' as const,
    titulo: 'Contemos estrellas',
    contenido: ['¿Cuántas ves?'],
    notas_docente: 'La respuesta se lee de la imagen.',
  };

  it('parsea un slide con imagen (descripción) + imagen_clave (PNG resuelto)', () => {
    const r = SlideDeck.parse({ ...base, imagen: 'siete estrellas grandes', imagen_clave: 'a1b2c3d4' });
    expect(r.imagen).toBe('siete estrellas grandes');
    expect(r.imagen_clave).toBe('a1b2c3d4');
  });

  it('un slide viejo con topico_imagen/sugerencia_imagen sigue parseando (las claves extra se ignoran)', () => {
    const r = SlideDeck.parse({ ...base, topico_imagen: 'estrella', sugerencia_imagen: 'una recta numérica' });
    expect(r.titulo).toBe('Contemos estrellas');
    // Las claves viejas YA NO están en el tipo (Zod las descarta).
    expect((r as Record<string, unknown>)['sugerencia_imagen']).toBeUndefined();
    expect((r as Record<string, unknown>)['topico_imagen']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/schemas/claseDeck.test.ts`
Expected: FAIL — el primer `it` falla: `imagen`/`imagen_clave` no están en el schema → ambos quedan `undefined`.

- [ ] **Step 3: Write minimal implementation**

En `packages/domain/src/schemas/claseDeck.ts`, reemplaza el bloque de `SlideDeck` (las líneas de `sugerencia_imagen` + el comentario + `topico_imagen`) por los dos campos nuevos. El objeto `SlideDeck` queda así:

```ts
export const SlideDeck = z.object({
  momento: z.enum(['inicio', 'desarrollo', 'cierre']),
  titulo: z.string(),
  contenido: z.array(z.string()), // viñetas
  notas_docente: z.string(),
  // Descripción visual breve y CONCRETA, anclada al contenido del slide: la IA la propone para generar
  // una ilustración line-art (Plan 2). Reemplaza topico_imagen/sugerencia_imagen (catálogo de íconos).
  imagen: z.string().optional(),
  // Clave del PNG line-art resuelto desde `imagen` (la pone el ProcesarTrabajo*, no la IA). El export
  // resuelve <dirBanco>/<imagen_clave>.png; si falta, cae al placeholder visible. Opcional → back-compat.
  imagen_clave: z.string().optional(),
  // Tipo de slide (Fase 3): por defecto 'contenido' → backward-compatible con los decks ya generados.
  // 'pregunta'/'elige' llevan `opciones`; la correcta NO se revela en la slide (va en notas_docente).
  tipo: z.enum(['contenido', 'pregunta', 'que_sigue', 'elige']).default('contenido'),
  // Opciones para slides de interacción ('pregunta'/'elige'); vacío para el resto.
  opciones: z
    .array(z.object({ texto: z.string(), correcta: z.boolean() }))
    .default([]),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/domain/src/schemas/claseDeck.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/schemas/claseDeck.ts packages/domain/src/schemas/claseDeck.test.ts
git commit -m "feat(ppt): SlideDeck gana imagen/imagen_clave; retira topico_imagen/sugerencia_imagen"
```

---

### Task 5: Helper `resolverIlustraciones` para ítems y slides (application)

Helper compartido que mapea ítems/slides resolviendo su `imagen` a `imagen_clave`. Sin red en el test (un `ResolverIlustracionUseCase` doble con `resolver` mockeado).

**Files:**
- Create: `packages/application/src/aula/cascada/resolverIlustraciones.ts`
- Modify: `packages/application/src/index.ts` (export de los dos helpers)
- Test: `packages/application/src/aula/cascada/resolverIlustraciones.test.ts`

**Interfaces:**
- Consumes: `ResolverIlustracionUseCase.resolver(descripcion, oaCodigo)`, `ItemPruebaType`, `SlideDeckType`.
- Produces:
  - `resolverIlustracionesItems(items: readonly ItemPruebaType[], oaCodigo: string, ilustrador: ResolverIlustracionUseCase): Promise<ItemPruebaType[]>`
  - `resolverIlustracionesSlides(slides: readonly SlideDeckType[], oaCodigo: string, ilustrador: ResolverIlustracionUseCase): Promise<SlideDeckType[]>`

- [ ] **Step 1: Write the failing test**

Crea `packages/application/src/aula/cascada/resolverIlustraciones.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ItemPruebaType, SlideDeckType } from '@faro/domain';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
import { resolverIlustracionesItems, resolverIlustracionesSlides } from './resolverIlustraciones.js';

function ilustradorFijo(clave: string | null): ResolverIlustracionUseCase {
  return { resolver: vi.fn(async () => clave) } as unknown as ResolverIlustracionUseCase;
}

const itemConImagen: ItemPruebaType = {
  oa: 'MA01 OA 01',
  habilidad: 'recordar',
  tipo: 'pictorico',
  enunciado: '¿Cuántas estrellas hay? Escribe el número.',
  imagen: 'siete estrellas',
};
const itemSinImagen: ItemPruebaType = {
  oa: 'MA01 OA 01',
  habilidad: 'recordar',
  tipo: 'seleccion_multiple',
  enunciado: '¿Cuál es mayor?',
  alternativas: [{ texto: '3', correcta: false }, { texto: '5', correcta: true }],
};

describe('resolverIlustracionesItems', () => {
  it('los ítems con imagen ganan imagen_clave; los sin imagen quedan igual', async () => {
    const out = await resolverIlustracionesItems([itemConImagen, itemSinImagen], 'MA01 OA 01', ilustradorFijo('cafe1234'));
    expect(out[0]?.imagen_clave).toBe('cafe1234');
    expect(out[1]?.imagen_clave).toBeUndefined();
    expect(out[1]).toEqual(itemSinImagen);
  });

  it('si el ilustrador devuelve null, NO se añade imagen_clave (degradación)', async () => {
    const out = await resolverIlustracionesItems([itemConImagen], 'MA01 OA 01', ilustradorFijo(null));
    expect(out[0]?.imagen_clave).toBeUndefined();
    expect(out[0]?.imagen).toBe('siete estrellas');
  });

  it('un ítem con imagen vacía (string en blanco) no se resuelve', async () => {
    const ilustrador = ilustradorFijo('x');
    await resolverIlustracionesItems([{ ...itemConImagen, imagen: '   ' }], 'MA01 OA 01', ilustrador);
    expect(ilustrador.resolver).not.toHaveBeenCalled();
  });
});

describe('resolverIlustracionesSlides', () => {
  const slideConImagen: SlideDeckType = {
    momento: 'inicio',
    titulo: 'Contemos',
    contenido: ['¿Cuántas ves?'],
    notas_docente: 'La respuesta se lee de la imagen.',
    imagen: 'siete estrellas',
    tipo: 'contenido',
    opciones: [],
  };
  const slideSinImagen: SlideDeckType = {
    momento: 'cierre',
    titulo: 'Repaso',
    contenido: ['Listo'],
    notas_docente: 'Cierre.',
    tipo: 'contenido',
    opciones: [],
  };

  it('los slides con imagen ganan imagen_clave; los sin imagen quedan igual', async () => {
    const out = await resolverIlustracionesSlides([slideConImagen, slideSinImagen], 'MA01 OA 01', ilustradorFijo('beef5678'));
    expect(out[0]?.imagen_clave).toBe('beef5678');
    expect(out[1]?.imagen_clave).toBeUndefined();
    expect(out[1]).toEqual(slideSinImagen);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/resolverIlustraciones.test.ts`
Expected: FAIL — `resolverIlustraciones` no existe (módulo no encontrado).

- [ ] **Step 3: Write minimal implementation**

Crea `packages/application/src/aula/cascada/resolverIlustraciones.ts`:

```ts
// packages/application/src/aula/cascada/resolverIlustraciones.ts
// Helper compartido por los ProcesarTrabajo* (prueba/guía/PPT): resuelve la `imagen` (descripción anclada)
// de cada ítem/slide a su `imagen_clave` (PNG line-art cacheado) vía ResolverIlustracionUseCase. Va como
// PASO del job, FUERA de la transacción (la generación de imágenes hace red/IO). Degrada: si el resolver
// devuelve null (sin API key), el ítem/slide NO gana imagen_clave y el export usa el placeholder.
// INV-5: importa SOLO de @faro/domain y hermanos ./ — nunca @faro/infra-*.

import type { ItemPruebaType, SlideDeckType } from '@faro/domain';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';

/** Resuelve la ilustración de cada ítem con `imagen` no vacía → le añade `imagen_clave`. Resto: sin cambios. */
export async function resolverIlustracionesItems(
  items: readonly ItemPruebaType[],
  oaCodigo: string,
  ilustrador: ResolverIlustracionUseCase,
): Promise<ItemPruebaType[]> {
  return Promise.all(
    items.map(async (it) => {
      if (it.imagen === undefined || it.imagen.trim() === '') return it;
      const clave = await ilustrador.resolver(it.imagen, oaCodigo);
      return clave !== null ? { ...it, imagen_clave: clave } : it;
    }),
  );
}

/** Resuelve la ilustración de cada slide con `imagen` no vacía → le añade `imagen_clave`. Resto: sin cambios. */
export async function resolverIlustracionesSlides(
  slides: readonly SlideDeckType[],
  oaCodigo: string,
  ilustrador: ResolverIlustracionUseCase,
): Promise<SlideDeckType[]> {
  return Promise.all(
    slides.map(async (s) => {
      if (s.imagen === undefined || s.imagen.trim() === '') return s;
      const clave = await ilustrador.resolver(s.imagen, oaCodigo);
      return clave !== null ? { ...s, imagen_clave: clave } : s;
    }),
  );
}
```

En `packages/application/src/index.ts`, después del export de `ResolverIlustracionUseCase` (Task 2), añade:

```ts
export { resolverIlustracionesItems, resolverIlustracionesSlides } from './aula/cascada/resolverIlustraciones.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/resolverIlustraciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/resolverIlustraciones.ts packages/application/src/aula/cascada/resolverIlustraciones.test.ts packages/application/src/index.ts
git commit -m "feat(imagenes): helper resolverIlustraciones para ítems y slides"
```

---

### Task 6: `ProcesarTrabajoPruebaUseCase` resuelve las imágenes de la prueba (application)

El job de prueba gana la dependencia `ilustrador` y, dentro del `try` (después de generar, antes de la transacción), reemplaza `prueba.items` por la versión resuelta. El OA: el primer OA de la unidad (`unidad.oa[0]?.codigo ?? ''`). Los tests existentes inyectan un `ilustrador` que devuelve `null` (no cambia el comportamiento observado).

**Files:**
- Modify: `packages/application/src/aula/cascada/ProcesarTrabajoPruebaUseCase.ts`
- Test: `packages/application/src/aula/cascada/ProcesarTrabajoPruebaUseCase.test.ts`

**Interfaces:**
- Consumes: `ResolverIlustracionUseCase` (Task 2), `resolverIlustracionesItems` (Task 5).
- Produces: `DependenciasProcesarPrueba` gana `readonly ilustrador: ResolverIlustracionUseCase`.

- [ ] **Step 1: Write the failing test**

En `ProcesarTrabajoPruebaUseCase.test.ts`, primero adapta el helper `montar` para inyectar el `ilustrador` (un doble configurable) y añade un test nuevo. Cambia la firma de `montar` y su construcción del use case:

En la cabecera de imports añade `vi`:

```ts
import { describe, expect, it, vi } from 'vitest';
```

Importa el tipo del resolver:

```ts
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
```

Reemplaza la firma de `montar` y la construcción del `uc` (líneas ~91 y ~141):

```ts
function montar(opts: { doc: DocumentoGenerado | null; trabajos: (TrabajoPrueba | null)[]; claveIlustracion?: string | null }) {
```

```ts
  const ilustrador = {
    resolver: vi.fn(async () => opts.claveIlustracion ?? null),
  } as unknown as ResolverIlustracionUseCase;

  const uc = new ProcesarTrabajoPruebaUseCase({ jobs, documentos, generar, uow, ilustrador });
  return { uc, llamadas, ilustrador };
```

Cambia `pruebaGenerada` para que tenga un ítem pictórico con `imagen` (añade este ítem al array `items`, después del existente):

```ts
    {
      oa: 'CN05 OA 01',
      habilidad: 'comprender',
      tipo: 'pictorico',
      enunciado: '¿Cuántos árboles ves? Escribe el número.',
      imagen: 'tres árboles en un patio',
      retroalimentacion: 'Cuenta uno por uno.',
    },
```

Añade el test nuevo dentro del `describe`:

```ts
it('resuelve las imágenes de los ítems pictóricos y persiste imagen_clave (#3 imágenes)', async () => {
  const job: TrabajoPrueba = { id: 'job-img', payload: { planificacionDocumentoId: PLAN_DOC_ID }, intentos: 1 };
  const { uc, llamadas, ilustrador } = montar({ doc: planDoc(), trabajos: [job], claveIlustracion: 'cafe1234' });

  const r = await uc.ejecutarSiguiente('worker-1');

  expect(r.tipo).toBe('hecho');
  // El ilustrador se llamó con la descripción del ítem pictórico y el primer OA de la unidad.
  expect(ilustrador.resolver).toHaveBeenCalledWith('tres árboles en un patio', 'CN05 OA 01');
  // El payload persistido lleva la clave resuelta en el ítem pictórico.
  const payload = llamadas.crearBorrador[0]?.payload as { items: Array<{ tipo: string; imagen_clave?: string }> };
  const pictorico = payload.items.find((i) => i.tipo === 'pictorico');
  expect(pictorico?.imagen_clave).toBe('cafe1234');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ProcesarTrabajoPruebaUseCase.test.ts`
Expected: FAIL — el constructor aún no acepta `ilustrador` (error de tipos) y el use case no resuelve imágenes; el ítem pictórico no gana `imagen_clave`.

- [ ] **Step 3: Write minimal implementation**

En `ProcesarTrabajoPruebaUseCase.ts`:

Añade el import del resolver y el helper:

```ts
import type { GenerarPruebaFormativaUseCase } from './GenerarPruebaFormativaUseCase.js';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
import { resolverIlustracionesItems } from './resolverIlustraciones.js';
```

Añade la dependencia a `DependenciasProcesarPrueba` y al campo privado:

```ts
export interface DependenciasProcesarPrueba {
  readonly jobs: JobRepository;
  /** Para cargar el documento de planificación de origen (la unidad de la que deriva la prueba). */
  readonly documentos: DocumentoRepository;
  readonly generar: GenerarPruebaFormativaUseCase;
  /** Resuelve las ilustraciones line-art ancladas de los ítems pictóricos (cache compartida). */
  readonly ilustrador: ResolverIlustracionUseCase;
  readonly uow: UnidadDeTrabajo;
  /** Reintentos máximos antes de 'fallido' (incluye el intento en curso). Default 3. */
  readonly maxIntentos?: number;
}
```

```ts
  private readonly jobs: JobRepository;
  private readonly documentos: DocumentoRepository;
  private readonly generar: GenerarPruebaFormativaUseCase;
  private readonly ilustrador: ResolverIlustracionUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarPrueba) {
    this.jobs = deps.jobs;
    this.documentos = deps.documentos;
    this.generar = deps.generar;
    this.ilustrador = deps.ilustrador;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }
```

Dentro del `try`, después de `const { valor: prueba, meta } = await this.generar.ejecutarConMeta(unidad);` e inmediatamente antes de `const reporte = pedagogicalGate(prueba);`, inserta la resolución de imágenes (fuera de la transacción) y construye la prueba final:

```ts
      // Genera la prueba formativa (ítems + tabla anclados a OA por la IA; el resto fijo de la unidad).
      const { valor: pruebaBase, meta } = await this.generar.ejecutarConMeta(unidad);

      // Resuelve las ilustraciones line-art ancladas (FUERA de la tx: hace red/IO). El OA = primero de la
      // unidad (solo alimenta la metadata del banco). Degrada: sin API key, los ítems no ganan imagen_clave.
      const oaCodigo = unidad.oa[0]?.codigo ?? '';
      const items = await resolverIlustracionesItems(pruebaBase.items, oaCodigo, this.ilustrador);
      const prueba = { ...pruebaBase, items };

      // Gate pedagógico determinista (sin red): ítem→OA, una correcta, puntajes si hay ponderación.
      const reporte = pedagogicalGate(prueba);
```

(El resto del bloque — `crearBorrador({ ..., payload: prueba, ... })`, la traza y `marcarHecho` — no cambia: `prueba` ahora lleva los `imagen_clave`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ProcesarTrabajoPruebaUseCase.test.ts`
Expected: PASS (los tests existentes pasan: el ilustrador default devuelve `null`, así que el ítem sin imagen no cambia; el camino feliz sigue intacto).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/ProcesarTrabajoPruebaUseCase.ts packages/application/src/aula/cascada/ProcesarTrabajoPruebaUseCase.test.ts
git commit -m "feat(prueba): el job resuelve las ilustraciones line-art de los ítems pictóricos"
```

---

### Task 7: `ProcesarTrabajoGuiaUseCase` y `ProcesarTrabajoPptInfantilUseCase` resuelven imágenes (application)

Mismo patrón que la Task 6 en los otros dos jobs. La guía reusa `ItemPrueba` (su `guia.ejercicios` + `guia.desafio`), pero NO podemos reasignar `guia.ejercicios` y `guia.desafio` por separado sin perder el tipo; resolvemos cada uno. El PPT resuelve `deck.slides`. El OA: guía → `oa.codigo` del contexto; PPT → primer OA de la unidad.

**Files:**
- Modify: `packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.ts`
- Modify: `packages/application/src/aula/cascada/ProcesarTrabajoPptInfantilUseCase.ts`
- Test: `packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.test.ts`
- Test: `packages/application/src/aula/cascada/ProcesarTrabajoPptInfantilUseCase.test.ts`

**Interfaces:**
- Consumes: `ResolverIlustracionUseCase`, `resolverIlustracionesItems`, `resolverIlustracionesSlides`.
- Produces: `DependenciasProcesarGuia` y `DependenciasProcesarPptInfantil` ganan `readonly ilustrador: ResolverIlustracionUseCase`.

- [ ] **Step 1: Write the failing test**

**Guía** — en `ProcesarTrabajoGuiaUseCase.test.ts`, en el helper `dobles()`, añade el ilustrador y pásalo al construir el `uc` en cada test. Como `dobles()` no construye el `uc` (cada test lo construye), añade el doble al objeto retornado:

En el `return` de `dobles()` añade:

```ts
  const ilustrador = { resolver: vi.fn(async () => null) } as unknown as import('./ResolverIlustracionUseCase.js').ResolverIlustracionUseCase;
  return { jobs, oas, uow, crearBorrador, registrar, borradores, ilustrador };
```

Y en cada `new ProcesarTrabajoGuiaUseCase({ ... })` de los tests existentes, añade `ilustrador` al objeto (desestructúralo de `dobles()` donde haga falta). Por ejemplo, en el primer test:

```ts
    const { jobs, oas, uow, crearBorrador, registrar, borradores, ilustrador } = dobles();
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas,
      generar: new GenerarGuiaUseCase({ /* ...igual... */ }),
      uow,
      ilustrador,
    });
```

Añade un test nuevo que verifica que la guía resuelve la imagen de un ejercicio pictórico. Para esto, el `guiaIa` necesita un ejercicio con `imagen`; añade al array `ejercicios` un segundo ítem:

```ts
    {
      oa: 'CN03 OA 01',
      habilidad: 'recordar' as const,
      tipo: 'pictorico' as const,
      enunciado: '¿Cuántas hojas hay? Escribe el número.',
      imagen: 'cuatro hojas de árbol',
      retroalimentacion: 'Cuenta una por una.',
    },
```

Nota: `INSTR_GUIA` prohíbe `pictorico` en el prompt, pero el schema lo acepta; este test ejercita el cableado del job, no el prompt. Y el test nuevo:

```ts
it('resuelve la imagen de un ejercicio pictórico y persiste imagen_clave', async () => {
  const { jobs, oas, uow, borradores } = dobles();
  const ilustrador = { resolver: vi.fn(async () => 'beef5678') } as unknown as import('./ResolverIlustracionUseCase.js').ResolverIlustracionUseCase;
  const uc = new ProcesarTrabajoGuiaUseCase({
    jobs: jobs as JobRepository,
    oas,
    generar: new GenerarGuiaUseCase({
      async generar(args) {
        return { parsed: args.schema.parse(guiaIa), stopReason: 'end_turn', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, modelo: 'muestras' };
      },
    }),
    uow,
    ilustrador,
  });

  const r = await uc.ejecutarSiguiente('w-1');
  expect(r.tipo).toBe('hecho');
  expect(ilustrador.resolver).toHaveBeenCalledWith('cuatro hojas de árbol', 'CN03 OA 01');
  const payload = borradores[0]?.payload as { ejercicios: Array<{ tipo: string; imagen_clave?: string }> };
  const pictorico = payload.ejercicios.find((e) => e.tipo === 'pictorico');
  expect(pictorico?.imagen_clave).toBe('beef5678');
});
```

**PPT** — en `ProcesarTrabajoPptInfantilUseCase.test.ts`, igual que la prueba: añade `vi` al import, importa el tipo del resolver, cambia `montar` para aceptar `claveIlustracion?` e inyectar el `ilustrador`, y añade `imagen` al slide de `deckGenerado`.

Cambia el import:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
```

En `deckGenerado`, al slide existente añade `imagen: 'tres semillas germinando'`.

Cambia la firma de `montar` y la construcción:

```ts
function montar(opts: { doc: DocumentoGenerado | null; trabajos: (TrabajoPptInfantil | null)[]; claveIlustracion?: string | null }) {
```

```ts
  const ilustrador = {
    resolver: vi.fn(async () => opts.claveIlustracion ?? null),
  } as unknown as ResolverIlustracionUseCase;
  const uc = new ProcesarTrabajoPptInfantilUseCase({ jobs, documentos, generar, uow, ilustrador });
  return { uc, llamadas, ilustrador };
```

Y el test nuevo:

```ts
it('resuelve las imágenes de los slides y persiste imagen_clave', async () => {
  const job: TrabajoPptInfantil = { id: 'job-img', payload: { planificacionDocumentoId: PLAN_DOC_ID }, intentos: 1 };
  const { uc, llamadas, ilustrador } = montar({ doc: planDoc(), trabajos: [job], claveIlustracion: 'd00d1234' });

  const r = await uc.ejecutarSiguiente('worker-1');

  expect(r.tipo).toBe('hecho');
  expect(ilustrador.resolver).toHaveBeenCalledWith('tres semillas germinando', 'CN05 OA 01');
  const payload = llamadas.crearBorrador[0]?.payload as { slides: Array<{ imagen_clave?: string }> };
  expect(payload.slides[0]?.imagen_clave).toBe('d00d1234');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.test.ts packages/application/src/aula/cascada/ProcesarTrabajoPptInfantilUseCase.test.ts`
Expected: FAIL — ambos constructores aún no aceptan `ilustrador` (error de tipos) y no resuelven imágenes.

- [ ] **Step 3: Write minimal implementation**

En `ProcesarTrabajoPptInfantilUseCase.ts`:

Imports:

```ts
import { SchemaPlanificacionUnidad } from '@faro/domain';
import type { GenerarPptInfantilUseCase } from './GenerarPptInfantilUseCase.js';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
import { resolverIlustracionesSlides } from './resolverIlustraciones.js';
```

Deps + campo + constructor (igual patrón que la prueba):

```ts
export interface DependenciasProcesarPptInfantil {
  readonly jobs: JobRepository;
  /** Para cargar el documento de planificación de origen (la unidad de la que deriva el deck). */
  readonly documentos: DocumentoRepository;
  readonly generar: GenerarPptInfantilUseCase;
  /** Resuelve las ilustraciones line-art ancladas de los slides (cache compartida). */
  readonly ilustrador: ResolverIlustracionUseCase;
  readonly uow: UnidadDeTrabajo;
  /** Reintentos máximos antes de 'fallido' (incluye el intento en curso). Default 3. */
  readonly maxIntentos?: number;
}
```

```ts
  private readonly generar: GenerarPptInfantilUseCase;
  private readonly ilustrador: ResolverIlustracionUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarPptInfantil) {
    this.jobs = deps.jobs;
    this.documentos = deps.documentos;
    this.generar = deps.generar;
    this.ilustrador = deps.ilustrador;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }
```

Dentro del `try`, reemplaza el bloque de generación por:

```ts
      // Genera el deck infantil (slides anclados a la unidad por la IA; tema/oa fijos de la unidad).
      // El use case revalida el deck contra SchemaClaseDeck al ensamblarlo (su gate es el schema).
      const { valor: deckBase, meta } = await this.generar.ejecutarConMeta(unidad);

      // Resuelve las ilustraciones line-art ancladas de los slides (FUERA de la tx: hace red/IO). El OA =
      // primero de la unidad (solo alimenta la metadata del banco). Degrada sin API key (no añade clave).
      const oaCodigo = unidad.oa[0]?.codigo ?? '';
      const slides = await resolverIlustracionesSlides(deckBase.slides, oaCodigo, this.ilustrador);
      const deck = { ...deckBase, slides };
```

(El resto — `crearBorrador({ ..., payload: deck, ... })` etc. — no cambia.)

En `ProcesarTrabajoGuiaUseCase.ts`:

Imports:

```ts
import { GeneracionError, guiaGate } from '@faro/domain';
import type { ContextoCascada } from './tipos.js';
import type { GenerarGuiaUseCase } from './GenerarGuiaUseCase.js';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';
import { resolverIlustracionesItems } from './resolverIlustraciones.js';
```

Deps + campo + constructor:

```ts
export interface DependenciasProcesarGuia {
  readonly jobs: JobRepository;
  /** Para cargar el OA del corpus publicado (resuelve la corpus_version vigente). */
  readonly oas: OaRepository;
  readonly generar: GenerarGuiaUseCase;
  /** Resuelve las ilustraciones line-art ancladas de los ejercicios pictóricos (cache compartida). */
  readonly ilustrador: ResolverIlustracionUseCase;
  readonly uow: UnidadDeTrabajo;
  /** Reintentos máximos antes de 'fallido' (incluye el intento en curso). Default 3. */
  readonly maxIntentos?: number;
}
```

```ts
  private readonly generar: GenerarGuiaUseCase;
  private readonly ilustrador: ResolverIlustracionUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarGuia) {
    this.jobs = deps.jobs;
    this.oas = deps.oas;
    this.generar = deps.generar;
    this.ilustrador = deps.ilustrador;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }
```

Dentro del `try`, reemplaza el bloque de generación por:

```ts
      // Genera la guía híbrida (explicacion/ejemplo/ejercicios → IA; resto fijo en GenerarGuiaUseCase).
      const { valor: guiaBase, meta } = await this.generar.ejecutarConMeta(ctx, conocimiento);

      // Resuelve las ilustraciones line-art de los ejercicios pictóricos (FUERA de la tx: hace red/IO).
      // El OA = el del payload. Degrada sin API key. El `desafio` (si hay) también se resuelve, junto a
      // los ejercicios, para no perder su ilustración.
      const ejerciciosResueltos = await resolverIlustracionesItems(guiaBase.ejercicios, oaCodigo, this.ilustrador);
      const desafioResuelto = guiaBase.desafio !== undefined
        ? (await resolverIlustracionesItems([guiaBase.desafio], oaCodigo, this.ilustrador))[0]
        : undefined;
      const guia = {
        ...guiaBase,
        ejercicios: ejerciciosResueltos,
        ...(desafioResuelto !== undefined ? { desafio: desafioResuelto } : {}),
      };
```

(El resto — `crearBorrador({ ..., payload: guia, ... })`, la traza con `guiaGate(guia)`, `marcarHecho` — no cambia. `oaCodigo` ya existe en el scope: se desestructura del payload arriba en el método.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.test.ts packages/application/src/aula/cascada/ProcesarTrabajoPptInfantilUseCase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.ts packages/application/src/aula/cascada/ProcesarTrabajoPptInfantilUseCase.ts packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.test.ts packages/application/src/aula/cascada/ProcesarTrabajoPptInfantilUseCase.test.ts
git commit -m "feat(guia,ppt): los jobs resuelven las ilustraciones line-art ancladas"
```

---

### Task 8: Prompts — imagen anclada, conteo abierto y no-revelar (application `generacion.ts`)

Ajusta los prompts: (a) `INSTR_PRUEBA` describe `imagen` como descripción visual concreta y formula el conteo pre-lector como respuesta abierta; (b) `INSTR_DECK_INFANTIL` reemplaza la instrucción de `topico_imagen` por la descripción `imagen` + la regla #5 (no revelar la cantidad en las opciones); (c) `entradaDeckInfantil` pierde la lista de tópicos (firma a 2 args); (d) `GenerarPptInfantilUseCase` deja de calcular `topicosDisponiblesPara`. Tests de presencia (como en Plan 1).

**Files:**
- Modify: `packages/application/src/aula/cascada/generacion.ts` (`INSTR_PRUEBA`, `INSTR_DECK_INFANTIL`, `entradaDeckInfantil`)
- Modify: `packages/application/src/aula/cascada/GenerarPptInfantilUseCase.ts` (caller de `entradaDeckInfantil`)
- Test: `packages/application/src/aula/cascada/generacion.test.ts`

**Interfaces:**
- Produces: `entradaDeckInfantil(unidad: PlanificacionUnidad, tramo: '1-2' | '3-4' | '5-6'): string` (sin `topicosColor`).
- Produces: `INSTR_PRUEBA.texto` y `INSTR_DECK_INFANTIL.texto` con las reglas nuevas.

Nota de compatibilidad con Plan 1: el Plan 1 (Task C4) ya reescribió `INSTR_PRUEBA` con la regla de unicidad y la calibración por tramo. Este paso **añade** a ese `INSTR_PRUEBA` la regla de `imagen` concreta + conteo abierto, conservando los bullets de Plan 1. El código de abajo es el array COMPLETO resultante (Plan 1 + Plan 2). Si al implementar el `INSTR_PRUEBA` actual no contiene los bullets de Plan 1 (porque Plan 1 no se aplicó en este árbol), usa igualmente este array completo — incluye ambas tandas de reglas.

- [ ] **Step 1: Write the failing test**

Crea o extiende `packages/application/src/aula/cascada/generacion.test.ts`. Si el archivo ya existe (Plan 1 lo creó), añade SOLO estos bloques; si no, créalo con la cabecera de imports del Plan 1. Añade:

```ts
import { INSTR_DECK_INFANTIL, INSTR_PRUEBA, entradaDeckInfantil } from './generacion.js';
import type { PlanificacionUnidad } from '@faro/domain';

const unidadMinDeck = {
  unidad: 'U1', asignatura: 'Matemática', nivel: '1º básico', establecimiento: 'Colegio Demo', oa: [],
} as unknown as PlanificacionUnidad;

describe('INSTR_PRUEBA (imágenes ancladas + conteo abierto)', () => {
  it('describe imagen como descripción visual concreta y depictable', () => {
    expect(INSTR_PRUEBA.texto).toContain("'imagen' = una DESCRIPCIÓN visual CONCRETA");
  });
  it('formula el conteo de pre-lectores como respuesta abierta (no clave numérica fija)', () => {
    expect(INSTR_PRUEBA.texto).toContain('Escribe el número');
  });
});

describe('INSTR_DECK_INFANTIL (imagen anclada + no revelar conteo)', () => {
  it('pide una DESCRIPCIÓN visual en "imagen" (no un tópico de catálogo)', () => {
    expect(INSTR_DECK_INFANTIL.texto).toContain("pon en 'imagen' una DESCRIPCIÓN visual");
  });
  it('prohíbe revelar la cantidad en las opciones de conteo (#5)', () => {
    expect(INSTR_DECK_INFANTIL.texto).toContain('NO deben revelar la cantidad');
  });
  it('ya NO menciona topico_imagen', () => {
    expect(INSTR_DECK_INFANTIL.texto).not.toContain('topico_imagen');
  });
});

describe('entradaDeckInfantil (sin catálogo de tópicos)', () => {
  it('ya no inyecta la lista de tópicos de imagen', () => {
    expect(entradaDeckInfantil(unidadMinDeck, '1-2')).not.toContain('Tópicos de imagen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts`
Expected: FAIL — las cláusulas nuevas no existen y `entradaDeckInfantil` aún acepta 3 args / inyecta tópicos.

- [ ] **Step 3: Write minimal implementation**

En `generacion.ts`, reemplaza `INSTR_PRUEBA` completo por (incluye los bullets de Plan 1 + los nuevos de Plan 2):

```ts
export const INSTR_PRUEBA = instruccion(
  [
    'Genera una evaluación FORMATIVA (para aprender, no para calificar) anclada a los OA de la unidad.',
    "- 'tipo_evaluacion': 'formativa' (úsala salvo que se pida 'diagnostica').",
    "- 'tabla_especificaciones': una fila por OA evaluado (n_items; el puntaje es opcional en formativa).",
    '- Cada ítem tributa a un OA de la unidad; selección múltiple y verdadero/falso con EXACTAMENTE una alternativa correcta.',
    "- Puedes usar tipos variados apropiados al nivel: 'seleccion_multiple', 'verdadero_falso', 'completacion', 'desarrollo', 'ordenar' (con 'secuencia_correcta'), 'terminos_pareados' (con 'pares' columnaA↔columnaB) y 'pictorico'.",
    "- En un ítem 'pictorico', 'imagen' = una DESCRIPCIÓN visual CONCRETA y depictable de lo que se ve (objetos/escena), anclada al enunciado (p. ej. 'siete estrellas en una entrada de show'; 'una fila de cinco instrumentos: guitarra, tambor, flauta, trompeta, violín'). NO es una imagen real; es la descripción con la que se genera la ilustración line-art.",
    '- CONTEO en pre-lectores (tramo 1-2): formula la pregunta como RESPUESTA ABIERTA ("¿Cuántas ___ hay? Escribe el número") cuya respuesta se LEE de la imagen; la pauta = la cantidad dibujada, que el/la docente confirma. NO uses selección múltiple con un número fijo como clave (los modelos de imagen no dibujan cantidades exactas de forma confiable).',
    "- Cada campo de texto contiene SOLO el contenido del ítem para el estudiante: NUNCA escribas notas para ti, razonamiento, ni instrucciones de formato dentro de un campo (sobre todo en 'imagen').",
    '- Cada ítem evalúa algo DISTINTO: no repitas el mismo enunciado en dos ítems (ni la misma pregunta cambiando sólo la imagen).',
    "- El corazón formativo: cada ítem lleva 'retroalimentacion' = qué orientar al estudiante si falla.",
    "- 'perfil_nivel' según el tramo de edad ('1-2' para 1º–2º básico, '3-4', '5-6', o 'generico').",
    '- Calibración por TRAMO DE EDAD (viene en la entrada del usuario):',
    '  · Tramo 1-2 (pre-lectores): enunciados MUY breves, pensados para que el/la docente los lea en voz alta; en selección múltiple usa MÁXIMO 2 alternativas; NO uses verdadero/falso con secuencias largas de números; NO uses "ordenar" con más de 3 elementos; incluye al menos un ítem pictórico con apoyo visual.',
    '  · Tramos 3-4 y 5-6: enunciados para lectores autónomos, con complejidad creciente según el tramo.',
    "- El puntaje es opcional: si lo incluyes en un ítem, inclúyelo también en su fila de la tabla y haz que cuadren.",
  ].join('\n'),
);
```

Reemplaza `INSTR_DECK_INFANTIL` completo por:

```ts
export const INSTR_DECK_INFANTIL = instruccion(
  [
    'Genera los SLIDES de un PPT INFANTIL (niños de 6 a 12 años) para proyectar una clase, derivado de su planificación de unidad.',
    'El tramo de edad (1-2 / 3-4 / 5-6 básico) viene en la entrada: ajusta el lenguaje a ese tramo.',
    '- Lenguaje simple, frases cortas y concretas; en el tramo 1-2 asume pre-lectores (texto que el/la docente lee en voz alta).',
    "- Secuencia los slides por momento: 'inicio' → 'desarrollo' → 'cierre' (sigue propósito y experiencias de la unidad).",
    "- Cada slide lleva su 'tipo':",
    "  · 'contenido' → titulo + contenido (viñetas muy breves, 1 idea por viñeta).",
    "  · 'pregunta' / 'elige' → una pregunta clara en 'titulo' y 2–4 'opciones' { texto, correcta }; marca EXACTAMENTE una 'correcta:true'. NO reveles la respuesta en el contenido: la respuesta correcta va SOLO en 'notas_docente'.",
    "  · 'que_sigue' → un slide de transición ('¿Qué sigue?') con pistas breves de lo que viene en 'contenido'.",
    "- Incluye 2–4 slides de interacción ('pregunta'/'elige') apoyadas en los OA e indicadores de la unidad.",
    "- 'notas_docente' para el/la docente: cómo guiar el slide y, en interacción, cuál es la respuesta correcta y por qué.",
    '- NO inventes OA ni alteres su texto; apóyate en el propósito, experiencias e indicadores de la unidad.',
    "- Si un slide se beneficia de una imagen, pon en 'imagen' una DESCRIPCIÓN visual breve y CONCRETA anclada al contenido del slide (qué se ve), para generar una ilustración line-art. En slides de conteo, describe los N objetos a contar dentro de la escena (p. ej. 'siete estrellas grandes en fila').",
    "- En slides de conteo, las 'opciones' NO deben revelar la cantidad (nada de '★★★ (3 estrellas)'): la cantidad se ve en la imagen; las opciones son sólo el número o la etiqueta.",
    "- Completa también 'titulo' (del deck), 'asignatura', 'nivel' y 'oa' (códigos de la unidad), pero la aplicación FIJA esos campos y el tema visual desde la planificación: tu aporte real son los slides.",
  ].join('\n'),
);
```

Reemplaza `entradaDeckInfantil` por la versión de 2 args (sin tópicos):

```ts
/** Entrada para el PPT infantil: la planificación completa + el tramo de edad que fija el lenguaje. */
export function entradaDeckInfantil(unidad: PlanificacionUnidad, tramo: '1-2' | '3-4' | '5-6'): string {
  return [
    `Unidad: ${unidad.unidad} (${unidad.asignatura} · ${unidad.nivel})`,
    `Tramo de edad: ${tramo} básico`,
    `Planificación de unidad (JSON):`,
    JSON.stringify(unidad),
    '',
    'Genera los slides del PPT infantil para esta unidad, anclados a su propósito, experiencias, OA e indicadores.',
  ].join('\n');
}
```

En `GenerarPptInfantilUseCase.ts`, elimina el cálculo de tópicos y la importación que ya no se usa. El import de `@faro/domain` pasa a:

```ts
import { SchemaClaseDeck, temaDeckInfantil, tramoDeNivel } from '@faro/domain';
```

(quita `topicosDisponiblesPara`). Elimina la línea `const topicosColor = topicosDisponiblesPara(unidad.asignatura, tramo, 'color');` y su comentario. Cambia la llamada a `entradaDeckInfantil`:

```ts
      entradaUsuario: entradaDeckInfantil(unidad, tramo),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts packages/application/src/aula/cascada/GenerarPptInfantilUseCase.test.ts`
Expected: PASS (el test del use case despacha por identidad del schema, no por `entradaUsuario`; sigue verde).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/generacion.ts packages/application/src/aula/cascada/GenerarPptInfantilUseCase.ts packages/application/src/aula/cascada/generacion.test.ts
git commit -m "feat(prompts): imagen anclada + conteo abierto (prueba) y no-revelar (#5, ppt sin catálogo)"
```

---

### Task 9: Worker wiring — un `ResolverIlustracionUseCase` para los tres jobs (apps/worker)

El worker ya construye `crearImageGen(...)` y el `banco` (`BancoImagenesFsAdapter`) para ficha/lámina. Construimos UN `ResolverIlustracionUseCase` con el mismo `imageGen` + `banco` y lo pasamos a los tres `ProcesarTrabajo` (prueba/guía/PPT).

**Files:**
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: `ResolverIlustracionUseCase` de `@faro/application`.
- Produces: las tres construcciones de `ProcesarTrabajo*UseCase` reciben `ilustrador`.

- [ ] **Step 1: (sin test unitario nuevo)** El wiring del composition root no tiene test unitario propio (es DI); la verificación es `pnpm typecheck` (Task 10) + los tests de integración del worker. Procede directo a la implementación.

- [ ] **Step 2: Write minimal implementation**

En `apps/worker/src/main.ts`, añade `ResolverIlustracionUseCase` a la lista de imports de `@faro/application` (orden alfabético dentro del bloque):

```ts
  ProcesarTrabajoPruebaUseCase,
  ProcesarTrabajoMaterialColorearUseCase,
  ResolverIlustracionUseCase,
} from '@faro/application';
```

El `imageGen` y el `banco` se construyen hoy en el bloque de "material para colorear" (líneas ~157-166), DESPUÉS de las construcciones de prueba/PPT/guía. Hay que construir el `ilustrador` ANTES de esas tres colas para poder pasárselo. Mueve la construcción de `imageGen`/`dirBanco`/`banco` hacia arriba (justo después de crear `oas`, antes de la cola de prueba) y crea el `ilustrador`:

Inserta, antes del comentario `// --- Cola de prueba formativa (Fase 4) ...`:

```ts
  // Imagen line-art (Imagen 4 Fast por defecto, o Gemini Flash Image si FARO_IMAGE_PROVIDER=flash) +
  // banco file-backed: compartidos por ficha/lámina y por las ilustraciones de prueba/guía/PPT. Sin API
  // key el adapter degrada (generarLineArt → null): los artefactos salen igual con placeholder.
  const { imageGen, modo: modoImg } = crearImageGen(
    {
      GEMINI_API_KEY: process.env['GEMINI_API_KEY'],
      GOOGLE_API_KEY: process.env['GOOGLE_API_KEY'],
      FARO_IMAGE_PROVIDER: process.env['FARO_IMAGE_PROVIDER'],
    },
    crearLoggerHijo('infra-ai'),
  );
  const dirBanco = join(raizRepo(), 'generated', 'imagenes-ia');
  const banco = new BancoImagenesFsAdapter(dirBanco);
  // Un solo resolver de ilustraciones ancladas para los tres jobs derivados (prueba/guía/PPT).
  const ilustrador = new ResolverIlustracionUseCase({ imageGen, banco });
```

Y ELIMINA el bloque duplicado de `crearImageGen`/`dirBanco`/`banco` que estaba dentro del comentario de "material para colorear" (líneas ~157-166), dejando ese comentario y el `materialColorearUseCase` usando las variables ya creadas arriba.

Pasa `ilustrador` a las tres construcciones:

```ts
  const pruebaUseCase = new ProcesarTrabajoPruebaUseCase({
    jobs: new JobRepositoryDrizzle(db),
    documentos: new DocumentoRepositoryDrizzle(db),
    generar: new GenerarPruebaFormativaUseCase(llm),
    ilustrador,
    uow: new UnidadDeTrabajoDrizzle(db),
  });
```

```ts
  const pptInfantilUseCase = new ProcesarTrabajoPptInfantilUseCase({
    jobs: new JobRepositoryDrizzle(db),
    documentos: new DocumentoRepositoryDrizzle(db),
    generar: new GenerarPptInfantilUseCase(llm),
    ilustrador,
    uow: new UnidadDeTrabajoDrizzle(db),
  });
```

```ts
  const guiaUseCase = new ProcesarTrabajoGuiaUseCase({
    jobs: new JobRepositoryDrizzle(db),
    oas,
    generar: new GenerarGuiaUseCase(llm),
    ilustrador,
    uow: new UnidadDeTrabajoDrizzle(db),
  });
```

(`modoImg` ya se loguea en `log.info({ workerId, modo, modoImg, samplesDir }, ...)`; ahora se calcula arriba, sin cambio en ese log.)

- [ ] **Step 3: Run test to verify (typecheck + worker integration)**

Run: `pnpm exec vitest run apps/worker`
Expected: PASS (los tests de integración del worker, si los hay, siguen verdes; el wiring compila en el siguiente typecheck).

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/main.ts
git commit -m "feat(worker): cablea ResolverIlustracionUseCase en prueba/guía/PPT"
```

---

### Task 10: Web wiring — `produccion()` typecheck con los exports nuevos (apps/web)

La web construye los export adapters de prueba/guía/PPT. Tras las Tasks 11-13 sus constructores cambian (PptxExport pierde `dirAssets`/gana `dirBanco`; Prueba/Guía ganan `dirBanco`). Esta task ajusta `produccion()` y los call-sites de test que construyen `PptxExportAdapter`. Se ejecuta DESPUÉS de los exports (orden lógico), pero se documenta aquí su alcance; el commit real va al final de la Task 13.

> **Nota de orden:** implementa primero Tasks 11-13 (exports), luego vuelve a esta task. La incluyo numerada aquí para que el plan liste todos los call-sites a tocar; su checklist vive al final de la Task 13.

Call-sites a actualizar (todos pasan a la firma nueva `new PptxExportAdapter(dirSalida, log, dirBanco)`):
- `apps/web/src/lib/produccion.ts:113` → `pptxExport: new PptxExportAdapter(dirExport, logExport, dirBanco)` (usa el `dirBanco` ya definido en la línea 89), y `pruebaExport`/`guiaExport` ganan `dirBanco`.
- `apps/worker/src/main.ts:98` → `new PptxExportAdapter(join(raizRepo(),'generated'), crearLoggerHijo('infra-export'), dirBanco)`.
- `apps/web/src/lib/cascadaDemo.ts:92` → ver el archivo; pasar el `dirBanco` (`join(raizRepo(),'generated','imagenes-ia')`).
- `apps/worker/src/procesarTrabajoCascada.integration.test.ts:125` y `apps/web/src/test/handlers.contrato.test.ts:138` → pasar un `dirBanco` (puede ser un tmp dir o el de `generated/imagenes-ia`; con que exista la ruta basta, el adapter degrada si no hay PNG).

(El detalle de código exacto va en las Tasks 11-13, que definen las firmas. Esta task solo agrupa los call-sites.)

---

### Task 11: PPT export embebe el PNG real desde `imagen_clave` y limpia las notas (#7) (infra-export)

`PptxExportAdapter` deja de resolver el catálogo Noto y pasa a resolver `<dirBanco>/<slide.imagen_clave>.png` (como `FichaExportAdapter`). `notas()` deja de anexar `sugerencia_imagen` (el campo ya no existe → #7 resuelto de raíz). El constructor cambia su tercer parámetro de `dirAssets` (catálogo) a `dirBanco` (banco de PNG generados).

**Files:**
- Modify: `packages/infra-export/src/pptx/PptxExportAdapter.ts`
- Test: `packages/infra-export/src/pptx/PptxExportAdapter.test.ts`

**Interfaces:**
- Produces: `new PptxExportAdapter(dirSalida: string, log: Logger, dirBanco: string)` (tercer arg = banco de PNG; default seguible al `generated/imagenes-ia` relativo).
- Produces: `placeholderImagen` resuelve `slide.imagen_clave`; `notas()` solo devuelve `s.notas_docente`.

- [ ] **Step 1: Write the failing test**

En `PptxExportAdapter.test.ts`, los tests de imagen existentes usan `topico_imagen`/`sugerencia_imagen` + `dirAssets`. Reemplaza los tres `it` del bloque de imágenes (≈líneas 285-387: "embebe imagen real", "cae al placeholder cuando topico_imagen no resuelve", "cae al placeholder si el tópico resuelve pero el PNG no está") por tres que ejerciten `imagen_clave` + `dirBanco`:

```ts
it('embebe el PNG real del banco cuando el slide trae imagen_clave y el PNG existe', async () => {
  const dirBanco = await mkdtemp(join(tmpdir(), 'faro-pptx-banco-'));
  await writeFile(join(dirBanco, 'cafe1234.png'), PNG_DUMMY);

  const deck: ClaseDeck = SchemaClaseDeck.parse({
    titulo: 'Clase con imagen',
    asignatura: 'Matemática',
    nivel: '1º básico',
    oa: ['MA01 OA 03'],
    tramo_edad: '1-2',
    tema: TEMAS_DECK_INFANTIL['1-2'],
    slides: [
      {
        momento: 'inicio',
        tipo: 'contenido',
        titulo: 'Contemos',
        contenido: ['¿Cuántas ves?'],
        notas_docente: 'La respuesta se lee de la imagen.',
        imagen: 'siete estrellas',
        imagen_clave: 'cafe1234',
      },
    ],
  });
  const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
  const adapter = new PptxExportAdapter(dir, logger, dirBanco);
  const archivo = await adapter.exportarPptx(deck);

  const media = entradasPptx(await readFile(archivo.ruta)).filter((e) => /^ppt\/media\/.+/.test(e));
  expect(media.length).toBeGreaterThan(0); // el PNG real quedó embebido
});

it('cae al placeholder visible cuando hay imagen pero no imagen_clave (degradación sin API key)', async () => {
  const deck: ClaseDeck = SchemaClaseDeck.parse({
    titulo: 'Clase fallback',
    asignatura: 'Matemática',
    nivel: '1º básico',
    oa: ['MA01 OA 03'],
    tramo_edad: '1-2',
    tema: TEMAS_DECK_INFANTIL['1-2'],
    slides: [
      {
        momento: 'inicio',
        tipo: 'contenido',
        titulo: 'X',
        contenido: ['y'],
        notas_docente: 'n',
        imagen: 'una recta numérica',
      },
    ],
  });
  const dirBanco = await mkdtemp(join(tmpdir(), 'faro-pptx-banco-'));
  const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
  const adapter = new PptxExportAdapter(dir, logger, dirBanco);
  const buf = await readFile((await adapter.exportarPptx(deck)).ruta);

  expect(entradasPptx(buf).filter((e) => /^ppt\/media\/.+/.test(e))).toEqual([]); // no embebió
  expect(todasLasSlides(buf)).toContain('IMAGEN: una recta numérica'); // placeholder visible
});

it('cae al placeholder si imagen_clave apunta a un PNG que no está en disco', async () => {
  const dirBanco = await mkdtemp(join(tmpdir(), 'faro-pptx-banco-')); // vacío
  const deck: ClaseDeck = SchemaClaseDeck.parse({
    titulo: 'Clase sin archivo',
    asignatura: 'Matemática',
    nivel: '1º básico',
    oa: ['MA01 OA 03'],
    tramo_edad: '1-2',
    tema: TEMAS_DECK_INFANTIL['1-2'],
    slides: [
      {
        momento: 'inicio',
        tipo: 'contenido',
        titulo: 'X',
        contenido: ['y'],
        notas_docente: 'n',
        imagen: 'apoyo visual',
        imagen_clave: 'noexiste',
      },
    ],
  });
  const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
  const adapter = new PptxExportAdapter(dir, logger, dirBanco);
  const buf = await readFile((await adapter.exportarPptx(deck)).ruta);

  expect(entradasPptx(buf).filter((e) => /^ppt\/media\/.+/.test(e))).toEqual([]);
  expect(todasLasSlides(buf)).toContain('IMAGEN: apoyo visual'); // degradó al placeholder
});

it('las notas del orador NO incluyen "Sugerencia de imagen" (#7)', async () => {
  const dirBanco = await mkdtemp(join(tmpdir(), 'faro-pptx-banco-'));
  const deck: ClaseDeck = SchemaClaseDeck.parse({
    titulo: 'Clase notas',
    asignatura: 'Matemática',
    nivel: '1º básico',
    oa: ['MA01 OA 03'],
    tramo_edad: '1-2',
    tema: TEMAS_DECK_INFANTIL['1-2'],
    slides: [
      { momento: 'inicio', tipo: 'contenido', titulo: 'X', contenido: ['y'], notas_docente: 'Guía esto.', imagen: 'una escena' },
    ],
  });
  const dir = await mkdtemp(join(tmpdir(), 'faro-pptx-img-'));
  const adapter = new PptxExportAdapter(dir, logger, dirBanco);
  const buf = await readFile((await adapter.exportarPptx(deck)).ruta);
  expect(todasLasNotas(buf)).not.toContain('Sugerencia de imagen');
});
```

Si en la cabecera del archivo de test sobran imports tras la sustitución (`resolverImagen`, `topicosDisponiblesPara`, `temaDeckInfantil`), elimínalos para que `pnpm lint` no falle por imports sin usar (`PNG_DUMMY`, `mkdtemp`, `mkdir`, `writeFile`, `readFile`, `join`, `dirname`, `tmpdir` ya están). Mantén `resolverImagen`/`topicosDisponiblesPara` solo si otros tests del archivo aún los usan; revisa antes de borrar.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/infra-export/src/pptx/PptxExportAdapter.test.ts`
Expected: FAIL — el adapter aún resuelve `topico_imagen` desde el catálogo y `notas()` aún concatena `sugerencia_imagen`; además el slide ya no tiene esos campos (Task 4) → no embebe ni pone placeholder de `imagen`.

- [ ] **Step 3: Write minimal implementation**

En `PptxExportAdapter.ts`:

Cambia el import de valores del dominio: ya no se usa `resolverImagen`. Quita `resolverImagen` y, si `tramoDeNivel` no se usa en otro punto, quítalo también. El import queda:

```ts
import type {
  ArchivoExportado,
  ClaseDeck,
  ExportPort,
  SlideDeckType,
  TemaDeckInfantilType,
} from '@faro/domain';
```

(elimina la línea `import { resolverImagen, tramoDeNivel } from '@faro/domain';` y su comentario; añade `readFile` a los imports de `node:fs/promises`):

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
```

Cambia el constructor: el tercer parámetro pasa a ser `dirBanco` (banco de PNG generados). Reemplaza el `dirAssets` por `dirBanco`:

```ts
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    // Dir raíz de los PNG del banco de imágenes GENERADAS (line-art ancladas). El export resuelve
    // <dirBanco>/<slide.imagen_clave>.png; si falta, cae al placeholder visible. Default: la carpeta
    // de salida del banco del repo (los roots pasan la ruta explícita; ver produccion.ts/worker).
    private readonly dirBanco: string = join(dirname(fileURLToPath(import.meta.url)), '../../../../generated/imagenes-ia'),
  ) {}
```

Reemplaza `notas()` para que NO use `sugerencia_imagen`:

```ts
  /** Notas del orador: solo las notas docentes (la sugerencia de imagen ya no existe — #7 resuelto). */
  private notas(s: SlideDeckType): string {
    return s.notas_docente;
  }
```

Reemplaza `placeholderImagen` para resolver el PNG del banco por `imagen_clave` (y `deck` ya no se necesita para resolver, pero lo dejamos para no cambiar callers; marca el param como usado o quítalo de la firma — aquí lo quitamos):

```ts
  /**
   * Imagen del slide infantil: si `imagen_clave` resuelve a un PNG existente en el banco, lo inserta;
   * si no (sin clave, o el PNG no está en disco), dibuja la caja punteada "IMAGEN: <imagen>" como guía
   * visible para el/la docente. El PNG line-art lo generó el job (ResolverIlustracionUseCase); aquí solo
   * se lee del disco — degradación coherente con FichaExportAdapter.
   */
  private async placeholderImagen(
    slide: ReturnType<Pptx['addSlide']>,
    s: SlideDeckType,
    tema: TemaDeckInfantilType,
  ): Promise<void> {
    if (s.imagen_clave) {
      const ruta = join(this.dirBanco, `${s.imagen_clave}.png`);
      if (existsSync(ruta)) {
        // pptxgenjs admite `data` como Buffer base64; lo leemos nosotros para controlar el degradado.
        const png = await readFile(ruta);
        slide.addImage({
          data: `image/png;base64,${png.toString('base64')}`,
          x: 3.0,
          y: 2.0,
          w: 4.0,
          h: 2.6,
          sizing: { type: 'contain', w: 4.0, h: 2.6 },
        });
        return;
      }
    }
    // Fallback: el placeholder punteado de siempre, rotulado con la DESCRIPCIÓN de la imagen.
    const descripcion = s.imagen?.trim();
    if (!descripcion) return;
    slide.addText(`IMAGEN: ${descripcion}`, {
      x: 1.0,
      y: 4.3,
      w: 8,
      h: 1.0,
      fontSize: 14,
      fontFace: tema.fuente.cuerpo,
      align: 'center',
      valign: 'middle',
      color: tema.paleta.acento,
      line: { color: tema.paleta.acento, width: 1.5, dashType: 'dash' },
    });
  }
```

`placeholderImagen` pasa a ser `async`; sus tres callers (`slideContenidoInfantil`, `slideQueSigue`, `slideInteraccion`) deben `await`-earla y volverse `async`. Esos métodos ya se llaman desde `slideInfantil`, que también debe ser `async` y await-earse en el loop de `exportarPptx`. Aplica:

- `slideInfantil(...)` → `private async slideInfantil(...)` y `await` en sus `this.slideInteraccion/slideQueSigue/slideContenidoInfantil`.
- `slideContenidoInfantil/slideQueSigue/slideInteraccion` → `private async ...` y cambia `this.placeholderImagen(slide, s, tema, deck)` por `await this.placeholderImagen(slide, s, tema)` (quita el arg `deck`).
- En `exportarPptx`, el loop infantil:

```ts
      this.portadaInfantil(pptx, deck, deck.tema);
      for (const slide of deck.slides) {
        await this.slideInfantil(pptx, slide, deck.tema, deck);
      }
```

(el `deck` se conserva en la firma de `slideInfantil` por si lo usan otros métodos; si tras quitar `placeholderImagen` ningún sub-método usa `deck`, quítalo de las firmas para evitar el warning de "param sin usar" — revisa y decide el mínimo que deje `pnpm lint` en verde).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/infra-export/src/pptx/PptxExportAdapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/infra-export/src/pptx/PptxExportAdapter.ts packages/infra-export/src/pptx/PptxExportAdapter.test.ts
git commit -m "feat(ppt): embebe PNG line-art por imagen_clave; notas sin sugerencia de imagen (#7)"
```

---

### Task 12: La prueba (docx) embebe el PNG real del banco (infra-export)

`itemPlano` (de `planoPrueba.ts`) gana un campo opcional `imagenPng?: Buffer` para el ítem pictórico, que el adapter rellena leyendo `<dirBanco>/<imagen_clave>.png`. `renderItem` (en `PruebaExportAdapter.ts`) inserta un `ImageRun` cuando hay PNG; si no, el placeholder de texto actual. El adapter gana `dirBanco` por constructor (como `FichaExportAdapter`). El mismo `itemPlano`/`ItemPlano` lo reusa la guía (Task 13).

**Files:**
- Modify: `packages/infra-export/src/docx/planoPrueba.ts` (`ItemPlano` pictórico gana `imagenPng?`, `imagenClave?`)
- Modify: `packages/infra-export/src/docx/itemsAlumno.ts` (`renderItemAlumno` pictórico: `ImageRun` si hay PNG)
- Modify: `packages/infra-export/src/docx/PruebaExportAdapter.ts` (constructor `dirBanco`; `renderItem` pictórico con `ImageRun`; resolver el PNG por ítem)
- Test: `packages/infra-export/src/docx/PruebaExportAdapter.test.ts`

**Interfaces:**
- Produces: el caso `'pictorico'` de `ItemPlano` gana `imagenClave?: string` y `imagenPng?: Buffer`.
- Produces: `new PruebaExportAdapter(dirSalida, log, dirBanco)`.

Decisión de diseño (mínimo coherente): `itemPlano` NO lee disco (es IR puro). Quien lee el PNG es el adapter, que recorre la prueba, resuelve cada `imagen_clave` a un `Buffer` y lo inyecta en el `ItemPlano` pictórico antes de renderizar. `planoPrueba(prueba, encabezado, variante)` no cambia su firma; el adapter post-procesa el IR (un `map` sobre las secciones/ítems) inyectando `imagenPng`. La guía hace lo mismo en su adapter (Task 13).

- [ ] **Step 1: Write the failing test**

En `PruebaExportAdapter.test.ts`, añade (mira la cabecera del archivo para reusar sus helpers de descompresión de `.docx`; si el test inspecciona XML, basta con verificar que el `.pptx`/`.docx` embebe una entrada `word/media/`). Añade dos tests; el adapter ahora se construye con `dirBanco`:

```ts
it('embebe el PNG del banco en un ítem pictórico con imagen_clave (docx con word/media)', async () => {
  const dirBanco = await mkdtemp(join(tmpdir(), 'faro-prueba-banco-'));
  await writeFile(join(dirBanco, 'cafe1234.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const dir = await mkdtemp(join(tmpdir(), 'faro-prueba-out-'));
  const adapter = new PruebaExportAdapter(dir, log, dirBanco);

  const prueba: Prueba = {
    ...pruebaBase, // un fixture mínimo del archivo; si no existe, define uno inline (ver nota abajo)
    items: [
      { oa: 'MA01 OA 01', habilidad: 'recordar', tipo: 'pictorico', enunciado: '¿Cuántas? Escribe el número.', imagen: 'tres manzanas', imagen_clave: 'cafe1234' },
    ],
  };
  const archivo = await adapter.aDocx(prueba, encabezadoBase, 'alumno');
  const media = entradasDocx(await readFile(archivo.ruta)).filter((e) => /^word\/media\/.+/.test(e));
  expect(media.length).toBeGreaterThan(0);
});

it('cae al placeholder de texto cuando el ítem pictórico no tiene PNG en disco', async () => {
  const dirBanco = await mkdtemp(join(tmpdir(), 'faro-prueba-banco-')); // vacío
  const dir = await mkdtemp(join(tmpdir(), 'faro-prueba-out-'));
  const adapter = new PruebaExportAdapter(dir, log, dirBanco);

  const prueba: Prueba = {
    ...pruebaBase,
    items: [
      { oa: 'MA01 OA 01', habilidad: 'recordar', tipo: 'pictorico', enunciado: '¿Cuántas?', imagen: 'tres manzanas', imagen_clave: 'noexiste' },
    ],
  };
  const archivo = await adapter.aDocx(prueba, encabezadoBase, 'alumno');
  const buf = await readFile(archivo.ruta);
  expect(entradasDocx(buf).filter((e) => /^word\/media\/.+/.test(e))).toEqual([]); // sin imagen
  expect(documentoXml(buf)).toContain('IMAGEN: tres manzanas'); // placeholder de texto
});
```

> **Nota para el implementer:** revisa la cabecera de `PruebaExportAdapter.test.ts` para ver qué helpers de descompresión `.docx` ya existen (los del DocxExportAdapter.test.ts: lectura de zip + `word/document.xml`). Si no hay un `entradasDocx`/`documentoXml`/`pruebaBase`/`encabezadoBase`, defínelos al inicio del archivo de test reusando el patrón de zip de `PptxExportAdapter.test.ts` (`entradasPptx`/`partePptx` adaptados a `word/document.xml`), y un `pruebaBase`/`encabezadoBase` mínimos válidos (mira el resto del archivo: probablemente ya construyen una `Prueba` y un `EncabezadoPrueba` de muestra que puedes reutilizar). El PNG mínimo `Buffer.from([0x89,0x50,0x4e,0x47])` basta (el adapter solo lo lee como Buffer; `docx` lo embebe sin validar).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/infra-export/src/docx/PruebaExportAdapter.test.ts`
Expected: FAIL — el constructor no acepta `dirBanco` (error de tipos) y el ítem pictórico nunca embebe imagen.

- [ ] **Step 3: Write minimal implementation**

En `planoPrueba.ts`, al caso `'pictorico'` del tipo `ItemPlano`, añade los campos opcionales:

```ts
  | {
      readonly tipo: 'pictorico';
      readonly numero: number;
      readonly enunciado: string;
      readonly puntaje?: number;
      readonly imagenPlaceholder: string;
      readonly imagenClave?: string; // clave del PNG en el banco (el adapter resuelve el Buffer)
      readonly imagenPng?: Buffer; // PNG ya leído del banco (lo inyecta el adapter); si falta → placeholder
      readonly solucion?: string;
      readonly retro?: string;
    };
```

Y en `itemPlano`, el caso `'pictorico'` propaga `imagenClave` desde el ítem:

```ts
    case 'pictorico': {
      const solucion =
        mostrarSolucion && it.respuesta_correcta !== undefined ? { solucion: it.respuesta_correcta } : {};
      return {
        tipo: 'pictorico',
        ...base,
        imagenPlaceholder: `IMAGEN: ${it.imagen ?? '(sin descripción)'}`,
        ...(it.imagen_clave !== undefined ? { imagenClave: it.imagen_clave } : {}),
        ...solucion,
        ...retro,
      };
    }
```

En `itemsAlumno.ts`, el caso `'pictorico'` de `renderItemAlumno` inserta `ImageRun` cuando hay `imagenPng`:

```ts
    case 'pictorico': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      out.push(imagenOPlaceholder(item.imagenPng, item.imagenPlaceholder));
      break;
    }
```

Añade el helper (y el import de `AlignmentType`/`ImageRun`/`Paragraph` ya presentes; añade `ImageRun` al import de `docx`):

```ts
// Tamaño del apoyo visual del ítem pictórico (cuadrado moderado: comparte página con el resto del ítem).
const IMG_ITEM_PX = 320;

/** ImageRun centrado si hay PNG; si no, la caja placeholder "IMAGEN: …" de siempre. */
export function imagenOPlaceholder(png: Buffer | undefined, textoPlaceholder: string): Paragraph | Table {
  if (png === undefined) return cajaPlaceholder(textoPlaceholder);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: 'png',
        data: png,
        transformation: { width: IMG_ITEM_PX, height: IMG_ITEM_PX },
        altText: { name: 'apoyo', title: 'Apoyo visual', description: textoPlaceholder },
      }),
    ],
  });
}
```

(añade `ImageRun` al `import { ... } from 'docx'` de `itemsAlumno.ts`.)

En `PruebaExportAdapter.ts`:

Constructor gana `dirBanco`:

```ts
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    // Banco de PNG generados: el ítem pictórico con `imagen_clave` se resuelve a <dirBanco>/<clave>.png;
    // si falta, cae al placeholder de texto. Mismo patrón que FichaExportAdapter/LaminaExportAdapter.
    private readonly dirBanco: string,
  ) {}
```

Añade imports de fs (`existsSync` ya está; añade `readFile`):

```ts
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
```

(y `import { existsSync } from 'node:fs';` ya está). Añade `ImageRun` al import de `docx` y `imagenOPlaceholder` al import de `itemsAlumno.js` (este adapter hoy NO importa de itemsAlumno; usa sus propios helpers. Para no duplicar, importamos `imagenOPlaceholder` desde `./itemsAlumno.js`):

```ts
import { imagenOPlaceholder } from './itemsAlumno.js';
```

En `aDocx`, antes de `const plano = planoPrueba(...)`, resuelve los PNG y post-procesa el IR. Reemplaza el cuerpo de `aDocx` para inyectar `imagenPng` en cada ítem pictórico:

```ts
  async aDocx(
    prueba: Prueba,
    encabezado: EncabezadoPrueba,
    variante: VariantePrueba,
    idDocumento?: string,
  ): Promise<ArchivoExportado> {
    const planoBase = planoPrueba(prueba, encabezado, variante);
    const plano = await this.inyectarImagenes(planoBase);
    const doc = construirDocumentoPrueba(plano);
    // ...resto idéntico (Packer.toBuffer, mkdir, writeFile, log, return)...
  }
```

Añade el método privado que lee los PNG (fuera de la transacción; solo IO de lectura):

```ts
  /** Resuelve el PNG del banco para cada ítem pictórico con `imagenClave` y lo inyecta en el IR. */
  private async inyectarImagenes(plano: PruebaPlano): Promise<PruebaPlano> {
    const secciones = await Promise.all(
      plano.secciones.map(async (sec) => ({
        ...sec,
        items: await Promise.all(
          sec.items.map(async (it) => {
            if (it.tipo !== 'pictorico' || it.imagenClave === undefined) return it;
            const ruta = join(this.dirBanco, `${it.imagenClave}.png`);
            if (!existsSync(ruta)) return it;
            return { ...it, imagenPng: await readFile(ruta) };
          }),
        ),
      })),
    );
    return { ...plano, secciones };
  }
```

Finalmente, en `renderItem` (el del adapter), el caso `'pictorico'` usa el mismo helper compartido:

```ts
    case 'pictorico': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      out.push(imagenOPlaceholder(item.imagenPng, item.imagenPlaceholder));
      break;
    }
```

(Esto reemplaza la línea `out.push(cajaPlaceholder(item.imagenPlaceholder));` del caso pictórico. El `cajaPlaceholder` privado del adapter sigue usándose para el escudo del encabezado, así que NO se elimina.)

`aPdf` no cambia (llama a `aDocx`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/infra-export/src/docx/PruebaExportAdapter.test.ts packages/infra-export/src/docx/itemsAlumno.test.ts packages/infra-export/src/docx/planoPrueba.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/infra-export/src/docx/planoPrueba.ts packages/infra-export/src/docx/itemsAlumno.ts packages/infra-export/src/docx/PruebaExportAdapter.ts packages/infra-export/src/docx/PruebaExportAdapter.test.ts
git commit -m "feat(prueba): el docx embebe el PNG line-art por imagen_clave (placeholder si falta)"
```

---

### Task 13: La guía (docx) embebe el PNG real + actualiza todos los call-sites (infra-export + apps)

La guía reusa `renderItemAlumno`/`imagenOPlaceholder` (Task 12) → solo le falta inyectar el PNG en su IR. `GuiaExportAdapter` gana `dirBanco` y post-procesa `plano.ejercicios` igual que la prueba. Cierra también la Task 10: actualiza `produccion()`, `cascadaDemo.ts` y los call-sites de test para las firmas nuevas (Prueba/Guía/Pptx con `dirBanco`).

**Files:**
- Modify: `packages/infra-export/src/docx/planoGuia.ts` (propaga `imagenClave` — ya lo hace vía `itemPlano`)
- Modify: `packages/infra-export/src/docx/GuiaExportAdapter.ts` (constructor `dirBanco`; inyectar PNG en los ejercicios)
- Modify: `apps/web/src/lib/produccion.ts` (firmas nuevas)
- Modify: `apps/web/src/lib/cascadaDemo.ts` (firma `PptxExportAdapter`)
- Modify: `apps/worker/src/main.ts` (firma `PptxExportAdapter`)
- Modify: `apps/worker/src/procesarTrabajoCascada.integration.test.ts` y `apps/web/src/test/handlers.contrato.test.ts` (firma `PptxExportAdapter`)
- Test: `packages/infra-export/src/docx/GuiaExportAdapter` (añade un test de imagen — crea `GuiaExportAdapter.test.ts` si no existe)

**Interfaces:**
- Produces: `new GuiaExportAdapter(dirSalida, log, dirBanco)`.

- [ ] **Step 1: Write the failing test**

`planoGuia.ts` ya mapea con `itemPlano`, que tras la Task 12 propaga `imagenClave`. Falta el adapter. Crea/extiende `packages/infra-export/src/docx/GuiaExportAdapter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatosInstitucionalesGuia, Guia } from '@faro/domain';
import { GuiaExportAdapter } from './GuiaExportAdapter.js';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as never;
const inst: DatosInstitucionalesGuia = { nombreColegio: 'Escuela X', comuna: 'Conchalí' };

const guiaBase: Guia = {
  asignatura: 'Ciencias Naturales',
  curso: '3º básico',
  oa: { codigo: 'CN03 OA 01', descripcion: 'Observar seres vivos.' },
  conocimiento: 'Los seres vivos',
  perfil_nivel: '3-4',
  titulo: 'Guía: Los seres vivos',
  explicacion: 'Los seres vivos nacen y crecen.',
  ejemplo: 'Un perro crece.',
  ejercicios: [
    { oa: 'CN03 OA 01', habilidad: 'recordar', tipo: 'pictorico', enunciado: '¿Cuántas hojas ves?', imagen: 'cuatro hojas', imagen_clave: 'beef5678' },
  ],
};

// Helpers de zip para .docx (lee word/media y word/document.xml). Define/reusa los del archivo o impórtalos
// del helper común si existe (mira PptxExportAdapter.test.ts / DocxExportAdapter.test.ts para el patrón).
function entradasDocx(buf: Buffer): string[] { /* ...recorre el directorio central del zip... */ return []; }

describe('GuiaExportAdapter.aDocx (imágenes)', () => {
  it('embebe el PNG del banco cuando un ejercicio pictórico trae imagen_clave', async () => {
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-guia-banco-'));
    await writeFile(join(dirBanco, 'beef5678.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const dirSalida = await mkdtemp(join(tmpdir(), 'faro-guia-out-'));
    const adapter = new GuiaExportAdapter(dirSalida, log, dirBanco);

    const archivo = await adapter.aDocx(guiaBase, inst);
    const media = entradasDocx(await readFile(archivo.ruta)).filter((e) => /^word\/media\/.+/.test(e));
    expect(media.length).toBeGreaterThan(0);
  });

  it('cae al placeholder cuando falta el PNG', async () => {
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-guia-banco-')); // vacío
    const dirSalida = await mkdtemp(join(tmpdir(), 'faro-guia-out-'));
    const adapter = new GuiaExportAdapter(dirSalida, log, dirBanco);
    const archivo = await adapter.aDocx(guiaBase, inst);
    expect((await readFile(archivo.ruta)).length).toBeGreaterThan(0); // sale igual, con placeholder
  });
});
```

> **Nota:** completa `entradasDocx` con el patrón de zip que ya usa `PptxExportAdapter.test.ts` (función `entradasPptx`, idéntica para `.docx`). Si el repo ya expone un helper reutilizable de descompresión `.docx` en los tests, impórtalo en vez de duplicar.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/infra-export/src/docx/GuiaExportAdapter.test.ts`
Expected: FAIL — el constructor no acepta `dirBanco` y los ejercicios no embeben imagen.

- [ ] **Step 3: Write minimal implementation**

En `GuiaExportAdapter.ts`:

Constructor gana `dirBanco`:

```ts
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    // Banco de PNG generados: cada ejercicio pictórico con `imagen_clave` → <dirBanco>/<clave>.png; si
    // falta, cae al placeholder de texto. Mismo patrón que PruebaExportAdapter/FichaExportAdapter.
    private readonly dirBanco: string,
  ) {}
```

Añade `readFile` al import de `node:fs/promises`. Importa el tipo `GuiaPlano` (ya está) y, dentro de `aDocx`, inyecta los PNG antes de construir el documento:

```ts
  async aDocx(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const planoBase: GuiaPlano = planoGuia(guia, inst);
    const plano = await this.inyectarImagenes(planoBase);
    const doc: Document = construirDocumentoGuia(plano);
    // ...resto idéntico...
  }
```

Añade el método (espejo del de la prueba; los ejercicios de la guía son `ItemPlano[]`):

```ts
  /** Resuelve el PNG del banco para cada ejercicio pictórico con `imagenClave` y lo inyecta en el IR. */
  private async inyectarImagenes(plano: GuiaPlano): Promise<GuiaPlano> {
    const ejercicios = await Promise.all(
      plano.ejercicios.map(async (it) => {
        if (it.tipo !== 'pictorico' || it.imagenClave === undefined) return it;
        const ruta = join(this.dirBanco, `${it.imagenClave}.png`);
        if (!existsSync(ruta)) return it;
        return { ...it, imagenPng: await readFile(ruta) };
      }),
    );
    return { ...plano, ejercicios };
  }
```

(`existsSync` ya está importado de `node:fs`; `join` ya está.)

Ahora cierra los call-sites (Task 10):

**`apps/web/src/lib/produccion.ts`** — los export adapters de prueba/guía/pptx ganan `dirBanco` (la variable `dirBanco` ya existe en la línea 89):

```ts
    pruebaExport: new PruebaExportAdapter(dirExport, logExport, dirBanco),
    guiaExport: new GuiaExportAdapter(dirExport, logExport, dirBanco),
    pptxExport: new PptxExportAdapter(dirExport, logExport, dirBanco),
```

**`apps/worker/src/main.ts`** — la construcción de `PptxExportAdapter` (línea ~98) pasa el `dirBanco` (que ahora se crea antes, en la Task 9):

```ts
    export: new PptxExportAdapter(join(raizRepo(), 'generated'), crearLoggerHijo('infra-export'), dirBanco),
```

> Ojo de orden: en `main.ts` el `dirBanco` se define en el bloque de imagen (Task 9), que está DESPUÉS de la construcción de `ProcesarTrabajoCascadaUseCase` (donde vive este `PptxExportAdapter`). Mueve la definición de `dirBanco`/`banco`/`imageGen`/`ilustrador` (Task 9) ARRIBA del `new ProcesarTrabajoCascadaUseCase({...})` para que `dirBanco` esté en scope aquí. (Si prefieres no mover el bloque entero, define `dirBanco` solo —`const dirBanco = join(raizRepo(), 'generated', 'imagenes-ia');`— al inicio de `main()`, junto a `samplesDir`, y reutilízalo.)

**`apps/web/src/lib/cascadaDemo.ts:92`** — lee el archivo: el `PptxExportAdapter` se construye con `dirSalida, logger[, dirAssets]`. Cámbialo a pasar el `dirBanco` del banco generado:

```ts
  const exporter = new PptxExportAdapter(
    dirSalida,
    crearLoggerHijo('infra-export'),
    join(raizRepo(), 'generated', 'imagenes-ia'),
  );
```

(verifica los nombres exactos de variables/imports en `cascadaDemo.ts` — `dirSalida`, el logger y `raizRepo`/`join` — antes de editar; ajusta si difieren.)

**Tests de integración** — `apps/worker/src/procesarTrabajoCascada.integration.test.ts:125` y `apps/web/src/test/handlers.contrato.test.ts:138`: cambia `new PptxExportAdapter(dirSalida, crearLoggerHijo('...'))` por `new PptxExportAdapter(dirSalida, crearLoggerHijo('...'), join(dirSalida, 'imagenes-ia'))` (un subdir de banco; no necesita existir, el adapter degrada).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/infra-export/src/docx/GuiaExportAdapter.test.ts packages/infra-export/src/docx/planoGuia.test.ts`
Expected: PASS.
Run (integración/contrato afectados por las firmas): `pnpm exec vitest run apps/worker apps/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/infra-export/src/docx/GuiaExportAdapter.ts packages/infra-export/src/docx/GuiaExportAdapter.test.ts apps/web/src/lib/produccion.ts apps/web/src/lib/cascadaDemo.ts apps/worker/src/main.ts apps/worker/src/procesarTrabajoCascada.integration.test.ts apps/web/src/test/handlers.contrato.test.ts
git commit -m "feat(guia): el docx embebe el PNG line-art por imagen_clave; cablea dirBanco en web/worker"
```

---

### Task 14: Verificación final del Plan 2

- [ ] **Step 1: Suite completa**

Run: `pnpm exec vitest run`
Expected: todo verde (sin regresiones). Presta atención a: tests del catálogo Noto que ya no se ejerciten desde el PPT (siguen verdes — el catálogo no se borró, solo dejó de usarse en el deck), y a cualquier test que aún referenciara `topico_imagen`/`sugerencia_imagen`.

- [ ] **Step 2: Typecheck + lint (scripts root)**

Run: `pnpm typecheck`
Expected: 0 errores.
Run: `pnpm lint`
Expected: 0 warnings/errores. Revisa imports huérfanos en los tests/adapters tocados (`resolverImagen`, `tramoDeNivel`, `topicosDisponiblesPara`, `dirAssets`) y elimínalos si quedaron sin uso.

- [ ] **Step 3: Sin commit adicional** (los cambios ya se commitearon por task). Si typecheck/lint encuentran algo, arréglalo en un commit `fix:` acotado.

---

## Self-Review (cobertura del spec)

- **NUEVO — imágenes line-art ancladas en prueba/guía/PPT:** `claveIlustracion` (Task 1) + `ResolverIlustracionUseCase` (Task 2) + helper `resolverIlustraciones` (Task 5) + cableado en los 3 jobs (Tasks 6, 7) + worker wiring (Task 9) + exports que embeben el PNG (Tasks 11, 12, 13). ✓
- **#3 (imágenes de la prueba):** `ItemPrueba.imagen_clave` (Task 3) + resolución en el job (Task 6) + docx embebe el PNG (Task 12). La guía reusa `ItemPrueba` → gana imágenes con el mismo cambio (Tasks 7, 13). ✓
- **#5 (conteo: mostrar objetos + no revelar):** prompt de conteo abierto en `INSTR_PRUEBA` y `INSTR_DECK_INFANTIL` + "las opciones NO revelan la cantidad" (Task 8). La imagen anclada que muestra los N objetos sale del pipeline (Tasks 2/5/11). ✓
- **#7 (fuga "Sugerencia de imagen" en notas):** `SlideDeck` pierde `sugerencia_imagen` (Task 4) → `notas()` solo devuelve `notas_docente` (Task 11), con test de regresión. ✓
- **Degradación sin API key:** `ResolverIlustracionUseCase` devuelve `null` (Task 2); el helper no añade `imagen_clave` (Task 5); los exports caen al placeholder de texto (Tasks 11, 12, 13), con test en cada uno. ✓
- **Riesgo §4 (cantidades exactas):** documentado en Global Constraints y codificado como conteo de respuesta abierta en los prompts (Task 8). ✓
- **Decisiones cerradas del spec §7:** (1) **hermano** `ResolverIlustracionUseCase`, no generalizar `ResolverDibujoUseCase` (Task 2); (2) ficha↔lámina ya resueltas en Plan 1 (fuera de alcance aquí); (3) clave = hash de la descripción normalizada (`claveIlustracion`, Task 1); (4) catálogo Noto se deja **inerte** (no se borra; el PPT deja de usarlo — Tasks 8, 11); (5) idioma de `imagen.descripcion`: español (la IA la propone anclada al enunciado en español; `construirPromptLineArt` la envuelve igual — el estilo de los pájaros aplica a cualquier idioma de entrada). ✓
- **Type consistency:** `resolver(descripcion, oaCodigo, opts?)` idéntico en Task 2 y sus usos (Task 5); `resolverIlustracionesItems/Slides(items, oaCodigo, ilustrador)` idéntico en Tasks 5/6/7; `new PptxExportAdapter(dir, log, dirBanco)` y `new (Prueba|Guia)ExportAdapter(dir, log, dirBanco)` idénticos en Tasks 11/12/13 y todos los call-sites (Tasks 9, 13). ✓
- **Placeholder scan:** sin TBD/TODO; cada step trae código real. Dos puntos exigen que el implementer LEA el archivo antes de editar (marcados como notas, no como placeholders de diseño): los helpers de descompresión `.docx` en los tests de export (Tasks 12, 13) y la firma exacta de `cascadaDemo.ts` (Task 13) — el diseño es fijo, solo se confirma el nombre de variables locales. ✓
