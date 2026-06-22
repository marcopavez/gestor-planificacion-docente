# Material para colorear · PLAN 2 (ficha educativa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desde un OA de 1º–3º básico, generar una **ficha educativa para colorear** (`.docx`/`.pdf`): encabezado institucional + Nombre/Curso/Fecha + 2–3 **ejercicios anclados al OA** + **1 dibujo line-art B&N para colorear**, todo nacido `borrador` (HIL), con su propia cola asíncrona y botón en la UI.

**Architecture:** Hexagonal (Ports & Adapters). Se **reutiliza** la fundación del Plan 1 (ya en `main`): el pipeline de dibujo con cache por `(OA, concepto)` se **factoriza** en un `ResolverDibujoUseCase` compartido (la lámina lo usa internamente; la ficha también) → ficha y lámina comparten el PNG cacheado. Los **ejercicios** los genera un nuevo `GenerarEjerciciosFichaUseCase` que **reutiliza el motor de PRUEBA** (decisión del dueño): `ItemPrueba` + `fugaDeTextoEnItems` + una instrucción `INSTR_FICHA` derivada de `INSTR_PRUEBA` (que ya soporta 1º–2º pre-lectores e ítems pictóricos). El **render** de ejercicios se extrae a un módulo compartido `renderItemAlumno` (la guía lo reusa; la ficha también); el dibujo reusa el patrón ImageRun-con-fallback-a-placeholder de la lámina. Cola `ficha_colorear` espejo de `material_colorear` end-to-end.

**Tech Stack:** monorepo pnpm; TS `strict`; Zod; `docx@9.7.1` (ImageRun/Packer) + LibreOffice (`soffice`) para `.pdf`; Postgres + Drizzle (cola `FOR UPDATE SKIP LOCKED`); Next.js App Router (web) + worker; Vitest (config en la raíz del monorepo). `@google/genai` (adapter de imagen, ya instalado) — la ficha NO toca el adapter, solo lo consume vía `ImageGenPort`.

## Global Constraints

> Cada tarea hereda implícitamente esta sección. Los valores son verbatim.

- **Hexagonal / INV-5:** `domain` y `application` importan SOLO de `@faro/domain` y hermanos `./` — **NUNCA** `@faro/infra-*` (ESLint lo bloquea). Los adapters concretos se inyectan en `apps/worker/src/main.ts` y en `apps/web/src/lib/produccion.ts` (únicos composition roots).
- **INV-1:** dominio/aplicación testeables con fakes (sin red/disco). El `ImageGenPort` y los repos son puertos; se testean con dobles.
- **INV-2/3 (HIL):** todo artefacto de IA nace **borrador**. El worker persiste con `estadoGeneracion: 'validado'` dentro del wrapper `DocumentoGenerado` que nace `borrador` por construcción (no se aprueba nada automáticamente).
- **INV-4:** el dibujo cacheado se liga al `corpusVersionId` del OA y a `IMAGENES_VERSION`.
- **INV-6:** proveedores tras puerto. La ficha consume `ImageGenPort` / `BancoImagenesGeneradasPort` / `ExportFichaPort`; nunca un proveedor concreto.
- **Tramo:** la ficha se ofrece SOLO para **grado ≤ 3** (1º–3º). Gate en el use case (`ficha_tramo_no_soportado`) **y** en la UI. Desde 4º no se ofrece. El PPT infantil, la prueba y la guía existentes **no se tocan**.
- **Restricción legal (no negociable, REUSADA tal cual):** el dibujo se genera vía `INSTR_DIBUJO` (Plan 1), que ya prohíbe verbatim personajes con copyright/marca y texto dentro del dibujo. **Esta tarea NO reescribe ni relaja `INSTR_DIBUJO`.** Nunca se scrapean coloring pages de internet.
- **Sin `any`** (`@typescript-eslint/no-explicit-any: error`); **sin `console.log`** (logger de `@faro/observability`). Comentarios = el *por qué* en 1 línea.
- **Tests:** `pnpm exec vitest run <path-desde-la-raíz>` (NO `pnpm --filter X exec vitest run src/...` → "No test files found": el root de vitest es el monorepo). Los tests viven en `packages/*/src/**/*.test.ts` o `apps/*/src/**/*.test.ts`.
- **Typecheck:** `pnpm --filter @faro/<pkg> exec tsc --build` por paquete; `pnpm --filter @faro/web typecheck` para la web. **DoD final:** `pnpm lint` (0 warnings) && `pnpm typecheck` && `pnpm test` verdes.
- **Dos refactors deliberados (NO son defectos a marcar):** (1) Task 4 mueve el pipeline de cache de `GenerarMaterialColorearUseCase` a `ResolverDibujoUseCase`, que la lámina construye internamente — **su DI pública y el wiring del worker NO cambian**, la suite de la lámina queda verde sin tocar sus tests; (2) Task 8 extrae el switch `renderItemAlumno` (~80 líneas) + helpers docx de `construirDocumentoGuia` a un módulo compartido y repunta la guía — evita duplicar ~140 líneas; la suite de la guía es la red de seguridad. Ambos eliminan duplicación que el review trataría como defecto; no son sobre-ingeniería.

## File Structure

**Nuevos:**
- `packages/domain/src/schemas/ficha.ts` — `SchemaFicha`, `Ficha`, `fugaDeTextoEnFicha`, `SchemaEjerciciosFicha`, `EjerciciosFicha`.
- `packages/domain/src/schemas/payloadFicha.ts` — `SchemaPayloadFicha`, `PayloadFicha`.
- `packages/application/src/aula/cascada/ResolverDibujoUseCase.ts` — pipeline de dibujo compartido (extraído del Plan 1).
- `packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.ts` — ejercicios anclados al OA (motor de prueba, 1º–3º).
- `packages/application/src/aula/cascada/GenerarFichaUseCase.ts` — orquesta dibujo + ejercicios → `Ficha`.
- `packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.ts` — handler de la cola `ficha_colorear`.
- `packages/infra-export/src/docx/itemsAlumno.ts` — `renderItemAlumno` + helpers docx (extraído de la guía).
- `packages/infra-export/src/docx/planoFicha.ts` — IR puro de la ficha.
- `packages/infra-export/src/docx/construirDocumentoFicha.ts` — render del IR a `Document`.
- `packages/infra-export/src/docx/FichaExportAdapter.ts` — `ExportFichaPort` (.docx/.pdf).
- `apps/web/app/api/aula/ficha/route.ts` — POST (encola).
- `apps/web/app/api/aula/ficha/[jobId]/route.ts` — GET (polling).
- `apps/web/app/api/aula/documentos/[id]/ficha/route.ts` — GET (descarga .docx/.pdf).
- `apps/web/src/lib/exportarFicha.ts` — carga común para las descargas.

**Modificados:**
- `packages/domain/src/ports/index.ts` — `ExportFichaPort`, `TrabajoFicha`, `JobRepository.encolarFicha/tomarSiguienteFicha` + imports.
- `packages/domain/src/index.ts` — barrels de la ficha.
- `packages/application/src/aula/cascada/generacion.ts` — `INSTR_FICHA` + `entradaFicha`.
- `packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.ts` — delega en `ResolverDibujoUseCase`.
- `packages/application/src/index.ts` — barrels de los use cases nuevos.
- `packages/infra-export/src/docx/construirDocumentoGuia.ts` — repunta a `itemsAlumno.ts`.
- `packages/infra-export/src/index.ts` — barrels del export de ficha.
- `packages/infra-db/src/repos/JobRepositoryDrizzle.ts` — `encolarFicha/tomarSiguienteFicha`.
- `apps/worker/src/main.ts` — 7ª cola `ficha_colorear`.
- `apps/web/src/lib/produccion.ts` — `fichaExport`.
- `apps/web/app/aula/planificacion/page.tsx` — componente `GenerarFicha`.
- `apps/web/src/test/ficha.contrato.test.ts` — contrato e2e (nuevo, en web).

---

### Task 1: Schemas de la ficha (`SchemaFicha` + `SchemaEjerciciosFicha`)

**Files:**
- Create: `packages/domain/src/schemas/ficha.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/schemas/ficha.test.ts`

**Interfaces:**
- Consumes: `ItemPrueba`, `ItemPruebaType`, `fugaDeTextoEnItems` de `./prueba.js`.
- Produces: `SchemaFicha`, `type Ficha`, `fugaDeTextoEnFicha(ficha): { campo; itemIndex; largo } | null`, `SchemaEjerciciosFicha`, `type EjerciciosFicha`.

- [ ] **Step 1: Write the failing test** — `packages/domain/src/schemas/ficha.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { SchemaFicha, SchemaEjerciciosFicha, fugaDeTextoEnFicha, type Ficha } from './ficha.js';

const itemValido = {
  oa: 'OA 1',
  habilidad: 'comprender' as const,
  tipo: 'completacion' as const,
  enunciado: 'El gato tiene ____ patas.',
};

const fichaValida: Ficha = {
  asignatura: 'Matemática',
  curso: '1º básico',
  oa: { codigo: 'MA01 OA 01', descripcion: 'Contar números del 0 al 100.' },
  concepto: 'conteo de frutas',
  perfil_nivel: '1-2',
  titulo: 'Ficha para colorear: conteo de frutas',
  consigna_dibujo: 'Colorea el dibujo.',
  ejercicios: [itemValido],
  descripcion_dibujo: 'Three apples on a table, thick outlines.',
  imagen_clave: 'abcd1234',
};

describe('SchemaFicha', () => {
  it('acepta una ficha válida', () => {
    expect(SchemaFicha.parse(fichaValida)).toEqual(fichaValida);
  });

  it('rechaza perfil_nivel fuera de 1º-3º (5-6)', () => {
    expect(() => SchemaFicha.parse({ ...fichaValida, perfil_nivel: '5-6' })).toThrow();
  });
});

describe('SchemaEjerciciosFicha', () => {
  it('acepta una lista de ítems de prueba', () => {
    expect(SchemaEjerciciosFicha.parse({ ejercicios: [itemValido] })).toEqual({ ejercicios: [itemValido] });
  });
});

describe('fugaDeTextoEnFicha', () => {
  it('devuelve null si los ítems están sanos', () => {
    expect(fugaDeTextoEnFicha(fichaValida)).toBeNull();
  });

  it('detecta fuga en un enunciado desmesurado', () => {
    const sucia: Ficha = { ...fichaValida, ejercicios: [{ ...itemValido, enunciado: 'x'.repeat(1001) }] };
    const fuga = fugaDeTextoEnFicha(sucia);
    expect(fuga).not.toBeNull();
    expect(fuga?.campo).toBe('enunciado');
    expect(fuga?.itemIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/schemas/ficha.test.ts`
Expected: FAIL ("Cannot find module './ficha.js'").

- [ ] **Step 3: Write the implementation** — `packages/domain/src/schemas/ficha.ts`

```ts
// packages/domain/src/schemas/ficha.ts
// Schema de la FICHA educativa para colorear (Plan 2, 1º-3º básico). Standalone desde un OA.
// Híbrido: la IA redacta los ejercicios (motor de prueba) y la descripción del dibujo; el use case
// SOBRESCRIBE los campos fijos (asignatura/curso/oa/concepto/perfil_nivel/titulo/consigna). Nace borrador (HIL).

import { z } from 'zod';
import { ItemPrueba, fugaDeTextoEnItems } from './prueba.js';

// Salida estructurada del motor de ejercicios de la ficha: solo la lista de ítems (el use case fija el resto).
export const SchemaEjerciciosFicha = z.object({
  ejercicios: z.array(ItemPrueba),
});
export type EjerciciosFicha = z.infer<typeof SchemaEjerciciosFicha>;

export const SchemaFicha = z.object({
  // FIJOS (el use case los sobrescribe; la IA no los decide):
  asignatura: z.string(),
  curso: z.string(),
  oa: z.object({ codigo: z.string(), descripcion: z.string() }),
  concepto: z.string(),
  // La ficha es 1º-3º básico → solo tramos '1-2' y '3-4' (data-driven por grado, como el PPT/prueba).
  perfil_nivel: z.enum(['1-2', '3-4']),
  titulo: z.string(),
  consigna_dibujo: z.string(),
  // REDACTADOS por la IA (nacen borrador): ejercicios (motor de prueba) + descripción del dibujo (alt-text).
  ejercicios: z.array(ItemPrueba),
  descripcion_dibujo: z.string(),
  // Clave determinista del banco generado: el export la resuelve a un PNG en disco (o placeholder si falta).
  imagen_clave: z.string(),
});
export type Ficha = z.infer<typeof SchemaFicha>;

/** Detecta fuga de texto en los ejercicios de la ficha (reusa la guardia de ítems de la prueba/guía). */
export function fugaDeTextoEnFicha(
  ficha: Ficha,
): { campo: string; itemIndex: number; largo: number } | null {
  return fugaDeTextoEnItems(ficha.ejercicios);
}
```

- [ ] **Step 4: Add barrels** — en `packages/domain/src/index.ts`, justo después de la línea 270 (`export type { Lamina, DescripcionDibujo } from './schemas/lamina.js';`), añade:

```ts

// --- Ficha educativa para colorear (Plan 2, 1º-3º básico) ---
export { SchemaFicha, SchemaEjerciciosFicha, fugaDeTextoEnFicha } from './schemas/ficha.js';
export type { Ficha, EjerciciosFicha } from './schemas/ficha.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/domain/src/schemas/ficha.test.ts`
Expected: PASS. Luego `pnpm --filter @faro/domain exec tsc --build` → 0 errores.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/schemas/ficha.ts packages/domain/src/schemas/ficha.test.ts packages/domain/src/index.ts
git commit -m "feat(ficha): schema de la ficha educativa para colorear (dominio)"
```

---

### Task 2: Payload del job `ficha_colorear`

**Files:**
- Create: `packages/domain/src/schemas/payloadFicha.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/schemas/payloadFicha.test.ts`

**Interfaces:**
- Produces: `SchemaPayloadFicha`, `type PayloadFicha = { establecimiento; asignatura; nivel; oaCodigo; concepto?; regenerar? }`.

- [ ] **Step 1: Write the failing test** — `packages/domain/src/schemas/payloadFicha.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { SchemaPayloadFicha } from './payloadFicha.js';

describe('SchemaPayloadFicha', () => {
  it('acepta el payload mínimo (sin concepto ni regenerar)', () => {
    const p = { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: '1º básico', oaCodigo: 'MA01 OA 01' };
    expect(SchemaPayloadFicha.parse(p)).toEqual(p);
  });

  it('acepta concepto y regenerar opcionales', () => {
    const p = { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: '1º básico', oaCodigo: 'MA01 OA 01', concepto: 'frutas', regenerar: true };
    expect(SchemaPayloadFicha.parse(p)).toEqual(p);
  });

  it('rechaza campos requeridos vacíos', () => {
    expect(() => SchemaPayloadFicha.parse({ establecimiento: '', asignatura: 'M', nivel: '1º', oaCodigo: 'x' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/schemas/payloadFicha.test.ts`
Expected: FAIL ("Cannot find module './payloadFicha.js'").

- [ ] **Step 3: Write the implementation** — `packages/domain/src/schemas/payloadFicha.ts`

```ts
// packages/domain/src/schemas/payloadFicha.ts
// Payload del job 'ficha_colorear' (Plan 2): la ficha es STANDALONE desde un OA (espejo de la lámina).
// El worker resuelve el OA + corpus_version vía OaRepository. 'concepto' afina el dibujo y el tema de los
// ejercicios; 'regenerar' fuerza saltarse el cache del dibujo (HIL).

import { z } from 'zod';

export const SchemaPayloadFicha = z.object({
  establecimiento: z.string().min(1),
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  oaCodigo: z.string().min(1),
  concepto: z.string().min(1).optional(),
  regenerar: z.boolean().optional(),
});
export type PayloadFicha = z.infer<typeof SchemaPayloadFicha>;
```

- [ ] **Step 4: Add barrels** — en `packages/domain/src/index.ts`, justo después de la línea 253 (`export type { PayloadMaterialColorear } from './schemas/payloadMaterialColorear.js';`), añade:

```ts
export { SchemaPayloadFicha } from './schemas/payloadFicha.js';
export type { PayloadFicha } from './schemas/payloadFicha.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/domain/src/schemas/payloadFicha.test.ts`
Expected: PASS. Luego `pnpm --filter @faro/domain exec tsc --build` → 0 errores.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/schemas/payloadFicha.ts packages/domain/src/schemas/payloadFicha.test.ts packages/domain/src/index.ts
git commit -m "feat(ficha): payload del job ficha_colorear (dominio)"
```

---

### Task 3: Puertos de la ficha (`ExportFichaPort`, `TrabajoFicha`, cola en `JobRepository`)

**Files:**
- Modify: `packages/domain/src/ports/index.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/ports/ficha.types.test.ts` (test de tipos: compila ⇒ pasa)

**Interfaces:**
- Consumes: `Ficha` (`../schemas/ficha.js`), `PayloadFicha` (`../schemas/payloadFicha.js`), `DatosInstitucionalesGuia`, `ArchivoExportado`.
- Produces: `ExportFichaPort { aDocx; aPdf }`, `TrabajoFicha { id; payload; intentos }`, `JobRepository.encolarFicha(payload): Promise<string>`, `JobRepository.tomarSiguienteFicha(workerId): Promise<TrabajoFicha | null>`.

- [ ] **Step 1: Write the failing test** — `packages/domain/src/ports/ficha.types.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { ExportFichaPort, JobRepository, TrabajoFicha } from '../index.js';

describe('puertos de la ficha (contrato de tipos)', () => {
  it('un doble satisface ExportFichaPort y los métodos de cola de JobRepository', () => {
    const exportador: Pick<ExportFichaPort, 'aDocx' | 'aPdf'> = {
      aDocx: async () => ({ ruta: '/tmp/f.docx', mime: 'x', bytes: 1 }),
      aPdf: async () => ({ ruta: '/tmp/f.pdf', mime: 'x', bytes: 1 }),
    };
    const cola: Pick<JobRepository, 'encolarFicha' | 'tomarSiguienteFicha'> = {
      encolarFicha: async () => 'job-1',
      tomarSiguienteFicha: async (): Promise<TrabajoFicha | null> => null,
    };
    expect(typeof exportador.aDocx).toBe('function');
    expect(typeof cola.encolarFicha).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/ports/ficha.types.test.ts`
Expected: FAIL (typecheck: `ExportFichaPort`/`encolarFicha`/`TrabajoFicha` no existen).

- [ ] **Step 3a: Añade los imports de tipo** — en `packages/domain/src/ports/index.ts`, tras la línea 34 (`import type { Lamina } from '../schemas/lamina.js';`):

```ts
import type { PayloadFicha } from '../schemas/payloadFicha.js';
import type { Ficha } from '../schemas/ficha.js';
```

- [ ] **Step 3b: Añade `ExportFichaPort`** — en `packages/domain/src/ports/index.ts`, justo después del bloque `ExportLaminaPort` (tras la línea 197 `}`):

```ts

// --- Export de la Ficha educativa para colorear (.docx/.pdf) — Plan 2, INV-6 ---
// Reusa DatosInstitucionalesGuia. Combina ejercicios (motor de prueba) + 1 dibujo line-art del banco
// generado por `ficha.imagen_clave`; si falta el PNG, degrada a un placeholder.
export interface ExportFichaPort {
  aDocx(ficha: Ficha, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
  aPdf(ficha: Ficha, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
}
```

- [ ] **Step 3c: Añade `TrabajoFicha`** — en `packages/domain/src/ports/index.ts`, justo después del bloque `TrabajoMaterialColorear` (tras la línea 321 `}`):

```ts

// Un trabajo de generación de FICHA para colorear (Plan 2): standalone desde un OA (como la lámina).
export interface TrabajoFicha {
  readonly id: string;
  readonly payload: PayloadFicha;
  readonly intentos: number; // ya incrementado por tomarSiguienteFicha (cuenta el intento en curso)
}
```

- [ ] **Step 3d: Añade los métodos de cola** — en la interface `JobRepository`: tras `encolarMaterialColorear(...)` (línea 345) añade:

```ts
  // Encola una generación de FICHA para colorear (Plan 2) standalone desde un OA.
  encolarFicha(payload: PayloadFicha): Promise<string>;
```

y tras `tomarSiguienteMaterialColorear(...)` (línea 358) añade:

```ts
  // Análogo para la cola 'ficha_colorear' (Plan 2): su propia cola por tipo de trabajo.
  tomarSiguienteFicha(workerId: string): Promise<TrabajoFicha | null>;
```

- [ ] **Step 3e: Añade los barrels** — en `packages/domain/src/index.ts`, dentro del bloque `export type { ... } from './ports/index.js';` (líneas 254-260), añade `ExportFichaPort,` y `TrabajoFicha,` a la lista:

```ts
export type {
  BancoImagenesGeneradasPort,
  DibujoCacheado,
  MetaDibujo,
  ExportLaminaPort,
  TrabajoMaterialColorear,
  ExportFichaPort,
  TrabajoFicha,
} from './ports/index.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/domain/src/ports/ficha.types.test.ts`
Expected: PASS. Luego `pnpm --filter @faro/domain exec tsc --build` → 0 errores.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ports/index.ts packages/domain/src/ports/ficha.types.test.ts packages/domain/src/index.ts
git commit -m "feat(ficha): puertos de export y cola ficha_colorear (dominio)"
```

---

### Task 4: Extraer `ResolverDibujoUseCase` (refactor de la lámina, DI estable)

**Files:**
- Create: `packages/application/src/aula/cascada/ResolverDibujoUseCase.ts`
- Modify: `packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/src/aula/cascada/ResolverDibujoUseCase.test.ts`
- Test (red de seguridad, ya existe): `packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.test.ts` debe quedar verde **sin tocarlo**.

**Interfaces:**
- Consumes: `GenerarDescripcionDibujoUseCase`, `ImageGenPort`, `BancoImagenesGeneradasPort`, `claveDibujo`, `IMAGENES_VERSION`, `MetaDibujo`, `ContextoCascada`, `MetaGeneracion`.
- Produces: `ResolverDibujoUseCase` con `resolver(ctx, oaCodigo, opts?): Promise<DibujoResuelto>`; `interface DibujoResuelto { clave; concepto; descripcion; meta }`; `interface DependenciasResolverDibujo { descripcion; imageGen; banco }`.

- [ ] **Step 1: Write the failing test** — `packages/application/src/aula/cascada/ResolverDibujoUseCase.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import type { BancoImagenesGeneradasPort, DibujoCacheado } from '@faro/domain';
import { claveDibujo } from '@faro/domain';
import { ResolverDibujoUseCase } from './ResolverDibujoUseCase.js';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { ContextoCascada } from './tipos.js';

const ctx: ContextoCascada = {
  establecimiento: 'esc-1',
  asignatura: 'Matemática',
  nivel: '1º básico',
  oaSeleccionados: [{ codigo: 'MA01 OA 01', categoria: 'basal', descripcion: 'Contar.' }],
  corpusVersionId: 'cv-1',
};

const META = { modelo: 'fake', usage: { input: 10, output: 5, cacheRead: 0, cacheCreation: 0 }, stopReason: 'end_turn' };

function fakeDescripcion(): GenerarDescripcionDibujoUseCase {
  return {
    ejecutarConMeta: vi.fn(async () => ({ valor: { concepto: 'frutas', descripcion_en: 'three apples' }, meta: META })),
    ejecutar: vi.fn(),
  } as unknown as GenerarDescripcionDibujoUseCase;
}

describe('ResolverDibujoUseCase', () => {
  it('cache HIT: reusa el dibujo sin llamar a Claude ni a Imagen', async () => {
    const desc = fakeDescripcion();
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
    const cacheado: DibujoCacheado = { png: Buffer.from('x'), descripcion: 'cached desc', concepto: 'cached' };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => cacheado), guardar: vi.fn() };

    const uc = new ResolverDibujoUseCase({ descripcion: desc, imageGen, banco });
    const r = await uc.resolver(ctx, 'MA01 OA 01', { concepto: 'frutas' });

    expect(r).toEqual({ clave: claveDibujo('MA01 OA 01', 'frutas'), concepto: 'cached', descripcion: 'cached desc', meta: { modelo: 'cache', usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, stopReason: 'cache_hit' } });
    expect(desc.ejecutarConMeta).not.toHaveBeenCalled();
    expect(imageGen.generarLineArt).not.toHaveBeenCalled();
  });

  it('cache MISS: Claude describe, Imagen dibuja, se guarda en el banco', async () => {
    const desc = fakeDescripcion();
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png-bytes')) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverDibujoUseCase({ descripcion: desc, imageGen, banco });
    const r = await uc.resolver(ctx, 'MA01 OA 01', { concepto: 'frutas' });

    expect(imageGen.generarLineArt).toHaveBeenCalledWith('three apples', { aspectRatio: '3:4' });
    expect(banco.guardar).toHaveBeenCalledOnce();
    expect(r.concepto).toBe('frutas');
    expect(r.descripcion).toBe('three apples');
    expect(r.meta).toBe(META);
  });

  it('regenerar=true: ignora el cache aunque haya hit', async () => {
    const desc = fakeDescripcion();
    const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => ({ png: Buffer.from('x'), descripcion: 'd', concepto: 'c' })), guardar: vi.fn(async () => {}) };

    const uc = new ResolverDibujoUseCase({ descripcion: desc, imageGen, banco });
    await uc.resolver(ctx, 'MA01 OA 01', { concepto: 'frutas', regenerar: true });

    expect(banco.buscar).not.toHaveBeenCalled();
    expect(desc.ejecutarConMeta).toHaveBeenCalledOnce();
  });

  it('Imagen no disponible (png=null): NO guarda; igual devuelve la descripción', async () => {
    const desc = fakeDescripcion();
    const imageGen = { generarLineArt: vi.fn(async () => null) };
    const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };

    const uc = new ResolverDibujoUseCase({ descripcion: desc, imageGen, banco });
    const r = await uc.resolver(ctx, 'MA01 OA 01');

    expect(banco.guardar).not.toHaveBeenCalled();
    expect(r.descripcion).toBe('three apples');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ResolverDibujoUseCase.test.ts`
Expected: FAIL ("Cannot find module './ResolverDibujoUseCase.js'").

- [ ] **Step 3: Write the implementation** — `packages/application/src/aula/cascada/ResolverDibujoUseCase.ts`

```ts
// packages/application/src/aula/cascada/ResolverDibujoUseCase.ts
// Pipeline de dibujo compartido (Plan 1 → factorizado para el Plan 2): cache por (OA, concepto).
//   cache HIT → reusa el dibujo (sin Claude ni Imagen).
//   cache MISS / regenerar → Claude propone la descripción (EN) → Imagen la dibuja → se cachea el PNG.
//   Si Imagen no está disponible (sin API key), png=null → NO se cachea; el caller ensambla con placeholder.
// Lo usan GenerarMaterialColorearUseCase (lámina) y GenerarFichaUseCase (ficha): mismo (OA, concepto) →
// mismo PNG cacheado. INV-5: importa SOLO de @faro/domain y hermanos ./ — nunca @faro/infra-*.

import type { BancoImagenesGeneradasPort, ImageGenPort, MetaDibujo } from '@faro/domain';
import { claveDibujo, IMAGENES_VERSION } from '@faro/domain';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

// Meta sintética para el camino cache-hit (no hubo llamada al LLM).
const META_CACHE: MetaGeneracion = {
  modelo: 'cache',
  usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
  stopReason: 'cache_hit',
};

export interface DependenciasResolverDibujo {
  readonly descripcion: GenerarDescripcionDibujoUseCase;
  readonly imageGen: ImageGenPort;
  readonly banco: BancoImagenesGeneradasPort;
}

export interface DibujoResuelto {
  readonly clave: string;
  readonly concepto: string;
  readonly descripcion: string; // descripción EN (alt-text / placeholder si falta el PNG)
  readonly meta: MetaGeneracion;
}

export class ResolverDibujoUseCase {
  private readonly descripcion: GenerarDescripcionDibujoUseCase;
  private readonly imageGen: ImageGenPort;
  private readonly banco: BancoImagenesGeneradasPort;

  constructor(deps: DependenciasResolverDibujo) {
    this.descripcion = deps.descripcion;
    this.imageGen = deps.imageGen;
    this.banco = deps.banco;
  }

  async resolver(
    ctx: ContextoCascada,
    oaCodigo: string,
    opts?: { concepto?: string; regenerar?: boolean },
  ): Promise<DibujoResuelto> {
    const clave = claveDibujo(oaCodigo, opts?.concepto);

    // cache HIT (salvo regenerar): reusa el dibujo y su descripción/concepto.
    if (opts?.regenerar !== true) {
      const cacheado = await this.banco.buscar(clave);
      if (cacheado !== null) {
        return { clave, concepto: cacheado.concepto, descripcion: cacheado.descripcion, meta: META_CACHE };
      }
    }

    // cache MISS / regenerar: Claude propone el dibujo (EN), Imagen lo dibuja.
    const { valor: desc, meta } = await this.descripcion.ejecutarConMeta(ctx, opts?.concepto);
    const png = await this.imageGen.generarLineArt(desc.descripcion_en, { aspectRatio: '3:4' });

    if (png !== null) {
      const metaDibujo: MetaDibujo = {
        oaCodigo,
        concepto: desc.concepto,
        descripcion: desc.descripcion_en,
        modelo: meta.modelo,
        imagenesVersion: IMAGENES_VERSION,
      };
      await this.banco.guardar(clave, png, metaDibujo);
    }

    return { clave, concepto: desc.concepto, descripcion: desc.descripcion_en, meta };
  }
}
```

- [ ] **Step 4: Refactor `GenerarMaterialColorearUseCase` para delegar** — reemplaza el cuerpo de `packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.ts` por (la DI pública `DependenciasGenerarMaterialColorear` NO cambia; construye el resolver internamente):

```ts
// packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.ts
// Material para colorear (Plan 1): la LÁMINA. Delega el pipeline de dibujo (cache por OA/concepto) en
// ResolverDibujoUseCase (compartido con la ficha, Plan 2) y SOBRESCRIBE los campos fijos de la lámina.
// La lámina nace borrador (HIL) en el wrapper DocumentoGenerado (lo persiste el worker).
// REGLA INV-5: importa SOLO de @faro/domain (puertos) y de hermanos en ./ — NUNCA de @faro/infra-*.

import type { Lamina } from '@faro/domain';
import { GeneracionError, gradoDeNivel } from '@faro/domain';
import { ResolverDibujoUseCase, type DependenciasResolverDibujo } from './ResolverDibujoUseCase.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

// La DI pública no cambia: el worker sigue inyectando { descripcion, imageGen, banco }.
export type DependenciasGenerarMaterialColorear = DependenciasResolverDibujo;

export class GenerarMaterialColorearUseCase {
  private readonly resolver: ResolverDibujoUseCase;

  constructor(deps: DependenciasGenerarMaterialColorear) {
    this.resolver = new ResolverDibujoUseCase(deps);
  }

  async ejecutarConMeta(
    ctx: ContextoCascada,
    opts?: { concepto?: string; regenerar?: boolean },
  ): Promise<{ valor: Lamina; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('material_sin_oa');

    // Gate por GRADO (no por tramo agrupado): solo 1º-3º básico (decisión del dueño).
    const grado = gradoDeNivel(ctx.nivel);
    if (!(grado >= 1 && grado <= 3)) throw new GeneracionError('material_tramo_no_soportado');

    const { clave, concepto, descripcion, meta } = await this.resolver.resolver(ctx, oa.codigo, opts);
    return { valor: this.ensamblar(ctx, oa, concepto, descripcion, clave), meta };
  }

  async ejecutar(ctx: ContextoCascada, opts?: { concepto?: string; regenerar?: boolean }): Promise<Lamina> {
    return (await this.ejecutarConMeta(ctx, opts)).valor;
  }

  // SOBRESCRIBE los campos fijos (asignatura/curso/oa/consigna/titulo) — la IA solo aportó la descripción.
  private ensamblar(
    ctx: ContextoCascada,
    oa: { codigo: string; descripcion: string },
    concepto: string,
    descripcionDibujo: string,
    clave: string,
  ): Lamina {
    return {
      asignatura: ctx.asignatura,
      curso: ctx.nivel,
      oa: { codigo: oa.codigo, descripcion: oa.descripcion },
      concepto,
      titulo: `Para colorear: ${concepto}`,
      consigna: 'Pinta el dibujo.',
      descripcion_dibujo: descripcionDibujo,
      imagen_clave: clave,
    };
  }
}
```

> Nota: `DependenciasGenerarMaterialColorear` ahora es un alias de `DependenciasResolverDibujo` (mismos campos `{ descripcion, imageGen, banco }`). El barrel existente `export type { DependenciasGenerarMaterialColorear }` en `packages/application/src/index.ts` sigue siendo válido.

- [ ] **Step 5: Barrel del nuevo use case** — en `packages/application/src/index.ts`, tras la línea 41 (`export type { DependenciasGenerarMaterialColorear } ...`) añade:

```ts
export { ResolverDibujoUseCase } from './aula/cascada/ResolverDibujoUseCase.js';
export type { DependenciasResolverDibujo, DibujoResuelto } from './aula/cascada/ResolverDibujoUseCase.js';
```

- [ ] **Step 6: Run tests — el nuevo Y la red de seguridad de la lámina**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ResolverDibujoUseCase.test.ts packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.test.ts`
Expected: PASS en ambos (la lámina se comporta idéntico). Luego `pnpm --filter @faro/application exec tsc --build` → 0 errores.

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/aula/cascada/ResolverDibujoUseCase.ts packages/application/src/aula/cascada/ResolverDibujoUseCase.test.ts packages/application/src/aula/cascada/GenerarMaterialColorearUseCase.ts packages/application/src/index.ts
git commit -m "refactor(ficha): extrae ResolverDibujoUseCase del pipeline de la lámina (DI estable)"
```

---

### Task 5: `INSTR_FICHA` + `entradaFicha` + `GenerarEjerciciosFichaUseCase`

**Files:**
- Modify: `packages/application/src/aula/cascada/generacion.ts`
- Create: `packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.test.ts`

**Interfaces:**
- Consumes: `LlmPort`, `SchemaEjerciciosFicha`, `ItemPruebaType`, `fugaDeTextoEnItems`, `GeneracionError`, `bloqueCorpus`, `exigirParsedConMeta`, `ContextoCascada`, `MetaGeneracion`.
- Produces: `INSTR_FICHA` (BloqueSistema), `entradaFicha(ctx, concepto?): string`, `GenerarEjerciciosFichaUseCase.ejecutarConMeta(ctx, concepto?): Promise<{ valor: ItemPruebaType[]; meta: MetaGeneracion }>`.

- [ ] **Step 1: Write the failing test** — `packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import type { LlmPort, SalidaEstructurada } from '@faro/domain';
import { GenerarEjerciciosFichaUseCase } from './GenerarEjerciciosFichaUseCase.js';
import type { ContextoCascada } from './tipos.js';

const ctx: ContextoCascada = {
  establecimiento: 'esc-1',
  asignatura: 'Matemática',
  nivel: '1º básico',
  oaSeleccionados: [{ codigo: 'MA01 OA 01', categoria: 'basal', descripcion: 'Contar del 0 al 100.' }],
  corpusVersionId: 'cv-1',
};

function llmCon(parsed: unknown): LlmPort {
  const salida: SalidaEstructurada<unknown> = {
    parsed,
    modelo: 'fake-sonnet',
    usage: { input: 100, output: 50, cacheRead: 0, cacheCreation: 0 },
    stopReason: parsed === null ? 'max_tokens' : 'end_turn',
  };
  return { generar: vi.fn(async () => salida) } as unknown as LlmPort;
}

const itemOk = { oa: 'MA01 OA 01', habilidad: 'recordar', tipo: 'completacion', enunciado: 'Cuenta: 1, 2, ____.' };

describe('GenerarEjerciciosFichaUseCase', () => {
  it('devuelve los ejercicios parseados', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon({ ejercicios: [itemOk, { ...itemOk, enunciado: 'Otro' }] }));
    const { valor } = await uc.ejecutarConMeta(ctx, 'conteo');
    expect(valor).toHaveLength(2);
    expect(valor[0]?.tipo).toBe('completacion');
  });

  it('lanza ficha_sin_oa si no hay OA seleccionado', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon({ ejercicios: [itemOk] }));
    await expect(uc.ejecutarConMeta({ ...ctx, oaSeleccionados: [] })).rejects.toThrow('ficha_sin_oa');
  });

  it('lanza ficha_sin_ejercicios si la IA devuelve lista vacía', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon({ ejercicios: [] }));
    await expect(uc.ejecutarConMeta(ctx)).rejects.toThrow('ficha_sin_ejercicios');
  });

  it('rechaza fuga de texto en un ítem', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon({ ejercicios: [{ ...itemOk, enunciado: 'x'.repeat(1001) }] }));
    await expect(uc.ejecutarConMeta(ctx)).rejects.toThrow(/fuga_texto/);
  });

  it('propaga el stopReason si parsed===null', async () => {
    const uc = new GenerarEjerciciosFichaUseCase(llmCon(null));
    await expect(uc.ejecutarConMeta(ctx)).rejects.toThrow('max_tokens');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.test.ts`
Expected: FAIL ("Cannot find module './GenerarEjerciciosFichaUseCase.js'").

- [ ] **Step 3a: Añade `INSTR_FICHA` y `entradaFicha`** — en `packages/application/src/aula/cascada/generacion.ts`, tras el bloque `INSTR_DIBUJO` (después de la línea 201) añade:

```ts

// Ficha educativa para colorear (Plan 2): ejercicios cortos anclados al OA para 1º-3º. REUSA el motor de
// PRUEBA (que sí soporta 1º-2º pre-lectores e ítems pictóricos); decisión del dueño. No es una prueba
// calificada: es práctica para colorear. La restricción de no-fuga es la misma de la prueba/guía.
export const INSTR_FICHA = instruccion(
  [
    'Genera 2 o 3 EJERCICIOS CORTOS para una FICHA PARA COLOREAR (niños de 1º a 3º básico), anclados al OA y al concepto provistos.',
    'Es para practicar y colorear (no es una prueba calificada). Lenguaje MUY simple y concreto.',
    "- Tipos apropiados al nivel: 'seleccion_multiple', 'verdadero_falso', 'completacion', 'ordenar' (con 'secuencia_correcta'), 'terminos_pareados' (con 'pares' columnaA↔columnaB) o 'pictorico' (con 'imagen' = una DESCRIPCIÓN BREVE, 1 frase, del apoyo visual; nunca una imagen real). Selección múltiple y verdadero/falso con EXACTAMENTE una alternativa correcta.",
    '- En 1º–2º (pre-lectores): enunciados muy breves para que el/la docente los lea en voz alta; prefiere apoyo visual (ítems pictóricos).',
    "- Cada ítem lleva 'oa' = el código del OA provisto, y 'retroalimentacion' = qué orientar si el/la estudiante falla.",
    "- Cada campo de texto contiene SOLO el contenido del ítem para el/la estudiante: NUNCA escribas notas para ti, razonamiento ni instrucciones de formato dentro de un campo (sobre todo en 'imagen').",
  ].join('\n'),
);
```

y tras `entradaDibujo` (después de la línea 275) añade:

```ts
/** Entrada para los ejercicios de la ficha: asignatura/nivel/OA + el concepto (tema) opcional. */
export function entradaFicha(ctx: ContextoCascada, concepto?: string): string {
  const oa = ctx.oaSeleccionados[0];
  const lineaConcepto = concepto !== undefined && concepto.trim() !== ''
    ? `Tema de la ficha: ${concepto}`
    : 'Tema de la ficha: (derívalo del OA)';
  return [
    `Asignatura: ${ctx.asignatura}`,
    `Nivel: ${ctx.nivel}`,
    `OA: ${oa?.codigo} — ${oa?.descripcion}`,
    lineaConcepto,
    'Genera 2 o 3 ejercicios cortos para una ficha para colorear, anclados a ESE OA.',
  ].join('\n');
}
```

- [ ] **Step 3b: Write the use case** — `packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.ts`

```ts
// packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.ts
// Ficha educativa (Plan 2): genera los EJERCICIOS anclados al OA reusando el motor de PRUEBA
// (SchemaEjerciciosFicha = lista de ItemPrueba; INSTR_FICHA soporta 1º-2º pre-lectores e ítems pictóricos).
// La IA solo redacta los ítems; el use case valida schema + no-fuga. Nacen borrador (los persiste el worker).
// INV-5: importa SOLO de @faro/domain y hermanos ./ — nunca @faro/infra-*.

import type { ItemPruebaType, LlmPort } from '@faro/domain';
import { fugaDeTextoEnItems, GeneracionError, SchemaEjerciciosFicha } from '@faro/domain';
import { bloqueCorpus, entradaFicha, exigirParsedConMeta, INSTR_FICHA } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export class GenerarEjerciciosFichaUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    ctx: ContextoCascada,
    concepto?: string,
  ): Promise<{ valor: ItemPruebaType[]; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('ficha_sin_oa');

    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaEjerciciosFicha,
      system: [bloqueCorpus(ctx), INSTR_FICHA],
      entradaUsuario: entradaFicha(ctx, concepto),
    });
    const { valor, meta } = exigirParsedConMeta(salida);

    if (valor.ejercicios.length === 0) throw new GeneracionError('ficha_sin_ejercicios');

    // Guardia anti-fuga: el schema (z.string()) no acota el texto libre y el SDK no soporta maxLength
    // en structured outputs → se valida tras parsear y se rechaza+reintenta (INV-2). Reusa la guardia de prueba.
    const fuga = fugaDeTextoEnItems(valor.ejercicios);
    if (fuga !== null) {
      throw new GeneracionError(`fuga_texto:${fuga.campo}#${fuga.itemIndex}(${fuga.largo})`);
    }

    return { valor: valor.ejercicios, meta };
  }

  async ejecutar(ctx: ContextoCascada, concepto?: string): Promise<ItemPruebaType[]> {
    return (await this.ejecutarConMeta(ctx, concepto)).valor;
  }
}
```

- [ ] **Step 3c: Barrel** — en `packages/application/src/index.ts`, tras el bloque de `ResolverDibujoUseCase` (Task 4 Step 5) añade:

```ts
export { GenerarEjerciciosFichaUseCase } from './aula/cascada/GenerarEjerciciosFichaUseCase.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.test.ts`
Expected: PASS. Luego `pnpm --filter @faro/application exec tsc --build` → 0 errores.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/generacion.ts packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.ts packages/application/src/aula/cascada/GenerarEjerciciosFichaUseCase.test.ts packages/application/src/index.ts
git commit -m "feat(ficha): motor de ejercicios (INSTR_FICHA + GenerarEjerciciosFichaUseCase)"
```

---

### Task 6: `GenerarFichaUseCase` (orquesta dibujo + ejercicios → `Ficha`)

**Files:**
- Create: `packages/application/src/aula/cascada/GenerarFichaUseCase.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts`

**Interfaces:**
- Consumes: `GenerarDescripcionDibujoUseCase`, `ImageGenPort`, `BancoImagenesGeneradasPort`, `GenerarEjerciciosFichaUseCase`, `ResolverDibujoUseCase`, `Ficha`, `SchemaFicha`, `fugaDeTextoEnFicha`, `gradoDeNivel`, `tramoDeNivel`, `claveDibujo`, `GeneracionError`, `ContextoCascada`, `MetaGeneracion`.
- Produces: `GenerarFichaUseCase.ejecutarConMeta(ctx, opts?): Promise<{ valor: Ficha; meta: MetaGeneracion }>`; `interface DependenciasGenerarFicha { descripcion; imageGen; banco; ejercicios }`.

- [ ] **Step 1: Write the failing test** — `packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import type { BancoImagenesGeneradasPort } from '@faro/domain';
import { claveDibujo } from '@faro/domain';
import { GenerarFichaUseCase } from './GenerarFichaUseCase.js';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { GenerarEjerciciosFichaUseCase } from './GenerarEjerciciosFichaUseCase.js';
import type { ContextoCascada } from './tipos.js';

const META_D = { modelo: 'fake', usage: { input: 4, output: 2, cacheRead: 0, cacheCreation: 0 }, stopReason: 'end_turn' };
const META_E = { modelo: 'fake-sonnet', usage: { input: 100, output: 50, cacheRead: 0, cacheCreation: 0 }, stopReason: 'end_turn' };
const item = { oa: 'MA01 OA 01', habilidad: 'recordar' as const, tipo: 'completacion' as const, enunciado: 'Cuenta: 1, 2, ____.' };

function ctxGrado(n: string): ContextoCascada {
  return { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: n, oaSeleccionados: [{ codigo: 'MA01 OA 01', categoria: 'basal', descripcion: 'Contar.' }], corpusVersionId: 'cv-1' };
}

function deps() {
  const descripcion = { ejecutarConMeta: vi.fn(async () => ({ valor: { concepto: 'frutas', descripcion_en: 'apples' }, meta: META_D })), ejecutar: vi.fn() } as unknown as GenerarDescripcionDibujoUseCase;
  const imageGen = { generarLineArt: vi.fn(async () => Buffer.from('png')) };
  const banco: BancoImagenesGeneradasPort = { buscar: vi.fn(async () => null), guardar: vi.fn(async () => {}) };
  const ejercicios = { ejecutarConMeta: vi.fn(async () => ({ valor: [item], meta: META_E })), ejecutar: vi.fn() } as unknown as GenerarEjerciciosFichaUseCase;
  return { descripcion, imageGen, banco, ejercicios };
}

describe('GenerarFichaUseCase', () => {
  it('ensambla la ficha: dibujo + ejercicios, perfil_nivel por tramo, imagen_clave determinista', async () => {
    const d = deps();
    const uc = new GenerarFichaUseCase(d);
    const { valor: ficha, meta } = await uc.ejecutarConMeta(ctxGrado('1º básico'), { concepto: 'frutas' });

    expect(ficha.perfil_nivel).toBe('1-2');
    expect(ficha.concepto).toBe('frutas');
    expect(ficha.titulo).toBe('Ficha para colorear: frutas');
    expect(ficha.consigna_dibujo).toBe('Colorea el dibujo.');
    expect(ficha.ejercicios).toHaveLength(1);
    expect(ficha.imagen_clave).toBe(claveDibujo('MA01 OA 01', 'frutas'));
    expect(ficha.descripcion_dibujo).toBe('apples');
    // meta combinada: usage sumado (dibujo + ejercicios).
    expect(meta.usage.input).toBe(104);
    expect(meta.usage.output).toBe(52);
  });

  it('3º básico cae en tramo 3-4', async () => {
    const uc = new GenerarFichaUseCase(deps());
    const { valor } = await uc.ejecutarConMeta(ctxGrado('3º básico'));
    expect(valor.perfil_nivel).toBe('3-4');
  });

  it('rechaza grado > 3 (ficha_tramo_no_soportado) ANTES de llamar a la IA', async () => {
    const d = deps();
    const uc = new GenerarFichaUseCase(d);
    await expect(uc.ejecutarConMeta(ctxGrado('4º básico'))).rejects.toThrow('ficha_tramo_no_soportado');
    expect(d.ejercicios.ejecutarConMeta).not.toHaveBeenCalled();
  });

  it('lanza ficha_sin_oa si no hay OA', async () => {
    const uc = new GenerarFichaUseCase(deps());
    const ctx = { ...ctxGrado('1º básico'), oaSeleccionados: [] };
    await expect(uc.ejecutarConMeta(ctx)).rejects.toThrow('ficha_sin_oa');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts`
Expected: FAIL ("Cannot find module './GenerarFichaUseCase.js'").

- [ ] **Step 3: Write the implementation** — `packages/application/src/aula/cascada/GenerarFichaUseCase.ts`

```ts
// packages/application/src/aula/cascada/GenerarFichaUseCase.ts
// Ficha educativa para colorear (Plan 2): orquesta el DIBUJO (ResolverDibujoUseCase, cache por OA/concepto,
// compartido con la lámina) + los EJERCICIOS (GenerarEjerciciosFichaUseCase, motor de prueba) y SOBRESCRIBE
// los campos fijos de la ficha. Gate por grado ≤ 3 (1º-3º). Nace borrador (lo persiste el worker).
// INV-5: importa SOLO de @faro/domain y hermanos ./ — nunca @faro/infra-*.

import type { BancoImagenesGeneradasPort, Ficha, ImageGenPort } from '@faro/domain';
import { fugaDeTextoEnFicha, GeneracionError, gradoDeNivel, SchemaFicha, tramoDeNivel } from '@faro/domain';
import type { GenerarDescripcionDibujoUseCase } from './GenerarDescripcionDibujoUseCase.js';
import type { GenerarEjerciciosFichaUseCase } from './GenerarEjerciciosFichaUseCase.js';
import { ResolverDibujoUseCase } from './ResolverDibujoUseCase.js';
import type { MetaGeneracion } from './generacion.js';
import type { ContextoCascada } from './tipos.js';

export interface DependenciasGenerarFicha {
  readonly descripcion: GenerarDescripcionDibujoUseCase;
  readonly imageGen: ImageGenPort;
  readonly banco: BancoImagenesGeneradasPort;
  readonly ejercicios: GenerarEjerciciosFichaUseCase;
}

export class GenerarFichaUseCase {
  private readonly resolver: ResolverDibujoUseCase;
  private readonly ejercicios: GenerarEjerciciosFichaUseCase;

  constructor(deps: DependenciasGenerarFicha) {
    this.resolver = new ResolverDibujoUseCase({ descripcion: deps.descripcion, imageGen: deps.imageGen, banco: deps.banco });
    this.ejercicios = deps.ejercicios;
  }

  async ejecutarConMeta(
    ctx: ContextoCascada,
    opts?: { concepto?: string; regenerar?: boolean },
  ): Promise<{ valor: Ficha; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('ficha_sin_oa');

    // Gate por GRADO: solo 1º-3º básico (igual que la lámina; el PPT/prueba/guía no se tocan).
    const grado = gradoDeNivel(ctx.nivel);
    if (!(grado >= 1 && grado <= 3)) throw new GeneracionError('ficha_tramo_no_soportado');

    const dibujo = await this.resolver.resolver(ctx, oa.codigo, opts);
    const { valor: ejercicios, meta: metaEj } = await this.ejercicios.ejecutarConMeta(ctx, opts?.concepto);

    // perfil_nivel data-driven por tramo; el gate garantiza grado ≤ 3 → tramo ∈ {'1-2','3-4'} (sin cast).
    const tramo = tramoDeNivel(ctx.nivel);
    const perfilNivel: '1-2' | '3-4' = tramo === '1-2' ? '1-2' : '3-4';

    const ficha: Ficha = {
      asignatura: ctx.asignatura,
      curso: ctx.nivel,
      oa: { codigo: oa.codigo, descripcion: oa.descripcion },
      concepto: dibujo.concepto,
      perfil_nivel: perfilNivel,
      titulo: `Ficha para colorear: ${dibujo.concepto}`,
      consigna_dibujo: 'Colorea el dibujo.',
      ejercicios,
      descripcion_dibujo: dibujo.descripcion,
      imagen_clave: dibujo.clave,
    };

    const valido = SchemaFicha.parse(ficha);
    const fuga = fugaDeTextoEnFicha(valido);
    if (fuga !== null) {
      throw new GeneracionError(`fuga_texto:${fuga.campo}#${fuga.itemIndex}(${fuga.largo})`);
    }

    return { valor: valido, meta: combinarMeta(metaEj, dibujo.meta) };
  }

  async ejecutar(ctx: ContextoCascada, opts?: { concepto?: string; regenerar?: boolean }): Promise<Ficha> {
    return (await this.ejecutarConMeta(ctx, opts)).valor;
  }
}

// La ficha hace 2 llamadas a la IA (descripción del dibujo + ejercicios). Para una sola traza, se suma el
// uso; el modelo/stopReason del principal (ejercicios, que dominan el costo). En cache-hit del dibujo su
// uso es ceros → no distorsiona.
function combinarMeta(principal: MetaGeneracion, secundaria: MetaGeneracion): MetaGeneracion {
  return {
    modelo: principal.modelo,
    stopReason: principal.stopReason,
    usage: {
      input: principal.usage.input + secundaria.usage.input,
      output: principal.usage.output + secundaria.usage.output,
      cacheRead: principal.usage.cacheRead + secundaria.usage.cacheRead,
      cacheCreation: principal.usage.cacheCreation + secundaria.usage.cacheCreation,
    },
  };
}
```

- [ ] **Step 4: Barrel** — en `packages/application/src/index.ts`, tras la línea de `GenerarEjerciciosFichaUseCase` (Task 5) añade:

```ts
export { GenerarFichaUseCase } from './aula/cascada/GenerarFichaUseCase.js';
export type { DependenciasGenerarFicha } from './aula/cascada/GenerarFichaUseCase.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts`
Expected: PASS. Luego `pnpm --filter @faro/application exec tsc --build` → 0 errores.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/aula/cascada/GenerarFichaUseCase.ts packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts packages/application/src/index.ts
git commit -m "feat(ficha): GenerarFichaUseCase (dibujo + ejercicios, gate 1º-3º)"
```

---

### Task 7: `ProcesarTrabajoFichaUseCase` (handler de la cola)

**Files:**
- Create: `packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.test.ts`

**Interfaces:**
- Consumes: `JobRepository`, `OaRepository`, `ReposTransaccion`, `UnidadDeTrabajo`, `GenerarFichaUseCase`, `GeneracionError`, `ContextoCascada`.
- Produces: `ProcesarTrabajoFichaUseCase.ejecutarSiguiente(workerId): Promise<ResultadoProcesarFicha>`; `type ResultadoProcesarFicha`; `interface DependenciasProcesarFicha`.

- [ ] **Step 1: Write the failing test** — `packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobRepository, OaRepository, ReposTransaccion, UnidadDeTrabajo, Ficha } from '@faro/domain';
import { GeneracionError } from '@faro/domain';
import { ProcesarTrabajoFichaUseCase } from './ProcesarTrabajoFichaUseCase.js';
import type { GenerarFichaUseCase } from './GenerarFichaUseCase.js';

const oa = { codigo: 'MA01 OA 01', descripcion: 'Contar.', indicadores: [] as string[], corpusVersionId: 'cv-1' };
const ficha = { asignatura: 'Matemática', curso: '1º básico', oa: { codigo: oa.codigo, descripcion: oa.descripcion }, concepto: 'frutas', perfil_nivel: '1-2', titulo: 'Ficha para colorear: frutas', consigna_dibujo: 'Colorea el dibujo.', ejercicios: [], descripcion_dibujo: 'apples', imagen_clave: 'abcd1234' } as unknown as Ficha;
const META = { modelo: 'fake', usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 }, stopReason: 'end_turn' };

function jobsCon(job: { id: string; payload: unknown; intentos: number } | null) {
  return {
    tomarSiguienteFicha: vi.fn(async () => job),
    marcarHecho: vi.fn(async () => {}),
    reintentar: vi.fn(async () => {}),
    marcarFallido: vi.fn(async () => {}),
  } as unknown as JobRepository;
}
const oas = { porAsignaturaNivel: vi.fn(async () => [oa]) } as unknown as OaRepository;
function uowQueCaptura(sink: { hecho?: { jobId: string; documentoId: string } }): UnidadDeTrabajo {
  return {
    enTransaccion: vi.fn(async (fn: (r: ReposTransaccion) => Promise<unknown>) => {
      const repos = {
        documentos: { crearBorrador: vi.fn(async () => ({ id: 'doc-1' })) },
        trazas: { registrar: vi.fn(async () => {}) },
        jobs: { marcarHecho: vi.fn(async (id: string, docId: string) => { sink.hecho = { jobId: id, documentoId: docId }; }) },
      } as unknown as ReposTransaccion;
      return fn(repos);
    }),
  } as unknown as UnidadDeTrabajo;
}
const generarOk = { ejecutarConMeta: vi.fn(async () => ({ valor: ficha, meta: META })) } as unknown as GenerarFichaUseCase;

const payload = { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: '1º básico', oaCodigo: 'MA01 OA 01' };

describe('ProcesarTrabajoFichaUseCase', () => {
  it('sin trabajo → sin_trabajo', async () => {
    const uc = new ProcesarTrabajoFichaUseCase({ jobs: jobsCon(null), oas, generar: generarOk, uow: uowQueCaptura({}) });
    expect(await uc.ejecutarSiguiente('w1')).toEqual({ tipo: 'sin_trabajo' });
  });

  it('happy path: persiste borrador + traza y marca el job hecho', async () => {
    const sink: { hecho?: { jobId: string; documentoId: string } } = {};
    const uc = new ProcesarTrabajoFichaUseCase({ jobs: jobsCon({ id: 'job-1', payload, intentos: 1 }), oas, generar: generarOk, uow: uowQueCaptura(sink) });
    const r = await uc.ejecutarSiguiente('w1');
    expect(r).toEqual({ tipo: 'hecho', jobId: 'job-1', documentoId: 'doc-1' });
    expect(sink.hecho).toEqual({ jobId: 'job-1', documentoId: 'doc-1' });
  });

  it('OA inexistente → fallido permanente', async () => {
    const oasVacio = { porAsignaturaNivel: vi.fn(async () => []) } as unknown as OaRepository;
    const jobs = jobsCon({ id: 'job-2', payload, intentos: 1 });
    const uc = new ProcesarTrabajoFichaUseCase({ jobs, oas: oasVacio, generar: generarOk, uow: uowQueCaptura({}) });
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('fallido');
    expect(jobs.marcarFallido).toHaveBeenCalledOnce();
  });

  it('ficha_tramo_no_soportado → fallido permanente (no reintenta)', async () => {
    const jobs = jobsCon({ id: 'job-3', payload, intentos: 0 });
    const generar = { ejecutarConMeta: vi.fn(async () => { throw new GeneracionError('ficha_tramo_no_soportado'); }) } as unknown as GenerarFichaUseCase;
    const uc = new ProcesarTrabajoFichaUseCase({ jobs, oas, generar, uow: uowQueCaptura({}) });
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('fallido');
    expect(jobs.reintentar).not.toHaveBeenCalled();
  });

  it('fuga_texto → reintento transitorio (intentos < max)', async () => {
    const jobs = jobsCon({ id: 'job-4', payload, intentos: 1 });
    const generar = { ejecutarConMeta: vi.fn(async () => { throw new GeneracionError('fuga_texto:enunciado#0(1200)'); }) } as unknown as GenerarFichaUseCase;
    const uc = new ProcesarTrabajoFichaUseCase({ jobs, oas, generar, uow: uowQueCaptura({}) });
    const r = await uc.ejecutarSiguiente('w1');
    expect(r.tipo).toBe('reintenta');
    expect(jobs.reintentar).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.test.ts`
Expected: FAIL ("Cannot find module './ProcesarTrabajoFichaUseCase.js'").

- [ ] **Step 3: Write the implementation** — `packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.ts`

```ts
// packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.ts
// Ficha educativa (Plan 2) · Orquesta la cola asíncrona 'ficha_colorear'. Espejo de
// ProcesarTrabajoMaterialColorearUseCase: standalone desde un OA (carga el OA del corpus publicado),
// genera la ficha y persiste UN borrador + traza_ia en una transacción (uow). INV-3: nace 'borrador'.

import type {
  JobRepository,
  OaRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { GeneracionError } from '@faro/domain';
import type { ContextoCascada } from './tipos.js';
import type { GenerarFichaUseCase } from './GenerarFichaUseCase.js';

export type ResultadoProcesarFicha =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarFicha {
  readonly jobs: JobRepository;
  readonly oas: OaRepository;
  readonly generar: GenerarFichaUseCase;
  readonly uow: UnidadDeTrabajo;
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoFichaUseCase {
  private readonly jobs: JobRepository;
  private readonly oas: OaRepository;
  private readonly generar: GenerarFichaUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarFicha) {
    this.jobs = deps.jobs;
    this.oas = deps.oas;
    this.generar = deps.generar;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarFicha> {
    const job = await this.jobs.tomarSiguienteFicha(workerId);
    if (job === null) return { tipo: 'sin_trabajo' };

    const { establecimiento, asignatura, nivel, oaCodigo, concepto, regenerar } = job.payload;

    // Carga el OA del corpus PUBLICADO (el adapter resuelve la corpus_version vigente). PERMANENTE si falta.
    const oasNivel = await this.oas.porAsignaturaNivel(asignatura, nivel);
    const oa = oasNivel.find((o) => o.codigo === oaCodigo);
    if (oa === undefined) {
      return this.fallar(job.id, `OA '${oaCodigo}' no existe en el corpus publicado de ${asignatura} ${nivel}.`);
    }

    const ctx: ContextoCascada = {
      establecimiento,
      asignatura,
      nivel,
      oaSeleccionados: [
        {
          codigo: oa.codigo,
          categoria: 'basal',
          descripcion: oa.descripcion,
          ...(oa.indicadores.length > 0 ? { indicadores: oa.indicadores } : {}),
        },
      ],
      corpusVersionId: oa.corpusVersionId,
    };

    try {
      const { valor: ficha, meta } = await this.generar.ejecutarConMeta(ctx, {
        ...(concepto !== undefined ? { concepto } : {}),
        ...(regenerar !== undefined ? { regenerar } : {}),
      });

      // Persistencia ATÓMICA: borrador (sin origenId — ficha standalone) + traza + marcarHecho.
      const documentoId = await this.uow.enTransaccion(async (repos: ReposTransaccion) => {
        const doc = await repos.documentos.crearBorrador({
          tipo: 'ficha_colorear',
          establecimientoId: establecimiento,
          corpusVersionId: oa.corpusVersionId, // misma versión que cargó el OA (INV-4)
          payload: ficha,
          estadoGeneracion: 'validado', // el schema valida en el ensamblaje; sin gate determinista extra
        });
        await repos.trazas.registrar({
          documentoId: doc.id,
          corpusVersionId: oa.corpusVersionId,
          modelo: meta.modelo,
          rutaDecision: 'ficha/colorear',
          promptHash: '',
          recuperado: [],
          citas: [],
          evals: null,
          usage: meta.usage,
          revisor: null,
        });
        await repos.jobs.marcarHecho(job.id, doc.id);
        return doc.id;
      });

      return { tipo: 'hecho', jobId: job.id, documentoId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // Permanentes (no cambian entre reintentos): tramo no soportado / sin OA. 'fuga_texto:*' y
      // 'ficha_sin_ejercicios' NO son permanentes (una regeneración puede salir limpia).
      const esPermanente =
        e instanceof GeneracionError &&
        (e.stopReason === 'ficha_tramo_no_soportado' || e.stopReason === 'ficha_sin_oa');
      if (!esPermanente && job.intentos < this.maxIntentos) {
        await this.jobs.reintentar(job.id, mensaje);
        return { tipo: 'reintenta', jobId: job.id, error: mensaje };
      }
      await this.jobs.marcarFallido(job.id, mensaje);
      return { tipo: 'fallido', jobId: job.id, error: mensaje };
    }
  }

  /** Marca el job como fallido (error permanente de input) y devuelve el resultado discriminado. */
  private async fallar(jobId: string, error: string): Promise<ResultadoProcesarFicha> {
    await this.jobs.marcarFallido(jobId, error);
    return { tipo: 'fallido', jobId, error };
  }
}
```

- [ ] **Step 4: Barrel** — en `packages/application/src/index.ts`, tras el bloque de `GenerarFichaUseCase` añade:

```ts
export { ProcesarTrabajoFichaUseCase } from './aula/cascada/ProcesarTrabajoFichaUseCase.js';
export type { ResultadoProcesarFicha, DependenciasProcesarFicha } from './aula/cascada/ProcesarTrabajoFichaUseCase.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.test.ts`
Expected: PASS. Luego `pnpm --filter @faro/application exec tsc --build` → 0 errores.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.ts packages/application/src/aula/cascada/ProcesarTrabajoFichaUseCase.test.ts packages/application/src/index.ts
git commit -m "feat(ficha): ProcesarTrabajoFichaUseCase (handler de la cola ficha_colorear)"
```

---

### Task 8: Extraer `renderItemAlumno` + helpers docx (refactor de la guía)

**Files:**
- Create: `packages/infra-export/src/docx/itemsAlumno.ts`
- Modify: `packages/infra-export/src/docx/construirDocumentoGuia.ts`
- Test (nuevo): `packages/infra-export/src/docx/itemsAlumno.test.ts`
- Test (red de seguridad, ya existe): los tests de la guía (`construirDocumentoGuia*.test.ts` / `GuiaExportAdapter*.test.ts`) deben quedar verdes **sin tocarlos**.

**Interfaces:**
- Produces (desde `itemsAlumno.ts`): `BORDES_TABLA`, `CHK`, `celda`, `fila`, `tabla`, `parrafosTexto`, `notaBorrador`, `titSeccion`, `enunciadoParrafo`, `lineaRespuesta`, `cajaPlaceholder`, `letra`, `separarTablasAdyacentes`, `renderItemAlumno(item: ItemPlano): Array<Paragraph | Table>`.

- [ ] **Step 1: Write the implementation** — `packages/infra-export/src/docx/itemsAlumno.ts` (mueve aquí, verbatim, las funciones privadas de `construirDocumentoGuia.ts`: `BORDE`/`BORDES_TABLA`, `CHK`, `renderItemGuia`→`renderItemAlumno`, `titSeccion`, `notaBorrador`, `enunciadoParrafo`, `lineaRespuesta`, `cajaPlaceholder`, `parrafosTexto`, `celda`, `fila`, `tabla`, `letra`, `separarTablasAdyacentes` — exportándolas):

```ts
// packages/infra-export/src/docx/itemsAlumno.ts
// Helpers docx compartidos para documentos del ALUMNO (guía + ficha): render de un ItemPlano (variante
// alumno, sin solución) + primitivas de tabla/encabezado. Extraído de construirDocumentoGuia para que la
// FICHA (Plan 2) reúse el MISMO render de ejercicios sin duplicar ~80 líneas de switch.

import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { ItemPlano } from './planoPrueba.js';

const BORDE = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
export const BORDES_TABLA = {
  top: BORDE,
  bottom: BORDE,
  left: BORDE,
  right: BORDE,
  insideHorizontal: BORDE,
  insideVertical: BORDE,
};

export const CHK = '☐';

/**
 * Renderiza un ítem de trabajo del alumno (variante alumno — sin solución ni retroalimentación).
 * Replica el switch de renderItem de PruebaExportAdapter con mostrarSolucion=false fijo.
 */
export function renderItemAlumno(item: ItemPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];

  switch (item.tipo) {
    case 'seleccion_multiple': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      for (const alt of item.alternativas) {
        out.push(
          new Paragraph({
            indent: { left: 360 },
            children: [new TextRun({ text: `${CHK} ${alt.etiqueta}) ${alt.texto}` })],
          }),
        );
      }
      break;
    }
    case 'verdadero_falso': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      out.push(
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: `${CHK} V     ${CHK} F` })],
        }),
      );
      break;
    }
    case 'completacion': {
      out.push(
        new Paragraph({
          spacing: { before: 60 },
          children: [new TextRun({ text: `${item.numero}. ${item.enunciado} ` }), new TextRun({ text: '____________' })],
        }),
      );
      break;
    }
    case 'desarrollo': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      for (let i = 0; i < 3; i++) out.push(lineaRespuesta());
      break;
    }
    case 'ordenar': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      for (const el of item.elementos) {
        out.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: `____ ${el}` })] }));
      }
      break;
    }
    case 'terminos_pareados': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      const n = Math.max(item.columnaA.length, item.columnaB.length);
      if (n === 0) {
        out.push(new Paragraph({ children: [new TextRun('—')] }));
        break;
      }
      const filas: TableRow[] = [
        fila([celda(parrafosTexto('Columna A', true)), celda(parrafosTexto('Columna B', true))]),
      ];
      for (let i = 0; i < n; i++) {
        const a = item.columnaA[i];
        const b = item.columnaB[i];
        filas.push(
          fila([
            celda(parrafosTexto(a !== undefined ? `${i + 1}. ${a}` : '')),
            celda(parrafosTexto(b !== undefined ? `${letra(i)}. ${b}   ____` : '')),
          ]),
        );
      }
      out.push(tabla(filas));
      break;
    }
    case 'pictorico': {
      out.push(enunciadoParrafo(item.numero, item.enunciado, item.puntaje));
      out.push(cajaPlaceholder(item.imagenPlaceholder));
      break;
    }
  }

  return out;
}

export function titSeccion(texto: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: texto, bold: true, size: 22 })],
  });
}

export function notaBorrador(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: 'Borrador generado por Faro · requiere revisión docente (HIL)',
        italics: true,
        color: '888888',
        size: 16,
      }),
    ],
  });
}

export function enunciadoParrafo(numero: number, enunciado: string, puntaje?: number): Paragraph {
  const sufijo = puntaje !== undefined ? `  (${puntaje} pts)` : '';
  return new Paragraph({
    spacing: { before: 60 },
    children: [new TextRun({ text: `${numero}. ${enunciado}${sufijo}` })],
  });
}

export function lineaRespuesta(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 1 } },
    spacing: { before: 120 },
    children: [new TextRun({ text: '' })],
  });
}

/** Caja con borde para un placeholder visible "IMAGEN: …" (ítem pictórico), como en la prueba. */
export function cajaPlaceholder(texto: string): Table {
  const cell = celda([
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: texto, italics: true, color: '555555' })],
    }),
  ]);
  return new Table({
    rows: [new TableRow({ children: [cell] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES_TABLA,
  });
}

export function parrafosTexto(texto: string, bold = false): Paragraph[] {
  return [new Paragraph({ children: [new TextRun({ text: texto, bold })] })];
}

export function celda(children: Array<Paragraph | Table>, opc: { fill?: string; ancho?: number } = {}): TableCell {
  return new TableCell({
    children,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    ...(opc.fill !== undefined ? { shading: { fill: opc.fill, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    ...(opc.ancho !== undefined ? { width: { size: opc.ancho, type: WidthType.PERCENTAGE } } : {}),
  });
}

export function fila(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells });
}

/** Tabla full-width con bordes negros finos. Guardia: 0 filas → degrada a un párrafo "—". */
export function tabla(rows: TableRow[]): Table {
  const filas = rows.length > 0 ? rows : [fila([celda([new Paragraph({ children: [new TextRun('—')] })])])];
  return new Table({ rows: filas, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDES_TABLA });
}

/** Letra minúscula (a, b, c…) para la columna B de términos pareados. */
export function letra(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}

/** Inserta un párrafo mínimo entre tablas adyacentes (evita fusión en Word). */
export function separarTablasAdyacentes(hijos: ReadonlyArray<Paragraph | Table>): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  hijos.forEach((h, i) => {
    const previo = hijos[i - 1];
    if (i > 0 && previo instanceof Table && h instanceof Table) {
      out.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: '', size: 2 })] }));
    }
    out.push(h);
  });
  return out;
}
```

- [ ] **Step 2: Repunta `construirDocumentoGuia.ts` al módulo compartido** — reemplaza su bloque de imports docx + sus helpers privados por imports de `./itemsAlumno.js`, y `renderItemGuia` por `renderItemAlumno`. El archivo queda así (las secciones `encabezadoDocumento`/`seccionExplicacion`/`seccionEjemplo`/`seccionEjercicios` se conservan; solo cambian los helpers que ahora se importan):

```ts
// packages/infra-export/src/docx/construirDocumentoGuia.ts
// Renderiza el IR de la GUÍA del alumno a un `Document` de docx. Reusa los helpers compartidos de
// itemsAlumno.ts (render de ítems variante alumno + primitivas docx), iguales que la ficha (Plan 2).

import { AlignmentType, Document, PageOrientation, Paragraph, Table, TextRun } from 'docx';
import type { GuiaPlano } from './planoGuia.js';
import {
  celda,
  fila,
  notaBorrador,
  parrafosTexto,
  renderItemAlumno,
  separarTablasAdyacentes,
  tabla,
  titSeccion,
} from './itemsAlumno.js';

/** Construye el Document docx de la guía a partir del IR. */
export function construirDocumentoGuia(plano: GuiaPlano): Document {
  const children: Array<Paragraph | Table> = [
    ...encabezadoDocumento(plano),
    ...seccionExplicacion(plano),
    ...seccionEjemplo(plano),
    ...seccionEjercicios(plano),
  ];

  return new Document({
    styles: { default: { document: { run: { font: 'Arial' } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: separarTablasAdyacentes(children),
      },
    ],
  });
}

function encabezadoDocumento(plano: GuiaPlano): Array<Paragraph | Table> {
  const e = plano.encabezado;
  const out: Array<Paragraph | Table> = [];

  out.push(new Paragraph({ children: [new TextRun({ text: e.lineaColegio, bold: true, size: 22 })] }));
  if (e.docente !== undefined) {
    out.push(new Paragraph({ children: [new TextRun({ text: `Profesora: ${e.docente}`, size: 18 })] }));
  }
  out.push(new Paragraph({ children: [new TextRun({ text: `Asignatura: ${e.asignatura}`, size: 18 })] }));

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 0 },
      children: [new TextRun({ text: e.titulo, bold: true, size: 28 })],
    }),
  );
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: e.curso, size: 20 })],
    }),
  );

  out.push(notaBorrador());

  if (e.identificacion.length > 0) {
    out.push(
      tabla(e.identificacion.map((filaCeldas) => fila(filaCeldas.map((texto) => celda(parrafosTexto(texto)))))),
    );
  }

  out.push(
    tabla([
      fila([
        celda([
          new Paragraph({
            children: [
              new TextRun({ text: `${e.oa.codigo}: `, bold: true }),
              new TextRun({ text: e.oa.descripcion }),
            ],
          }),
        ]),
      ]),
    ]),
  );

  out.push(
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text: 'Conocimiento: ', bold: true }), new TextRun({ text: e.conocimiento })],
    }),
  );

  return out;
}

function seccionExplicacion(plano: GuiaPlano): Array<Paragraph | Table> {
  return [
    titSeccion('¿Qué vamos a aprender?'),
    new Paragraph({ spacing: { before: 40, after: 120 }, children: [new TextRun({ text: plano.explicacion })] }),
  ];
}

function seccionEjemplo(plano: GuiaPlano): Array<Paragraph | Table> {
  return [
    titSeccion('Ejemplo'),
    new Paragraph({ spacing: { before: 40, after: 120 }, children: [new TextRun({ text: plano.ejemplo })] }),
  ];
}

function seccionEjercicios(plano: GuiaPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [titSeccion('Ahora practica')];
  for (const item of plano.ejercicios) {
    out.push(...renderItemAlumno(item));
  }
  return out;
}
```

- [ ] **Step 3: Write a focused unit test** — `packages/infra-export/src/docx/itemsAlumno.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Paragraph, Table } from 'docx';
import { renderItemAlumno } from './itemsAlumno.js';
import type { ItemPlano } from './planoPrueba.js';

describe('renderItemAlumno', () => {
  it('selección múltiple: enunciado + una línea por alternativa', () => {
    const item: ItemPlano = {
      tipo: 'seleccion_multiple',
      numero: 1,
      enunciado: '¿Cuántas patas tiene un gato?',
      alternativas: [
        { etiqueta: 'A', texto: '2', correcta: false },
        { etiqueta: 'B', texto: '4', correcta: true },
      ],
    };
    const out = renderItemAlumno(item);
    expect(out).toHaveLength(3); // enunciado + 2 alternativas
    expect(out.every((n) => n instanceof Paragraph)).toBe(true);
  });

  it('términos pareados: produce una tabla', () => {
    const item: ItemPlano = {
      tipo: 'terminos_pareados',
      numero: 2,
      enunciado: 'Une.',
      columnaA: ['perro', 'gato'],
      columnaB: ['guau', 'miau'],
    };
    const out = renderItemAlumno(item);
    expect(out.some((n) => n instanceof Table)).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests — el nuevo Y la red de seguridad de la guía**

Run: `pnpm exec vitest run packages/infra-export/src/docx/itemsAlumno.test.ts packages/infra-export/src/docx/`
Expected: PASS, incluyendo TODOS los tests existentes de la guía (`construirDocumentoGuia` / `GuiaExportAdapter`) — el output no cambió. Luego `pnpm --filter @faro/infra-export exec tsc --build` → 0 errores.

> ⚠️ Reviewer: si algún test de la guía cambia de resultado, el repunte alteró el render — investígalo antes de continuar.

- [ ] **Step 5: Commit**

```bash
git add packages/infra-export/src/docx/itemsAlumno.ts packages/infra-export/src/docx/itemsAlumno.test.ts packages/infra-export/src/docx/construirDocumentoGuia.ts
git commit -m "refactor(ficha): extrae renderItemAlumno + helpers docx compartidos (guía repunta)"
```

---

### Task 9: Export de la ficha (`planoFicha` + `construirDocumentoFicha` + `FichaExportAdapter`)

**Files:**
- Create: `packages/infra-export/src/docx/planoFicha.ts`
- Create: `packages/infra-export/src/docx/construirDocumentoFicha.ts`
- Create: `packages/infra-export/src/docx/FichaExportAdapter.ts`
- Modify: `packages/infra-export/src/index.ts`
- Test: `packages/infra-export/src/docx/planoFicha.test.ts`
- Test: `packages/infra-export/src/docx/FichaExportAdapter.test.ts`

**Interfaces:**
- Consumes: `Ficha`, `DatosInstitucionalesGuia`, `ItemPlano`/`itemPlano` (de `planoPrueba.js`), helpers de `itemsAlumno.js`, patrón ImageRun de la lámina, `ExportFichaPort`, soffice helpers de `PdfExportAdapter.js`, `MIME_DOCX`.
- Produces: `planoFicha(ficha, inst): FichaPlano`, `construirDocumentoFicha(plano, imagenPng): Document`, `FichaExportAdapter implements ExportFichaPort`.

- [ ] **Step 1: Write the failing test (IR)** — `packages/infra-export/src/docx/planoFicha.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { DatosInstitucionalesGuia, Ficha } from '@faro/domain';
import { planoFicha } from './planoFicha.js';

const inst: DatosInstitucionalesGuia = { nombreColegio: 'Escuela X', comuna: 'Conchalí', docente: 'María' };
const ficha: Ficha = {
  asignatura: 'Matemática',
  curso: '1º básico',
  oa: { codigo: 'MA01 OA 01', descripcion: 'Contar del 0 al 100.' },
  concepto: 'conteo de frutas',
  perfil_nivel: '1-2',
  titulo: 'Ficha para colorear: conteo de frutas',
  consigna_dibujo: 'Colorea el dibujo.',
  ejercicios: [
    { oa: 'MA01 OA 01', habilidad: 'recordar', tipo: 'completacion', enunciado: 'Cuenta: 1, 2, ____.' },
  ],
  descripcion_dibujo: 'Three apples',
  imagen_clave: 'abcd1234',
};

describe('planoFicha', () => {
  it('arma el encabezado, los ejercicios (variante alumno) y los datos del dibujo', () => {
    const p = planoFicha(ficha, inst);
    expect(p.encabezado.lineaColegio).toBe('Escuela X · Conchalí');
    expect(p.encabezado.docente).toBe('María');
    expect(p.encabezado.titulo).toBe(ficha.titulo);
    expect(p.encabezado.identificacion).toEqual([['Nombre:', 'Curso:', 'Fecha:']]);
    expect(p.ejercicios).toHaveLength(1);
    expect(p.ejercicios[0]?.numero).toBe(1);
    expect(p.consignaDibujo).toBe('Colorea el dibujo.');
    expect(p.imagenClave).toBe('abcd1234');
    expect(p.descripcionDibujo).toBe('Three apples');
  });

  it('omite docente si no viene', () => {
    const p = planoFicha(ficha, { nombreColegio: 'X', comuna: 'Y' });
    expect(p.encabezado.docente).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/infra-export/src/docx/planoFicha.test.ts`
Expected: FAIL ("Cannot find module './planoFicha.js'").

- [ ] **Step 3a: Write `planoFicha.ts`**

```ts
// packages/infra-export/src/docx/planoFicha.ts
// IR puro y testeable de la FICHA para colorear: encabezado + ejercicios (variante alumno) + 1 dibujo.
// Reusa itemPlano de planoPrueba (mismo mapeo alumno → sin solución que la guía).

import type { DatosInstitucionalesGuia, Ficha } from '@faro/domain';
import { itemPlano, type ItemPlano } from './planoPrueba.js';

export interface EncabezadoFichaPlano {
  readonly lineaColegio: string;
  readonly docente?: string;
  readonly asignatura: string;
  readonly curso: string;
  readonly titulo: string;
  readonly oa: { readonly codigo: string; readonly descripcion: string };
  readonly identificacion: ReadonlyArray<ReadonlyArray<string>>;
}

export interface FichaPlano {
  readonly encabezado: EncabezadoFichaPlano;
  readonly ejercicios: readonly ItemPlano[];
  readonly consignaDibujo: string;
  readonly imagenClave: string;
  readonly descripcionDibujo: string; // alt-text / texto del placeholder si falta el PNG
}

export function planoFicha(ficha: Ficha, inst: DatosInstitucionalesGuia): FichaPlano {
  // Variante alumno: mostrarSolucion = false (no se revelan respuestas ni retroalimentación).
  const ejercicios = ficha.ejercicios.map((it, i) => itemPlano(it, i + 1, false));

  return {
    encabezado: {
      lineaColegio: `${inst.nombreColegio} · ${inst.comuna}`,
      ...(inst.docente !== undefined ? { docente: inst.docente } : {}),
      asignatura: ficha.asignatura,
      curso: ficha.curso,
      titulo: ficha.titulo,
      oa: { codigo: ficha.oa.codigo, descripcion: ficha.oa.descripcion },
      identificacion: [['Nombre:', 'Curso:', 'Fecha:']],
    },
    ejercicios,
    consignaDibujo: ficha.consigna_dibujo,
    imagenClave: ficha.imagen_clave,
    descripcionDibujo: ficha.descripcion_dibujo,
  };
}
```

- [ ] **Step 3b: Write `construirDocumentoFicha.ts`** (encabezado + ejercicios via `renderItemAlumno` + dibujo via ImageRun/placeholder; el dibujo es más chico que la lámina porque comparte página con los ejercicios):

```ts
// packages/infra-export/src/docx/construirDocumentoFicha.ts
// Renderiza el IR de la FICHA a un Document docx: encabezado + actividades (ejercicios) + 1 dibujo para
// colorear (ImageRun si hay PNG; si no, caja placeholder "DIBUJO: …"). Reusa los helpers compartidos de
// itemsAlumno.ts (mismos que la guía) y el patrón de imagen de la lámina.

import {
  AlignmentType,
  Document,
  ImageRun,
  PageOrientation,
  Paragraph,
  Table,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { FichaPlano } from './planoFicha.js';
import {
  BORDES_TABLA,
  celda,
  fila,
  notaBorrador,
  parrafosTexto,
  renderItemAlumno,
  separarTablasAdyacentes,
  tabla,
  titSeccion,
} from './itemsAlumno.js';

// Dibujo más chico que la lámina (comparte página con los ejercicios). Proporción 3:4.
const IMG_ANCHO_PX = 360;
const IMG_ALTO_PX = 480;

export function construirDocumentoFicha(plano: FichaPlano, imagenPng: Buffer | null): Document {
  const children: Array<Paragraph | Table> = [
    ...encabezado(plano),
    titSeccion('Actividades'),
    ...ejerciciosSeccion(plano),
    titSeccion('Colorea'),
    consignaParrafo(plano.consignaDibujo),
    dibujo(plano, imagenPng),
  ];

  return new Document({
    styles: { default: { document: { run: { font: 'Arial' } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: separarTablasAdyacentes(children),
      },
    ],
  });
}

function encabezado(plano: FichaPlano): Array<Paragraph | Table> {
  const e = plano.encabezado;
  const out: Array<Paragraph | Table> = [];
  out.push(new Paragraph({ children: [new TextRun({ text: e.lineaColegio, bold: true, size: 22 })] }));
  if (e.docente !== undefined) {
    out.push(new Paragraph({ children: [new TextRun({ text: `Profesora: ${e.docente}`, size: 18 })] }));
  }
  out.push(new Paragraph({ children: [new TextRun({ text: `Asignatura: ${e.asignatura}`, size: 18 })] }));
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 0 },
      children: [new TextRun({ text: e.titulo, bold: true, size: 28 })],
    }),
  );
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: e.curso, size: 20 })],
    }),
  );
  out.push(notaBorrador());
  if (e.identificacion.length > 0) {
    out.push(tabla(e.identificacion.map((f) => fila(f.map((t) => celda(parrafosTexto(t)))))));
  }
  out.push(
    tabla([
      fila([
        celda([
          new Paragraph({
            children: [new TextRun({ text: `${e.oa.codigo}: `, bold: true }), new TextRun({ text: e.oa.descripcion })],
          }),
        ]),
      ]),
    ]),
  );
  return out;
}

function ejerciciosSeccion(plano: FichaPlano): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const item of plano.ejercicios) out.push(...renderItemAlumno(item));
  return out;
}

function consignaParrafo(consigna: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: consigna, bold: true, size: 24 })],
  });
}

/** El dibujo para colorear: ImageRun si hay PNG; si no, caja placeholder "DIBUJO: …". */
function dibujo(plano: FichaPlano, imagenPng: Buffer | null): Paragraph | Table {
  if (imagenPng === null) {
    return cajaPlaceholderDibujo(`DIBUJO: ${plano.descripcionDibujo}`);
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: 'png',
        data: imagenPng,
        transformation: { width: IMG_ANCHO_PX, height: IMG_ALTO_PX },
        altText: { name: 'dibujo', title: 'Dibujo para colorear', description: plano.descripcionDibujo },
      }),
    ],
  });
}

/** Caja con borde para el placeholder del dibujo (cuando falta el PNG). */
function cajaPlaceholderDibujo(texto: string): Table {
  const cell = celda([
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: texto, italics: true, color: '555555' })],
    }),
  ]);
  return new Table({
    rows: [new TableRow({ children: [cell] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES_TABLA,
  });
}
```

- [ ] **Step 3c: Write `FichaExportAdapter.ts`** (espejo de `LaminaExportAdapter`):

```ts
// packages/infra-export/src/docx/FichaExportAdapter.ts
// Renderiza la FICHA para colorear a .docx y .pdf. Implementa ExportFichaPort. Espejo de LaminaExportAdapter:
// resuelve el PNG line-art del banco generado por `ficha.imagen_clave`; si falta, pasa null → placeholder.

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Document, Packer } from 'docx';
import type { ArchivoExportado, DatosInstitucionalesGuia, ExportFichaPort, Ficha } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { MIME_DOCX } from './DocxExportAdapter.js';
import {
  MIME_PDF,
  MotorPdfNoDisponibleError,
  construirComandoSoffice,
  resolverSofficeBin,
  rutaPdfEsperada,
} from './PdfExportAdapter.js';
import { planoFicha, type FichaPlano } from './planoFicha.js';
import { construirDocumentoFicha } from './construirDocumentoFicha.js';

const execFileP = promisify(execFile);

function nombreArchivoFicha(ficha: Ficha, idDocumento?: string): string {
  const sufijo = idDocumento !== undefined ? `-${idDocumento}` : '';
  const cuerpo = `${ficha.concepto}-${ficha.curso}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `ficha-${cuerpo.length > 0 ? cuerpo : 'colorear'}${sufijo}`;
}

export class FichaExportAdapter implements ExportFichaPort {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    private readonly dirBanco: string,
  ) {}

  private async resolverImagen(ficha: Ficha): Promise<Buffer | null> {
    const ruta = join(this.dirBanco, `${ficha.imagen_clave}.png`);
    if (!existsSync(ruta)) return null;
    return readFile(ruta);
  }

  async aDocx(ficha: Ficha, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const plano: FichaPlano = planoFicha(ficha, inst);
    const imagenPng = await this.resolverImagen(ficha);
    const doc: Document = construirDocumentoFicha(plano, imagenPng);
    const data = await Packer.toBuffer(doc);

    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${nombreArchivoFicha(ficha, idDocumento)}.docx`);
    await writeFile(ruta, data);

    this.log.info({ ruta, bytes: data.length, conImagen: imagenPng !== null }, 'export.ficha.docx');
    return { ruta, mime: MIME_DOCX, bytes: data.length };
  }

  async aPdf(ficha: Ficha, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const bin = resolverSofficeBin();
    if (bin === null) throw new MotorPdfNoDisponibleError();

    const docx = await this.aDocx(ficha, inst, idDocumento);
    const profileDir = await mkdtemp(join(tmpdir(), 'faro-soffice-'));
    try {
      const { args } = construirComandoSoffice(bin, docx.ruta, this.dirSalida, profileDir);
      await execFileP(bin, args, { timeout: 120_000 });
      const ruta = rutaPdfEsperada(this.dirSalida, docx.ruta);
      if (!existsSync(ruta)) throw new Error(`LibreOffice no produjo el PDF esperado en ${ruta}.`);
      const { size } = await stat(ruta);
      this.log.info({ ruta, bytes: size }, 'export.ficha.pdf');
      return { ruta, mime: MIME_PDF, bytes: size };
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}
```

> Nota: el `nombreArchivoLamina` original usaba `.replace(/[̀-ͯ]/g, '')` (rango de diacríticos combinados). Aquí se usa el equivalente explícito `/[̀-ͯ]/g` para que sea legible/portátil; es el mismo conjunto.

- [ ] **Step 3d: Barrels** — en `packages/infra-export/src/index.ts`, tras la línea 39 (`export { LaminaExportAdapter } ...`) añade:

```ts
export { planoFicha } from './docx/planoFicha.js';
export type { FichaPlano } from './docx/planoFicha.js';
export { construirDocumentoFicha } from './docx/construirDocumentoFicha.js';
export { FichaExportAdapter } from './docx/FichaExportAdapter.js';
```

- [ ] **Step 4: Write the adapter docx test** — `packages/infra-export/src/docx/FichaExportAdapter.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatosInstitucionalesGuia, Ficha } from '@faro/domain';
import { FichaExportAdapter } from './FichaExportAdapter.js';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as never;
const inst: DatosInstitucionalesGuia = { nombreColegio: 'Escuela X', comuna: 'Conchalí' };
const ficha: Ficha = {
  asignatura: 'Matemática',
  curso: '1º básico',
  oa: { codigo: 'MA01 OA 01', descripcion: 'Contar.' },
  concepto: 'frutas',
  perfil_nivel: '1-2',
  titulo: 'Ficha para colorear: frutas',
  consigna_dibujo: 'Colorea el dibujo.',
  ejercicios: [{ oa: 'MA01 OA 01', habilidad: 'recordar', tipo: 'completacion', enunciado: 'Cuenta: 1, 2, ____.' }],
  descripcion_dibujo: 'Three apples',
  imagen_clave: 'clave-test',
};

describe('FichaExportAdapter.aDocx', () => {
  it('escribe un .docx no vacío con placeholder cuando falta el PNG', async () => {
    const dirSalida = await mkdtemp(join(tmpdir(), 'faro-ficha-out-'));
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-ficha-banco-'));
    const adapter = new FichaExportAdapter(dirSalida, log, dirBanco);

    const archivo = await adapter.aDocx(ficha, inst);
    const bytes = await readFile(archivo.ruta);
    expect(bytes.length).toBeGreaterThan(0);
    expect(archivo.ruta).toContain('ficha-frutas');
  });

  it('resuelve el PNG del banco cuando existe (conImagen=true en el log)', async () => {
    const dirSalida = await mkdtemp(join(tmpdir(), 'faro-ficha-out-'));
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-ficha-banco-'));
    await mkdir(dirBanco, { recursive: true });
    // PNG mínimo válido (cabecera) — el adapter solo lo lee como Buffer.
    await writeFile(join(dirBanco, 'clave-test.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const adapter = new FichaExportAdapter(dirSalida, log, dirBanco);
    const archivo = await adapter.aDocx(ficha, inst);
    expect(archivo.bytes).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run packages/infra-export/src/docx/planoFicha.test.ts packages/infra-export/src/docx/FichaExportAdapter.test.ts`
Expected: PASS. Luego `pnpm --filter @faro/infra-export exec tsc --build` → 0 errores.

- [ ] **Step 6: Commit**

```bash
git add packages/infra-export/src/docx/planoFicha.ts packages/infra-export/src/docx/construirDocumentoFicha.ts packages/infra-export/src/docx/FichaExportAdapter.ts packages/infra-export/src/docx/planoFicha.test.ts packages/infra-export/src/docx/FichaExportAdapter.test.ts packages/infra-export/src/index.ts
git commit -m "feat(ficha): export .docx/.pdf de la ficha (plano + documento + adapter)"
```

---

### Task 10: Cola `ficha_colorear` en `JobRepositoryDrizzle`

**Files:**
- Modify: `packages/infra-db/src/repos/JobRepositoryDrizzle.ts`
- Test: `packages/infra-db/src/repos/JobRepositoryDrizzle.ficha.test.ts`

**Interfaces:**
- Consumes: `SchemaPayloadFicha` (value, para revalidar el jsonb), `PayloadFicha`, `TrabajoFicha` (types), drizzle `jobGeneracion`, `sql`, `eq`.
- Produces: `JobRepositoryDrizzle.encolarFicha(payload): Promise<string>`, `JobRepositoryDrizzle.tomarSiguienteFicha(workerId): Promise<TrabajoFicha | null>` (tipo_trabajo `'ficha_colorear'`, FOR UPDATE SKIP LOCKED).

- [ ] **Step 1: Write the failing test** — `packages/infra-db/src/repos/JobRepositoryDrizzle.ficha.test.ts` (espejo del test de la cola `material_colorear`; usa pglite — sigue el patrón del archivo de tests de cola existente para crear la DB y migrar):

```ts
import { describe, expect, it } from 'vitest';
import { JobRepositoryDrizzle } from './JobRepositoryDrizzle.js';
import { crearDbDePrueba } from '../test/dbDePrueba.js'; // helper existente usado por los tests de cola

const payload = { establecimiento: 'esc-1', asignatura: 'Matemática', nivel: '1º básico', oaCodigo: 'MA01 OA 01', concepto: 'frutas' };

describe('JobRepositoryDrizzle · cola ficha_colorear', () => {
  it('encola y toma el job, incrementando intentos y revalidando el payload', async () => {
    const { db, cerrar } = await crearDbDePrueba();
    try {
      const repo = new JobRepositoryDrizzle(db);
      const jobId = await repo.encolarFicha(payload);
      expect(jobId).toBeTruthy();

      const tomado = await repo.tomarSiguienteFicha('w1');
      expect(tomado?.id).toBe(jobId);
      expect(tomado?.payload).toEqual(payload);
      expect(tomado?.intentos).toBe(1);
    } finally {
      await cerrar();
    }
  });

  it('no devuelve jobs de otras colas (aislamiento por tipo_trabajo)', async () => {
    const { db, cerrar } = await crearDbDePrueba();
    try {
      const repo = new JobRepositoryDrizzle(db);
      await repo.encolarMaterialColorear(payload); // otra cola
      const tomado = await repo.tomarSiguienteFicha('w1');
      expect(tomado).toBeNull();
    } finally {
      await cerrar();
    }
  });
});
```

> ⚠️ Implementer: usa el MISMO helper de DB de prueba y la MISMA forma de los tests de cola existentes (`JobRepositoryDrizzle.*.test.ts` del Plan 1, p. ej. el de `material_colorear`). Si el import del helper difiere, cópialo del test hermano; no inventes el harness.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/infra-db/src/repos/JobRepositoryDrizzle.ficha.test.ts`
Expected: FAIL (`encolarFicha`/`tomarSiguienteFicha` no existen).

- [ ] **Step 3: Implement** — en `packages/infra-db/src/repos/JobRepositoryDrizzle.ts`: (a) añade los imports de `SchemaPayloadFicha` (value) y `PayloadFicha`/`TrabajoFicha` (types) desde `@faro/domain` junto a los de `material_colorear`; (b) añade los dos métodos (espejo exacto de `encolarMaterialColorear`/`tomarSiguienteMaterialColorear`, cambiando el literal a `'ficha_colorear'` y el schema a `SchemaPayloadFicha`):

```ts
  async encolarFicha(payload: PayloadFicha): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        tipoTrabajo: 'ficha_colorear',
        estado: 'pendiente',
        payload: payload as unknown as Record<string, unknown>, // jsonb
      })
      .returning({ id: jobGeneracion.id });
    if (!row) throw new Error('No se pudo encolar el job de ficha para colorear');
    return row.id;
  }

  async tomarSiguienteFicha(workerId: string): Promise<TrabajoFicha | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; payload: unknown }>(
        sql`SELECT id, payload FROM job_generacion
            WHERE estado = 'pendiente' AND tipo_trabajo = 'ficha_colorear'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );
      const row = (rows as unknown as { rows: Array<{ id: string; payload: unknown }> }).rows[0];
      if (!row) return null;
      const [actualizado] = await tx
        .update(jobGeneracion)
        .set({ estado: 'en_proceso', lockedBy: workerId, lockedAt: new Date(), intentos: sql`${jobGeneracion.intentos} + 1` })
        .where(eq(jobGeneracion.id, row.id))
        .returning({ intentos: jobGeneracion.intentos });
      if (!actualizado) throw new Error('No se pudo bloquear el job de ficha para colorear tomado');
      const payload = SchemaPayloadFicha.parse(row.payload); // revalida el jsonb opaco
      return { id: row.id, payload, intentos: actualizado.intentos };
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/infra-db/src/repos/JobRepositoryDrizzle.ficha.test.ts`
Expected: PASS. Luego `pnpm --filter @faro/infra-db exec tsc --build` → 0 errores.

- [ ] **Step 5: Commit**

```bash
git add packages/infra-db/src/repos/JobRepositoryDrizzle.ts packages/infra-db/src/repos/JobRepositoryDrizzle.ficha.test.ts
git commit -m "feat(ficha): cola ficha_colorear en JobRepositoryDrizzle (FOR UPDATE SKIP LOCKED)"
```

---

### Task 11: Cablear la 7ª cola en el worker

**Files:**
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: `GenerarEjerciciosFichaUseCase`, `GenerarFichaUseCase`, `ProcesarTrabajoFichaUseCase` (de `@faro/application`); reutiliza el `imageGen`, `banco`, `oas`, `llm`, `db` ya construidos para la cola `material_colorear`.
- Produces: una `ProcesarTrabajoFichaUseCase` cableada + su rama en el loop + su contribución al backoff.

- [ ] **Step 1: Add the import** — junto al import de `ProcesarTrabajoMaterialColorearUseCase` (línea ~24 de `apps/worker/src/main.ts`), añade `GenerarEjerciciosFichaUseCase`, `GenerarFichaUseCase`, `ProcesarTrabajoFichaUseCase` a la lista de imports desde `@faro/application`.

- [ ] **Step 2: Construye el use case de la ficha** — justo después del bloque que arma `materialColorearUseCase` (≈ línea 173), reutilizando `imageGen`, `banco`, `llm`, `oas`, `db` ya creados:

```ts
  const fichaUseCase = new ProcesarTrabajoFichaUseCase({
    jobs: new JobRepositoryDrizzle(db),
    oas, // OaRepositoryDrizzle compartido
    generar: new GenerarFichaUseCase({
      descripcion: new GenerarDescripcionDibujoUseCase(llm),
      imageGen,
      banco,
      ejercicios: new GenerarEjerciciosFichaUseCase(llm),
    }),
    uow: new UnidadDeTrabajoDrizzle(db),
  });
```

> `GenerarDescripcionDibujoUseCase`, `JobRepositoryDrizzle`, `UnidadDeTrabajoDrizzle` ya están importados/usados por la cola `material_colorear`; reúsalos. `imageGen`/`banco`/`llm`/`oas`/`db` son las MISMAS instancias.

- [ ] **Step 3: Añade la rama al loop** — tras el bloque `switch (rmc.tipo)` de `material_colorear` (≈ línea 278), añade el procesamiento de la ficha:

```ts
        const rf = await fichaUseCase.ejecutarSiguiente(workerId);
        switch (rf.tipo) {
          case 'sin_trabajo':
            break;
          case 'hecho':
            log.info({ jobId: rf.jobId, documentoId: rf.documentoId }, 'worker: ficha para colorear hecha');
            break;
          case 'reintenta':
            log.warn({ jobId: rf.jobId, error: rf.error }, 'worker: ficha reencolada para reintento');
            break;
          case 'fallido':
            log.error({ jobId: rf.jobId, error: rf.error }, 'worker: ficha fallida');
            break;
        }
```

- [ ] **Step 4: Incluye la ficha en el backoff** — en la condición que llama a `esperar(INTERVALO_VACIO_MS)` solo si TODAS las colas quedaron `'sin_trabajo'` (≈ línea 281-290), añade `rf.tipo === 'sin_trabajo'` al AND. (Si `rf` está fuera del scope del `if`, súbelo junto a las demás variables de resultado, igual que `rmc`.)

- [ ] **Step 5: Verify**

Run: `pnpm --filter @faro/worker exec tsc --build`
Expected: 0 errores (los tipos del nuevo use case calzan; el loop compila). Si hay un test del worker, córrelo: `pnpm exec vitest run apps/worker/`.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/main.ts
git commit -m "feat(ficha): cablea la 7ª cola ficha_colorear en el worker"
```

---

### Task 12: Web — rutas, produccion, lib de export y botón en la UI

**Files:**
- Create: `apps/web/app/api/aula/ficha/route.ts`
- Create: `apps/web/app/api/aula/ficha/[jobId]/route.ts`
- Create: `apps/web/app/api/aula/documentos/[id]/ficha/route.ts`
- Create: `apps/web/src/lib/exportarFicha.ts`
- Modify: `apps/web/src/lib/produccion.ts`
- Modify: `apps/web/app/aula/planificacion/page.tsx`
- Test: `apps/web/src/test/ficha.contrato.test.ts`

**Interfaces:**
- Consumes: `SchemaPayloadFicha`, `SchemaFicha`, `Ficha`, `DatosInstitucionalesGuia`; `produccion()` (`jobs`, `documentos`, `fichaExport`); helpers UI compartidos (`sondearJob`, `ResultadoSondeo`).
- Produces: 3 rutas API + `prepararExportFicha(id, override?)` + `fichaExport` en produccion + componente `GenerarFicha`.

- [ ] **Step 1: `fichaExport` en produccion** — en `apps/web/src/lib/produccion.ts`: (a) importa `FichaExportAdapter` desde `@faro/infra-export` (junto a `LaminaExportAdapter`); (b) en el objeto retornado, junto a `laminaExport`, añade:

```ts
    fichaExport: new FichaExportAdapter(dirExport, logExport, dirBanco),
```

(`dirExport`, `logExport`, `dirBanco` ya existen en `produccion()` — el mismo `dirBanco = join(raizRepo(), 'generated', 'imagenes-ia')` que la lámina y el worker.)

- [ ] **Step 2: `exportarFicha.ts`** (espejo de `exportarLamina.ts`) — `apps/web/src/lib/exportarFicha.ts`:

```ts
// apps/web/src/lib/exportarFicha.ts
// Carga común para descargar la FICHA: valida el documento, compone los datos institucionales (overridables
// por query) y devuelve la Ficha lista para el adapter. Espejo de exportarLamina.

import type { DatosInstitucionalesGuia, Ficha } from '@faro/domain';
import { SchemaFicha } from '@faro/domain';
import { produccion } from './produccion.js';

export type PreparacionExportFicha =
  | { ok: true; ficha: Ficha; inst: DatosInstitucionalesGuia }
  | { ok: false; status: number; error: string };

export async function prepararExportFicha(
  id: string,
  override?: Partial<DatosInstitucionalesGuia>,
): Promise<PreparacionExportFicha> {
  const { documentos } = produccion();
  const doc = await documentos.porId(id);
  if (doc === null) return { ok: false, status: 404, error: 'documento no encontrado' };
  if (doc.tipo !== 'ficha_colorear') return { ok: false, status: 400, error: 'el documento no es una ficha para colorear' };

  const ficha = SchemaFicha.safeParse(doc.contenido);
  if (!ficha.success) return { ok: false, status: 422, error: 'el contenido no es una ficha válida' };

  const inst: DatosInstitucionalesGuia = {
    nombreColegio: override?.nombreColegio ?? '[Colegio]',
    comuna: override?.comuna ?? '[Comuna]',
    ...(override?.docente !== undefined ? { docente: override.docente } : {}),
  };
  return { ok: true, ficha: ficha.data, inst };
}
```

> Implementer: confirma el nombre del campo de contenido del documento (`doc.contenido`) contra `exportarLamina.ts`; usa el MISMO.

- [ ] **Step 3: Rutas API** (espejo exacto de las tres rutas de `material-colorear`):

`apps/web/app/api/aula/ficha/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SchemaPayloadFicha } from '@faro/domain';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/responderError'; // mismo helper que usa material-colorear

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const parsed = SchemaPayloadFicha.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'payload inválido' }, { status: 400 });
    const { jobs } = produccion();
    const jobId = await jobs.encolarFicha(parsed.data);
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    return responderError500(e);
  }
}
```

`apps/web/app/api/aula/ficha/[jobId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { produccion } from '@/lib/produccion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }): Promise<NextResponse> {
  const { jobId } = await params;
  const { jobs, documentos } = produccion();
  const estado = await jobs.obtenerEstado(jobId);
  if (estado === null) return NextResponse.json({ error: 'job no encontrado' }, { status: 404 });
  if (estado.estado !== 'hecho' || estado.documentoId === null) {
    return NextResponse.json({ estado: estado.estado, intentos: estado.intentos, error: estado.error });
  }
  const doc = await documentos.porId(estado.documentoId);
  if (doc === null) return NextResponse.json({ error: 'documento no encontrado' }, { status: 404 });
  return NextResponse.json({
    estado: estado.estado,
    documentoId: estado.documentoId,
    tipo: doc.tipo,
    estadoRevision: doc.estadoRevision,
    autorHumano: doc.autorHumano,
    contenido: doc.contenido,
  });
}
```

`apps/web/app/api/aula/documentos/[id]/ficha/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { DatosInstitucionalesGuia } from '@faro/domain';
import { MotorPdfNoDisponibleError, MIME_DOCX, MIME_PDF } from '@faro/infra-export';
import { produccion } from '@/lib/produccion';
import { prepararExportFicha } from '@/lib/exportarFicha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const url = new URL(req.url);
  const formato = url.searchParams.get('formato') === 'pdf' ? 'pdf' : 'docx';

  const override: Partial<DatosInstitucionalesGuia> = {};
  const nombreColegio = url.searchParams.get('nombreColegio');
  const comuna = url.searchParams.get('comuna');
  const docente = url.searchParams.get('docente');
  if (nombreColegio !== null) override.nombreColegio = nombreColegio;
  if (comuna !== null) override.comuna = comuna;
  if (docente !== null) override.docente = docente;

  const prep = await prepararExportFicha(id, override);
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

  try {
    const { fichaExport } = produccion();
    const archivo = formato === 'pdf'
      ? await fichaExport.aPdf(prep.ficha, prep.inst, id)
      : await fichaExport.aDocx(prep.ficha, prep.inst, id);
    const bytes = await readFile(archivo.ruta);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': formato === 'pdf' ? MIME_PDF : MIME_DOCX,
        'Content-Disposition': `attachment; filename="${basename(archivo.ruta)}"`,
      },
    });
  } catch (e) {
    if (e instanceof MotorPdfNoDisponibleError) return NextResponse.json({ error: 'PDF no disponible (falta LibreOffice)' }, { status: 503 });
    throw e;
  }
}
```

> Implementer: confirma los nombres/firmas EXACTAS de los helpers importados (`responderError500`, `MIME_DOCX`, `MIME_PDF`, `MotorPdfNoDisponibleError`) contra las rutas de `material-colorear`; usa los MISMOS imports y la MISMA forma de respuesta (el detalle puede variar — espeja el hermano, no inventes).

- [ ] **Step 4: Componente `GenerarFicha`** — en `apps/web/app/aula/planificacion/page.tsx`, añade un componente `GenerarFicha` espejo de `GenerarMaterialColorear` (mismas props `{ asignatura, nivel, establecimiento, oaCodigos }`, mismo gate de grado `const grado = Number(nivel.match(/\d/)?.[0] ?? '0'); const permitido = grado >= 1 && grado <= 3;`, mismo patrón de estado + `sondearJob`), POST a `/api/aula/ficha`, descargas a `/api/aula/documentos/${docId}/ficha?formato=docx|pdf`, y botón "Regenerar dibujo" → `encolar(true)`. Instáncialo junto a `<GenerarMaterialColorear .../>` con `oaCodigos={plan.oa.map((o) => o.codigo)}`. Textos: legend "Ficha para colorear (1º–3º básico)", botón inicial "Generar ficha para colorear (borrador)".

> Implementer: copia el componente `GenerarMaterialColorear` íntegro, renómbralo a `GenerarFicha`, y cambia SOLO: la URL base (`/api/aula/ficha`), la ruta de descarga (`/ficha`), el id de estado (`fichaDocId`), y los textos. NO cambies la mecánica de `sondearJob`/polling.

- [ ] **Step 5: Test de contrato** — `apps/web/src/test/ficha.contrato.test.ts` (espejo de `materialColorear.contrato.test.ts`): verifica que `SchemaPayloadFicha` valida el body que postea el componente, y que la cadena `prepararExportFicha` rechaza un documento de tipo distinto. Copia la forma del test hermano de `material_colorear` (mockea `produccion` igual).

- [ ] **Step 6: Run web checks**

Run: `pnpm exec vitest run apps/web/src/test/ficha.contrato.test.ts` y `pnpm --filter @faro/web typecheck`
Expected: PASS + 0 errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/aula/ficha apps/web/app/api/aula/documentos/[id]/ficha apps/web/src/lib/exportarFicha.ts apps/web/src/lib/produccion.ts apps/web/app/aula/planificacion/page.tsx apps/web/src/test/ficha.contrato.test.ts
git commit -m "feat(ficha): rutas web + produccion + botón Generar ficha (gate 1º-3º + regenerar)"
```

---

## Cierre

- [ ] **DoD final:** `pnpm lint` (0 warnings) && `pnpm typecheck` && `pnpm test` verdes en `main` tras el merge.
- [ ] **Smoke con `GEMINI_API_KEY` real** (heredado del Plan 1; degrada a placeholder, no bloquea): generar una ficha de 1º y otra de 3º, confirmar que comparte el PNG cacheado con la lámina del mismo (OA, concepto), y revisar el layout A4 (ejercicios + dibujo caben).

---

## Self-Review

**1. Cobertura del spec (§4.2, §5, §7):**
- Ficha = encabezado + ejercicios anclados al OA + 1 dibujo → Tasks 1/6/9. ✅
- Ejercicios reusan el motor de PRUEBA (decisión del dueño; cubre 1º–2º) → Task 5. ✅
- Dibujo reusa el pipeline del Plan 1 con cache compartido por `(OA, concepto)` → Task 4 (ResolverDibujo) + Task 6. ✅
- Tramo grade ≤ 3 (gate en use case + UI) → Tasks 6 y 12; el PPT/prueba/guía no se tocan. ✅
- Nace borrador (HIL) + regenerar dibujo → Tasks 7 y 12. ✅
- Cola `ficha_colorear` end-to-end → Tasks 3/10/11/12. ✅
- Restricción legal: el dibujo usa `INSTR_DIBUJO` sin modificarlo (Task 4 lo consume vía ResolverDibujo). ✅

**2. Escaneo de placeholders:** sin "TBD"/"etc." en pasos de código; los puntos donde se pide "confirmar el helper hermano" (rutas web, helper de DB de prueba) son explícitos porque esos helpers existen y NO deben reinventarse — cada uno nombra el archivo hermano del que copiar la forma exacta.

**3. Consistencia de tipos:** `DibujoResuelto { clave, concepto, descripcion, meta }` se produce en Task 4 y se consume idéntico en Task 6. `ItemPruebaType[]` fluye de Task 5 → Task 6 → `SchemaFicha.ejercicios`. `Ficha` (Task 1) se consume en Tasks 6/7/9/12. `ExportFichaPort`/`TrabajoFicha`/`encolarFicha`/`tomarSiguienteFicha` (Task 3) se implementan en Tasks 9/10 y se cablean en 11/12. `perfil_nivel: '1-2' | '3-4'` es consistente entre `SchemaFicha` y el narrowing de Task 6. `DependenciasGenerarMaterialColorear = DependenciasResolverDibujo` mantiene estable el wiring del worker (sin cambios en su construcción de la cola `material_colorear`).
