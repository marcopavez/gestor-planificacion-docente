# Guías de trabajo del alumno (Tanda 1 — modo manual) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un nuevo artefacto `guia` (guía de trabajo del alumno, 3º-6º) que, dado un OA + un tema/conocimiento que escribe el docente, genera una guía de práctica (explicación + ejemplo + ejercicios) en `.docx`/`.pdf`, cableada en web/worker/UI — modo **manual** (Tanda 1).

**Architecture:** Artefacto **hermano** de la prueba formativa (Fase 4). Mismo flujo asíncrono (job → worker → gate → borrador + traza en transacción → export bajo demanda). **Diferencia clave:** la guía es **standalone desde un OA** (no deriva de una planificación); el OA se carga con `OaRepository.porAsignaturaNivel`, que resuelve la `corpus_version` publicada. Se **reusa** `ItemPrueba` (schema de ítems), el guard anti-fuga, la validación por-ítem del `pedagogicalGate`, y el render de ítems de `planoPrueba`.

**Tech Stack:** pnpm monorepo, TypeScript `strict` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Zod, Drizzle + Postgres, Vitest, Next.js App Router, `docx` + LibreOffice (soffice) para `.pdf`. LLM vía `AnthropicLlmAdapter` (ruta `redaccion` → Sonnet 4.6).

**Fuente de verdad del diseño:** `docs/superpowers/specs/2026-06-13-guias-aprendizaje-design.md`.

**Convención de comandos:**
- Tests: `pnpm exec vitest run <patrón>` (desde la raíz del repo; vitest config está en la raíz).
- Typecheck de un paquete: `pnpm --filter @faro/<pkg> typecheck`. Si tocaste `@faro/domain`, primero `pnpm --filter @faro/domain build` para que los paquetes consumidores vean los nuevos exports.
- Lint: `pnpm exec eslint <archivos> --max-warnings 0` (o `pnpm lint` para todo).
- Sin `console.log`, sin `any` sin justificación. Todo entregable IA nace `borrador`.

---

## Task 0: Rama de trabajo

- [ ] **Step 1: Crear la rama**

```bash
git checkout -b feat/guias-aprendizaje
```

- [ ] **Step 2: Verificar suite verde de base**

Run: `pnpm exec vitest run`
Expected: PASS (la suite de base está verde; ~286 tests). Si algo falla aquí, detente: el repo no está en estado limpio.

---

## Task 1: Factorizar helpers de ítem reusables (dominio)

Para reusar la validación y el guard anti-fuga entre prueba y guía sin duplicar, se extraen dos funciones que operan sobre `ItemPrueba[]`.

**Files:**
- Modify: `packages/domain/src/schemas/prueba.ts`
- Create: `packages/domain/src/gates/itemPrueba.ts`
- Modify: `packages/domain/src/gates/pedagogicalGate.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/schemas/prueba.test.ts` (ya existe — debe seguir verde) y `packages/domain/src/gates/pedagogicalGate.test.ts` (si existe; verificar verde)

- [ ] **Step 1: Refactor `fugaDeTextoEnPrueba` → extraer `fugaDeTextoEnItems`**

En `packages/domain/src/schemas/prueba.ts`, reemplazar el cuerpo actual de `fugaDeTextoEnPrueba` por:

```typescript
/**
 * Detecta fuga de texto en una lista de ítems: algún campo de texto libre supera LIMITE_TEXTO_ITEM
 * (la IA volcó razonamiento/borrador dentro de un campo JSON). La usan prueba y guía.
 */
export function fugaDeTextoEnItems(
  items: readonly ItemPruebaType[],
): { campo: string; itemIndex: number; largo: number } | null {
  for (const [itemIndex, it] of items.entries()) {
    const campos: ReadonlyArray<readonly [string, string | undefined]> = [
      ['enunciado', it.enunciado],
      ['imagen', it.imagen],
      ['retroalimentacion', it.retroalimentacion],
      ['respuesta_correcta', it.respuesta_correcta],
    ];
    for (const [campo, valor] of campos) {
      if (valor !== undefined && valor.length > LIMITE_TEXTO_ITEM) {
        return { campo, itemIndex, largo: valor.length };
      }
    }
  }
  return null;
}

/**
 * Detecta fuga de texto en una prueba: la IA volcó razonamiento/borrador en algún campo de texto libre
 * del ítem (string que supera LIMITE_TEXTO_ITEM). Devuelve el primer hallazgo o null si está sana.
 */
export function fugaDeTextoEnPrueba(
  prueba: Prueba,
): { campo: string; itemIndex: number; largo: number } | null {
  return fugaDeTextoEnItems(prueba.items);
}
```

- [ ] **Step 2: Crear `validarItemPrueba` (validez por tipo de ítem, sin tabla)**

Crear `packages/domain/src/gates/itemPrueba.ts`:

```typescript
// packages/domain/src/gates/itemPrueba.ts
// Validez por TIPO de un ítem (independiente de tabla/puntaje): exactamente una correcta en SM/VF,
// secuencia válida en 'ordenar', pares válidos en 'terminos_pareados'. La usan pedagogicalGate (prueba)
// y guiaGate (guía) para no duplicar las reglas por-ítem.

import type { ItemPruebaType } from '../schemas/prueba.js';
import type { Hallazgo } from './tipos.js';

export function validarItemPrueba(it: ItemPruebaType, numero: number): Hallazgo[] {
  const h: Hallazgo[] = [];

  if (it.tipo === 'seleccion_multiple' || it.tipo === 'verdadero_falso') {
    const correctas = (it.alternativas ?? []).filter((a) => a.correcta).length;
    if (correctas !== 1) {
      h.push({
        gate: 'pedagogica',
        regla: 'una_correcta',
        severidad: 'bloquea',
        mensaje: `El ítem ${numero} (${it.tipo}) tiene ${correctas} alternativas correctas; debe ser exactamente 1.`,
      });
    }
  }

  if (it.tipo === 'ordenar') {
    const sec = it.secuencia_correcta ?? [];
    const sinDuplicados = new Set(sec).size === sec.length;
    if (sec.length === 0 || !sinDuplicados) {
      h.push({
        gate: 'pedagogica',
        regla: 'una_correcta',
        severidad: 'bloquea',
        mensaje: `El ítem ${numero} (ordenar) requiere secuencia_correcta no vacía y sin duplicados.`,
      });
    }
  }

  if (it.tipo === 'terminos_pareados') {
    const pares = it.pares ?? [];
    const paresValidos = pares.every((p) => p.columnaA.length > 0 && p.columnaB.length > 0);
    if (pares.length === 0 || !paresValidos) {
      h.push({
        gate: 'pedagogica',
        regla: 'una_correcta',
        severidad: 'bloquea',
        mensaje: `El ítem ${numero} (terminos_pareados) requiere pares no vacíos con columnaA y columnaB.`,
      });
    }
  }

  return h;
}
```

- [ ] **Step 3: Refactor `pedagogicalGate` para usar `validarItemPrueba`**

En `packages/domain/src/gates/pedagogicalGate.ts`, añadir el import y reemplazar los tres bloques inline (`una_correcta` para SM/VF, `ordenar`, `terminos_pareados`) por una sola llamada. El bloque `item_en_tabla` y el de `puntajes_cuadran` se MANTIENEN. Resultado del `forEach`:

```typescript
import { validarItemPrueba } from './itemPrueba.js';
// ...
  prueba.items.forEach((it, i) => {
    const n = i + 1;
    // Cada ítem tributa a un OA presente en la tabla de especificaciones.
    if (!oaTabla.has(it.oa)) {
      h.push({
        gate: 'pedagogica',
        regla: 'item_en_tabla',
        severidad: 'bloquea',
        mensaje: `El ítem ${n} tributa a ${it.oa}, ausente en la tabla de especificaciones.`,
        ref: it.oa,
      });
    }
    // Validez por tipo de ítem (una correcta / ordenar / términos pareados) — compartida con la guía.
    h.push(...validarItemPrueba(it, n));
  });
```

- [ ] **Step 4: Exportar lo nuevo desde el índice del dominio**

En `packages/domain/src/index.ts`, en la línea que exporta de `./schemas/prueba.js`, añadir `fugaDeTextoEnItems`; y añadir un export para `validarItemPrueba`:

```typescript
export {
  SchemaPrueba,
  ItemPrueba,
  LIMITE_TEXTO_ITEM,
  fugaDeTextoEnPrueba,
  fugaDeTextoEnItems,
} from './schemas/prueba.js';
export { validarItemPrueba } from './gates/itemPrueba.js';
```

- [ ] **Step 5: Build dominio + correr tests de prueba/gate (regresión)**

Run:
```bash
pnpm --filter @faro/domain build
pnpm exec vitest run prueba.test pedagogicalGate
```
Expected: PASS. El refactor no cambia comportamiento — los tests existentes de prueba y del gate siguen verdes. Si `pedagogicalGate.test.ts` no existe, corre al menos `prueba.test`.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/schemas/prueba.ts packages/domain/src/gates/itemPrueba.ts packages/domain/src/gates/pedagogicalGate.ts packages/domain/src/index.ts
git commit -m "refactor(domain): factoriza validarItemPrueba y fugaDeTextoEnItems para reuso en guia"
```

---

## Task 2: `SchemaGuia` + guard anti-fuga (dominio)

**Files:**
- Create: `packages/domain/src/schemas/guia.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/schemas/guia.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

Crear `packages/domain/src/schemas/guia.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { SchemaGuia, fugaDeTextoEnGuia, type Guia } from './guia.js';

const guiaMuestra: Guia = {
  asignatura: 'Ciencias Naturales',
  curso: '3º básico',
  oa: { codigo: 'CN03 OA 01', descripcion: 'Observar y describir los seres vivos.' },
  conocimiento: 'Características de los seres vivos',
  perfil_nivel: '3-4',
  titulo: 'Guía: Características de los seres vivos',
  explicacion: 'Los seres vivos nacen, crecen, se alimentan y se reproducen.',
  ejemplo: 'Ejemplo: un perro nace, crece, come y tiene crías.',
  ejercicios: [
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuál es un ser vivo?',
      alternativas: [
        { texto: 'Una roca', correcta: false },
        { texto: 'Un árbol', correcta: true },
      ],
      retroalimentacion: 'Recuerda: los seres vivos crecen y se alimentan.',
    },
  ],
};

describe('SchemaGuia', () => {
  it('valida una guía bien formada', () => {
    expect(() => SchemaGuia.parse(guiaMuestra)).not.toThrow();
  });

  it('rechaza perfil_nivel de tramo 1-2 (guía 3-6 en tanda 1)', () => {
    const mala = { ...guiaMuestra, perfil_nivel: '1-2' };
    expect(SchemaGuia.safeParse(mala).success).toBe(false);
  });

  it('fugaDeTextoEnGuia devuelve null para una guía sana', () => {
    expect(fugaDeTextoEnGuia(guiaMuestra)).toBeNull();
  });

  it('fugaDeTextoEnGuia detecta fuga de razonamiento en explicacion', () => {
    const fuga = 'X '.repeat(2000); // > LIMITE_TEXTO_GUIA
    const mala: Guia = { ...guiaMuestra, explicacion: fuga };
    expect(fugaDeTextoEnGuia(mala)?.campo).toBe('explicacion');
  });

  it('fugaDeTextoEnGuia detecta fuga en un ejercicio (reusa el guard de ítems)', () => {
    const fuga = 'Y '.repeat(700); // > LIMITE_TEXTO_ITEM
    const mala: Guia = {
      ...guiaMuestra,
      ejercicios: [{ ...guiaMuestra.ejercicios[0]!, enunciado: fuga }],
    };
    expect(fugaDeTextoEnGuia(mala)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verificar que falla**

Run: `pnpm exec vitest run guia.test`
Expected: FAIL — `Cannot find module './guia.js'` (el schema no existe aún).

- [ ] **Step 3: Implementar `SchemaGuia`**

Crear `packages/domain/src/schemas/guia.ts`:

```typescript
// packages/domain/src/schemas/guia.ts
// Schema de la GUÍA de trabajo del alumno (Tanda 1, 3º-6º). Standalone desde un OA.
// Reusa ItemPrueba para los 'ejercicios' (hereda render, guard anti-fuga y validación por tipo).
// Híbrido: la IA redacta explicacion/ejemplo/ejercicios; el use case SOBRESCRIBE los campos fijos
// (asignatura/curso/oa/conocimiento/perfil_nivel/titulo). Nace borrador (HIL).

import { z } from 'zod';
import { ItemPrueba, fugaDeTextoEnItems, type ItemPruebaType } from './prueba.js';

export const SchemaGuia = z.object({
  // FIJOS (el use case los sobrescribe; la IA no los decide):
  asignatura: z.string(),
  curso: z.string(),
  oa: z.object({ codigo: z.string(), descripcion: z.string() }),
  conocimiento: z.string(),
  // Tanda 1 cubre SOLO 3º-6º (1-2 difiere hasta tener imágenes reales).
  perfil_nivel: z.enum(['3-4', '5-6']),
  titulo: z.string(),
  // REDACTADOS por la IA (nacen borrador):
  explicacion: z.string(),
  ejemplo: z.string(),
  ejercicios: z.array(ItemPrueba),
  desafio: ItemPrueba.optional(),
});

export type Guia = z.infer<typeof SchemaGuia>;

// Cota de cordura para texto largo de la guía (explicacion/ejemplo SON párrafos, a diferencia de los
// campos cortos del ítem). Un valor que la excede no es contenido: es la IA volcando razonamiento
// (misma defensa que la prueba). No va como .max() del schema (el SDK no soporta maxLength en structured
// outputs); se valida tras parsear y la generación se rechaza+reintenta (INV-2).
export const LIMITE_TEXTO_GUIA = 2500;

/** Detecta fuga de texto en una guía (explicacion/ejemplo largos, o fuga en los ejercicios). */
export function fugaDeTextoEnGuia(guia: Guia): { campo: string; largo: number } | null {
  const parrafos: ReadonlyArray<readonly [string, string]> = [
    ['explicacion', guia.explicacion],
    ['ejemplo', guia.ejemplo],
  ];
  for (const [campo, valor] of parrafos) {
    if (valor.length > LIMITE_TEXTO_GUIA) return { campo, largo: valor.length };
  }
  const items: ItemPruebaType[] = [...guia.ejercicios, ...(guia.desafio ? [guia.desafio] : [])];
  const fugaItem = fugaDeTextoEnItems(items);
  if (fugaItem !== null) return { campo: `ejercicio.${fugaItem.campo}`, largo: fugaItem.largo };
  return null;
}
```

- [ ] **Step 4: Exportar desde el índice del dominio**

En `packages/domain/src/index.ts` añadir:

```typescript
export { SchemaGuia, LIMITE_TEXTO_GUIA, fugaDeTextoEnGuia } from './schemas/guia.js';
export type { Guia } from './schemas/guia.js';
```

- [ ] **Step 5: Run test — verificar que pasa**

Run: `pnpm --filter @faro/domain build && pnpm exec vitest run guia.test`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/schemas/guia.ts packages/domain/src/schemas/guia.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): SchemaGuia + guard anti-fuga (guía del alumno 3-6, reusa ItemPrueba)"
```

---

## Task 3: `guiaGate` (dominio)

**Files:**
- Create: `packages/domain/src/gates/guiaGate.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/gates/guiaGate.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

Crear `packages/domain/src/gates/guiaGate.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { guiaGate } from './guiaGate.js';
import type { Guia } from '../schemas/guia.js';

const base: Guia = {
  asignatura: 'Matemática',
  curso: '4º básico',
  oa: { codigo: 'MA04 OA 01', descripcion: 'Representar números naturales.' },
  conocimiento: 'Valor posicional',
  perfil_nivel: '3-4',
  titulo: 'Guía: Valor posicional',
  explicacion: 'El valor de un dígito depende de su posición.',
  ejemplo: 'En 234, el 2 vale 200.',
  ejercicios: [
    {
      oa: 'MA04 OA 01',
      habilidad: 'aplicar',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuánto vale el 3 en 36?',
      alternativas: [
        { texto: '3', correcta: false },
        { texto: '30', correcta: true },
      ],
      retroalimentacion: 'Mira la posición del dígito.',
    },
  ],
};

describe('guiaGate', () => {
  it('ok para una guía coherente', () => {
    const r = guiaGate(base);
    expect(r.ok).toBe(true);
    expect(r.hallazgos).toEqual([]);
  });

  it('bloquea si un ejercicio de selección múltiple no tiene exactamente una correcta', () => {
    const mala: Guia = {
      ...base,
      ejercicios: [
        {
          ...base.ejercicios[0]!,
          alternativas: [
            { texto: '3', correcta: true },
            { texto: '30', correcta: true },
          ],
        },
      ],
    };
    expect(guiaGate(mala).ok).toBe(false);
  });

  it('bloquea si la guía no trae ejercicios', () => {
    const mala: Guia = { ...base, ejercicios: [] };
    expect(guiaGate(mala).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — verificar que falla**

Run: `pnpm exec vitest run guiaGate`
Expected: FAIL — `Cannot find module './guiaGate.js'`.

- [ ] **Step 3: Implementar `guiaGate`**

Crear `packages/domain/src/gates/guiaGate.ts`:

```typescript
// packages/domain/src/gates/guiaGate.ts
// Coherencia determinista de la GUÍA (sin red): validez por tipo de cada ejercicio (reusa
// validarItemPrueba) + al menos un ejercicio. No hay tabla de especificaciones ni puntajes (no es prueba).

import type { Guia } from '../schemas/guia.js';
import { validarItemPrueba } from './itemPrueba.js';
import { construirResultado, type Hallazgo, type ResultadoGate } from './tipos.js';

export function guiaGate(guia: Guia): ResultadoGate {
  const h: Hallazgo[] = [];

  if (guia.ejercicios.length === 0) {
    h.push({
      gate: 'pedagogica',
      regla: 'guia_con_ejercicios',
      severidad: 'bloquea',
      mensaje: 'La guía no trae ejercicios de práctica.',
    });
  }

  const items = [...guia.ejercicios, ...(guia.desafio ? [guia.desafio] : [])];
  items.forEach((it, i) => {
    h.push(...validarItemPrueba(it, i + 1));
  });

  return construirResultado(h);
}
```

- [ ] **Step 4: Exportar desde el índice del dominio**

En `packages/domain/src/index.ts` añadir:

```typescript
export { guiaGate } from './gates/guiaGate.js';
```

- [ ] **Step 5: Run test — verificar que pasa**

Run: `pnpm --filter @faro/domain build && pnpm exec vitest run guiaGate`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/gates/guiaGate.ts packages/domain/src/gates/guiaGate.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): guiaGate (coherencia por ejercicio, reusa validarItemPrueba)"
```

---

## Task 4: `SchemaPayloadGuia` (dominio)

**Files:**
- Create: `packages/domain/src/schemas/payloadGuia.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/schemas/payloadGuia.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

Crear `packages/domain/src/schemas/payloadGuia.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { SchemaPayloadGuia } from './payloadGuia.js';

describe('SchemaPayloadGuia', () => {
  it('valida un payload completo', () => {
    const ok = SchemaPayloadGuia.safeParse({
      asignatura: 'Ciencias Naturales',
      nivel: '3º básico',
      oaCodigo: 'CN03 OA 01',
      conocimiento: 'Los seres vivos',
      establecimiento: 'Colegio Demo',
    });
    expect(ok.success).toBe(true);
  });

  it('rechaza campos vacíos', () => {
    const bad = SchemaPayloadGuia.safeParse({
      asignatura: '',
      nivel: '3º básico',
      oaCodigo: 'CN03 OA 01',
      conocimiento: 'X',
      establecimiento: 'Y',
    });
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — verificar que falla**

Run: `pnpm exec vitest run payloadGuia`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar el payload**

Crear `packages/domain/src/schemas/payloadGuia.ts`:

```typescript
// packages/domain/src/schemas/payloadGuia.ts
// Payload del job 'guia' (Tanda 1, modo manual): la guía es STANDALONE desde un OA (no deriva de una
// planificación). El worker resuelve el OA + corpus_version vía OaRepository.porAsignaturaNivel.

import { z } from 'zod';

export const SchemaPayloadGuia = z.object({
  asignatura: z.string().min(1),
  nivel: z.string().min(1),
  oaCodigo: z.string().min(1),
  conocimiento: z.string().min(1),
  establecimiento: z.string().min(1),
});

export type PayloadGuia = z.infer<typeof SchemaPayloadGuia>;
```

- [ ] **Step 4: Exportar desde el índice del dominio**

En `packages/domain/src/index.ts` añadir:

```typescript
export { SchemaPayloadGuia } from './schemas/payloadGuia.js';
export type { PayloadGuia } from './schemas/payloadGuia.js';
```

- [ ] **Step 5: Run test — verificar que pasa**

Run: `pnpm --filter @faro/domain build && pnpm exec vitest run payloadGuia`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/schemas/payloadGuia.ts packages/domain/src/schemas/payloadGuia.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): SchemaPayloadGuia (job guia, standalone desde OA)"
```

---

## Task 5: Puerto + Drizzle de la cola `guia`

**Files:**
- Modify: `packages/domain/src/ports/index.ts`
- Modify: `packages/infra-db/src/repos/JobRepositoryDrizzle.ts`
- Test: `packages/infra-db/src/test/repos.integration.test.ts` (añadir un caso; requiere Postgres local — `docker compose up -d`)

- [ ] **Step 1: Añadir `TrabajoGuia` + métodos al puerto `JobRepository`**

En `packages/domain/src/ports/index.ts`, junto a `TrabajoPrueba`, añadir:

```typescript
// Un trabajo de generación de GUÍA (Tanda 1): el payload trae OA + conocimiento (standalone desde el OA).
export interface TrabajoGuia {
  readonly id: string;
  readonly payload: PayloadGuia;
  readonly intentos: number; // ya incrementado por tomarSiguienteGuia (cuenta el intento en curso)
}
```

Asegúrate de importar `PayloadGuia` en ese archivo (junto a los otros payload types, p. ej. `import type { ..., PayloadGuia } from '../schemas/payloadGuia.js';` siguiendo cómo se importa `PayloadPrueba`).

Dentro de `export interface JobRepository`, añadir (junto a `encolarPrueba`/`tomarSiguientePrueba`):

```typescript
  // Encola una generación de GUÍA (Tanda 1) standalone desde un OA.
  encolarGuia(payload: PayloadGuia): Promise<string>;
  // Análogo para la cola 'guia': su propia cola por tipo de trabajo.
  tomarSiguienteGuia(workerId: string): Promise<TrabajoGuia | null>;
```

Asegúrate de que `TrabajoGuia` se re-exporte desde `packages/domain/src/index.ts` siguiendo el patrón de los otros `Trabajo*` (p. ej. `TrabajoPrueba`): si el índice del dominio re-exporta esos tipos del puerto, añade `TrabajoGuia` a esa línea (`export type { ..., TrabajoGuia } from './ports/index.js';`). El test de la Task 8 lo importa de `@faro/domain`.

- [ ] **Step 2: Implementar en `JobRepositoryDrizzle`**

En `packages/infra-db/src/repos/JobRepositoryDrizzle.ts`, añadir los imports `SchemaPayloadGuia`, y los tipos `PayloadGuia`, `TrabajoGuia` (mira cómo se importan `SchemaPayloadPrueba`/`PayloadPrueba`/`TrabajoPrueba`). Añadir los dos métodos, espejo exacto de `encolarPrueba`/`tomarSiguientePrueba`, cambiando el literal `tipo_trabajo`, el schema de parseo y los mensajes:

```typescript
  async encolarGuia(payload: PayloadGuia): Promise<string> {
    const [row] = await this.db
      .insert(jobGeneracion)
      .values({
        tipoTrabajo: 'guia',
        estado: 'pendiente',
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning({ id: jobGeneracion.id });

    if (!row) throw new Error('No se pudo encolar el job de guía');
    return row.id;
  }

  /** Análogo a tomarSiguientePrueba para la cola 'guia' (Tanda 1). */
  async tomarSiguienteGuia(workerId: string): Promise<TrabajoGuia | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; payload: unknown }>(
        sql`SELECT id, payload FROM job_generacion
            WHERE estado = 'pendiente' AND tipo_trabajo = 'guia'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
      );

      const row = (rows as unknown as { rows: Array<{ id: string; payload: unknown }> }).rows[0];
      if (!row) return null;

      const [actualizado] = await tx
        .update(jobGeneracion)
        .set({
          estado: 'en_proceso',
          lockedBy: workerId,
          lockedAt: new Date(),
          intentos: sql`${jobGeneracion.intentos} + 1`,
        })
        .where(eq(jobGeneracion.id, row.id))
        .returning({ intentos: jobGeneracion.intentos });

      if (!actualizado) throw new Error('No se pudo bloquear el job de guía tomado');

      const payload = SchemaPayloadGuia.parse(row.payload);
      return { id: row.id, payload, intentos: actualizado.intentos };
    });
  }
```

> Nota: `documento_generado.tipo` y `job_generacion.tipo_trabajo` son columnas `text` libres (no enum). **No hace falta migración de DB** para los nuevos valores `'guia'`.

- [ ] **Step 3: Añadir test de integración de la cola guia**

En `packages/infra-db/src/test/repos.integration.test.ts`, dentro del `describe` de `JobRepository`, añadir (mira el caso `'cola de prueba formativa'` y clónalo):

```typescript
  it('encolarGuia → tomarSiguienteGuia devuelve el payload; otras colas NO la toman', async () => {
    const jobs = new JobRepositoryDrizzle(db);
    const id = await jobs.encolarGuia({
      asignatura: 'Ciencias Naturales',
      nivel: '3º básico',
      oaCodigo: 'CN03 OA 01',
      conocimiento: 'Los seres vivos',
      establecimiento: 'Colegio Demo',
    });
    // La cola de cascada NO toma un job de guía.
    expect(await jobs.tomarSiguiente('w-cascada')).toBeNull();
    const t = await jobs.tomarSiguienteGuia('w-guia');
    expect(t?.id).toBe(id);
    expect(t?.payload.oaCodigo).toBe('CN03 OA 01');
    expect(t?.intentos).toBe(1);
  });
```

- [ ] **Step 4: Run — typecheck + test de integración**

Run:
```bash
docker compose up -d
pnpm --filter @faro/domain build
pnpm --filter @faro/infra-db typecheck
pnpm exec vitest run repos.integration
```
Expected: PASS. (El test de integración levanta Postgres; si `docker compose` no está corriendo, arráncalo primero. La DB del compose está en host 5544.)

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ports/index.ts packages/infra-db/src/repos/JobRepositoryDrizzle.ts packages/infra-db/src/test/repos.integration.test.ts
git commit -m "feat(infra-db): cola de jobs 'guia' (encolarGuia/tomarSiguienteGuia)"
```

---

## Task 6: Prompt + entrada de la guía (`generacion.ts`)

**Files:**
- Modify: `packages/application/src/aula/cascada/generacion.ts`

- [ ] **Step 1: Añadir `INSTR_GUIA` y `entradaGuia`**

En `packages/application/src/aula/cascada/generacion.ts`, junto a `INSTR_PRUEBA`, añadir:

```typescript
export const INSTR_GUIA = instruccion(
  [
    'Genera una GUÍA DE TRABAJO para el ALUMNO (educación básica chilena, 3º a 6º) sobre el CONOCIMIENTO indicado, anclada al OA provisto.',
    'Es para APRENDER y PRACTICAR (no es una prueba calificada). Lenguaje claro y apropiado al nivel.',
    "- 'explicacion': enseña el conocimiento en 1–2 párrafos breves.",
    "- 'ejemplo': un ejemplo RESUELTO/modelado que muestra cómo se hace.",
    "- 'ejercicios': práctica graduada (recordar → aplicar). Tipos: 'seleccion_multiple', 'verdadero_falso', 'completacion', 'desarrollo', 'ordenar' (con 'secuencia_correcta') o 'terminos_pareados' (con 'pares' columnaA↔columnaB). Selección múltiple y verdadero/falso con EXACTAMENTE una alternativa correcta. NO uses 'pictorico'.",
    "- 'desafio' (opcional): un ítem final de mayor exigencia.",
    "- Cada ítem lleva 'retroalimentacion' = qué orientar al alumno si falla.",
    '- Cada campo de texto contiene SOLO el contenido del ítem/sección para el alumno: NUNCA escribas notas para ti, razonamiento ni instrucciones de formato dentro de un campo.',
  ].join('\n'),
);
```

Y junto a `entradaPrueba`, añadir (importa `ContextoCascada` desde `./tipos.js` si no está ya importado):

```typescript
export function entradaGuia(ctx: ContextoCascada, conocimiento: string): string {
  const oa = ctx.oaSeleccionados[0];
  return [
    `Asignatura: ${ctx.asignatura}`,
    `Nivel: ${ctx.nivel}`,
    `OA: ${oa?.codigo} — ${oa?.descripcion}`,
    `Conocimiento a trabajar en esta guía: ${conocimiento}`,
    'Genera una guía de trabajo para el alumno sobre ESE conocimiento, anclada al OA.',
  ].join('\n');
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @faro/application typecheck`
Expected: PASS (puede requerir `pnpm --filter @faro/domain build` antes si aún no se hizo).

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/aula/cascada/generacion.ts
git commit -m "feat(application): INSTR_GUIA + entradaGuia (grounding de la guía sobre un OA)"
```

---

## Task 7: `GenerarGuiaUseCase` (application)

**Files:**
- Create: `packages/application/src/aula/cascada/GenerarGuiaUseCase.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/src/aula/cascada/GenerarGuiaUseCase.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

Crear `packages/application/src/aula/cascada/GenerarGuiaUseCase.test.ts`:

```typescript
import type { LlmPort, Guia } from '@faro/domain';
import { GeneracionError, SchemaGuia } from '@faro/domain';
import { describe, expect, it } from 'vitest';
import { GenerarGuiaUseCase } from './GenerarGuiaUseCase.js';
import type { ContextoCascada } from './tipos.js';

function ctxMuestra(nivel: string): ContextoCascada {
  return {
    establecimiento: 'Colegio Demo',
    asignatura: 'Ciencias Naturales',
    nivel,
    oaSeleccionados: [
      { codigo: 'CN03 OA 01', categoria: 'basal', descripcion: 'Observar y describir los seres vivos.' },
    ],
    corpusVersionId: '00000000-0000-0000-0000-000000000001',
  };
}

// Guía de muestra de la IA: campos fijos "equivocados" a propósito → el use case debe sobrescribirlos.
const guiaMuestra: Guia = {
  asignatura: 'IA-Asignatura',
  curso: 'IA-Curso',
  oa: { codigo: 'IA-OA', descripcion: 'IA-desc' },
  conocimiento: 'IA-conocimiento',
  perfil_nivel: '5-6',
  titulo: 'IA-titulo',
  explicacion: 'Los seres vivos nacen, crecen y se alimentan.',
  ejemplo: 'Un perro nace, crece y come.',
  ejercicios: [
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuál es un ser vivo?',
      alternativas: [
        { texto: 'Una roca', correcta: false },
        { texto: 'Un árbol', correcta: true },
      ],
      retroalimentacion: 'Recuerda qué hacen los seres vivos.',
    },
  ],
};

function llmDe(guia: Guia): LlmPort {
  return {
    async generar(args) {
      const parsed = args.schema.parse(guia); // valida contra SchemaGuia real
      return {
        parsed,
        stopReason: 'end_turn',
        usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        modelo: 'muestras',
      };
    },
  };
}

describe('GenerarGuiaUseCase', () => {
  it('ensambla una guía válida y SOBRESCRIBE los campos fijos del contexto (3º → tramo 3-4)', async () => {
    const uc = new GenerarGuiaUseCase(llmDe(guiaMuestra));
    const guia = await uc.ejecutar(ctxMuestra('3º básico'), 'Características de los seres vivos');

    expect(() => SchemaGuia.parse(guia)).not.toThrow();
    expect(guia.asignatura).toBe('Ciencias Naturales');
    expect(guia.curso).toBe('3º básico');
    expect(guia.oa.codigo).toBe('CN03 OA 01');
    expect(guia.conocimiento).toBe('Características de los seres vivos');
    expect(guia.perfil_nivel).toBe('3-4');
  });

  it('rechaza (GeneracionError) un nivel de tramo 1-2 (no soportado en tanda 1)', async () => {
    const uc = new GenerarGuiaUseCase(llmDe(guiaMuestra));
    await expect(uc.ejecutar(ctxMuestra('1º básico'), 'X')).rejects.toThrow(GeneracionError);
  });

  it('rechaza (GeneracionError) una guía con fuga de razonamiento en explicacion', async () => {
    const conFuga: Guia = { ...guiaMuestra, explicacion: 'Z '.repeat(2000) };
    const uc = new GenerarGuiaUseCase(llmDe(conFuga));
    await expect(uc.ejecutar(ctxMuestra('4º básico'), 'X')).rejects.toThrow(GeneracionError);
  });
});
```

- [ ] **Step 2: Run test — verificar que falla**

Run: `pnpm exec vitest run GenerarGuiaUseCase`
Expected: FAIL — módulo `./GenerarGuiaUseCase.js` no existe.

- [ ] **Step 3: Implementar `GenerarGuiaUseCase`**

Crear `packages/application/src/aula/cascada/GenerarGuiaUseCase.ts`:

```typescript
// packages/application/src/aula/cascada/GenerarGuiaUseCase.ts
// Tanda 1 (guía del alumno): genera una Guia desde un ContextoCascada con UN OA + un conocimiento.
// Standalone desde el OA (no usa planificación). Híbrido: la IA redacta explicacion/ejemplo/ejercicios;
// el use case SOBRESCRIBE los campos fijos (asignatura/curso/oa/conocimiento/perfil_nivel/titulo).
// Tramo 1-2 NO soportado en tanda 1 (difiere hasta tener imágenes reales). Nace borrador (HIL).

import type { ContextoCascada } from './tipos.js';
import type { Guia, LlmPort } from '@faro/domain';
import { fugaDeTextoEnGuia, GeneracionError, SchemaGuia, tramoDeNivel } from '@faro/domain';
import { bloqueCorpus, entradaGuia, exigirParsedConMeta, INSTR_GUIA } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';

export class GenerarGuiaUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    ctx: ContextoCascada,
    conocimiento: string,
  ): Promise<{ valor: Guia; meta: MetaGeneracion }> {
    const oa = ctx.oaSeleccionados[0];
    if (oa === undefined) throw new GeneracionError('guia_sin_oa');

    const tramo = tramoDeNivel(ctx.nivel);
    // Tanda 1: solo 3-4 / 5-6. 1-2 es casi pura imagen → difiere (ver spec §3).
    if (tramo === '1-2') throw new GeneracionError('guia_tramo_no_soportado');

    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaGuia,
      system: [bloqueCorpus(ctx), INSTR_GUIA],
      entradaUsuario: entradaGuia(ctx, conocimiento),
    });
    const { valor: borrador, meta } = exigirParsedConMeta(salida);

    // Ensamblaje: SOBRESCRIBE lo que NO inventa la IA (datos fijos del contexto/OA).
    const guia: Guia = {
      ...borrador,
      asignatura: ctx.asignatura,
      curso: ctx.nivel,
      oa: { codigo: oa.codigo, descripcion: oa.descripcion },
      conocimiento,
      perfil_nivel: tramo, // narrowed a '3-4' | '5-6'
      titulo: `Guía: ${conocimiento}`,
    };

    const valido = SchemaGuia.parse(guia);

    // Guard anti-fuga (INV-2): la IA puede volcar razonamiento en texto libre → rechazar → reintenta.
    const fuga = fugaDeTextoEnGuia(valido);
    if (fuga !== null) {
      throw new GeneracionError(`fuga_texto:${fuga.campo}(${fuga.largo})`);
    }

    return { valor: valido, meta };
  }

  async ejecutar(ctx: ContextoCascada, conocimiento: string): Promise<Guia> {
    return (await this.ejecutarConMeta(ctx, conocimiento)).valor;
  }
}
```

- [ ] **Step 4: Exportar desde el índice de application**

En `packages/application/src/index.ts`, junto al export de `GenerarPruebaFormativaUseCase`, añadir:

```typescript
export { GenerarGuiaUseCase } from './aula/cascada/GenerarGuiaUseCase.js';
```

- [ ] **Step 5: Run test — verificar que pasa**

Run: `pnpm exec vitest run GenerarGuiaUseCase`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/aula/cascada/GenerarGuiaUseCase.ts packages/application/src/aula/cascada/GenerarGuiaUseCase.test.ts packages/application/src/index.ts
git commit -m "feat(application): GenerarGuiaUseCase (guía híbrida standalone desde OA + anti-fuga)"
```

---

## Task 8: `ProcesarTrabajoGuiaUseCase` (application)

Orquesta la cola `guia`: toma el job, **carga el OA** del corpus publicado (vía `OaRepository`), construye el `ContextoCascada`, genera la guía, corre `guiaGate`, y persiste un borrador + traza en una transacción.

**Files:**
- Create: `packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

Crear `packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.test.ts`. Usa dobles en memoria de `JobRepository`, `OaRepository`, `UnidadDeTrabajo`. Mira `ProcesarTrabajoPruebaUseCase.test.ts` para el estilo de los dobles; aquí va uno completo:

```typescript
import type {
  JobRepository,
  OaRepository,
  ObjetivoAprendizaje,
  ReposTransaccion,
  TrabajoGuia,
  UnidadDeTrabajo,
} from '@faro/domain';
import { describe, expect, it, vi } from 'vitest';
import { GenerarGuiaUseCase } from './GenerarGuiaUseCase.js';
import { ProcesarTrabajoGuiaUseCase } from './ProcesarTrabajoGuiaUseCase.js';

const OA: ObjetivoAprendizaje = {
  id: 'oa-1',
  corpusVersionId: 'cv-1',
  codigo: 'CN03 OA 01',
  asignatura: 'Ciencias Naturales',
  nivel: '3º básico',
  descripcion: 'Observar y describir los seres vivos.',
  indicadores: [],
  vigenciaDesde: null,
  vigenciaHasta: null,
};

const guiaIa = {
  asignatura: 'x',
  curso: 'x',
  oa: { codigo: 'x', descripcion: 'x' },
  conocimiento: 'x',
  perfil_nivel: '3-4' as const,
  titulo: 'x',
  explicacion: 'Los seres vivos nacen y crecen.',
  ejemplo: 'Un perro crece.',
  ejercicios: [
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender' as const,
      tipo: 'verdadero_falso' as const,
      enunciado: 'Un árbol es un ser vivo.',
      alternativas: [
        { texto: 'Verdadero', correcta: true },
        { texto: 'Falso', correcta: false },
      ],
      retroalimentacion: 'Los árboles crecen.',
    },
  ],
};

function dobles() {
  const tomado: TrabajoGuia = {
    id: 'job-1',
    intentos: 1,
    payload: {
      asignatura: 'Ciencias Naturales',
      nivel: '3º básico',
      oaCodigo: 'CN03 OA 01',
      conocimiento: 'Los seres vivos',
      establecimiento: 'Colegio Demo',
    },
  };
  let entregado = false;
  const jobs: Partial<JobRepository> = {
    tomarSiguienteGuia: vi.fn(async () => {
      if (entregado) return null;
      entregado = true;
      return tomado;
    }),
    marcarHecho: vi.fn(async () => {}),
    reintentar: vi.fn(async () => {}),
    marcarFallido: vi.fn(async () => {}),
  };
  const oas: OaRepository = {
    porAsignaturaCurso: vi.fn(async () => [OA]),
    porAsignaturaNivel: vi.fn(async () => [OA]),
    porIds: vi.fn(async () => [OA]),
  };
  const crearBorrador = vi.fn(async () => ({ id: 'doc-1' }) as never);
  const registrar = vi.fn(async () => {});
  const marcarHechoTx = vi.fn(async () => {});
  const uow: UnidadDeTrabajo = {
    enTransaccion: vi.fn(async (fn) =>
      fn({
        documentos: { crearBorrador } as never,
        trazas: { registrar } as never,
        jobs: { marcarHecho: marcarHechoTx } as never,
      } as ReposTransaccion),
    ),
  };
  return { jobs, oas, uow, crearBorrador, registrar };
}

describe('ProcesarTrabajoGuiaUseCase', () => {
  it('toma un job, carga el OA, genera y persiste un borrador de guía + traza', async () => {
    const { jobs, oas, uow, crearBorrador, registrar } = dobles();
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas,
      generar: new GenerarGuiaUseCase({
        async generar(args) {
          const parsed = args.schema.parse(guiaIa);
          return {
            parsed,
            stopReason: 'end_turn',
            usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
            modelo: 'muestras',
          };
        },
      }),
      uow,
    });

    const r = await uc.ejecutarSiguiente('w-1');
    expect(r.tipo).toBe('hecho');
    expect(crearBorrador).toHaveBeenCalledOnce();
    const args = crearBorrador.mock.calls[0]![0] as { tipo: string; corpusVersionId: string };
    expect(args.tipo).toBe('guia');
    expect(args.corpusVersionId).toBe('cv-1');
    expect(registrar).toHaveBeenCalledOnce();
  });

  it('sin trabajo devuelve sin_trabajo', async () => {
    const { jobs, oas, uow } = dobles();
    (jobs.tomarSiguienteGuia as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas,
      generar: new GenerarGuiaUseCase({ async generar() { throw new Error('no'); } }),
      uow,
    });
    expect((await uc.ejecutarSiguiente('w-1')).tipo).toBe('sin_trabajo');
  });

  it('falla permanente si el OA no existe en el corpus publicado', async () => {
    const { jobs, uow } = dobles();
    const oasVacio: OaRepository = {
      porAsignaturaCurso: vi.fn(async () => []),
      porAsignaturaNivel: vi.fn(async () => []),
      porIds: vi.fn(async () => []),
    };
    const uc = new ProcesarTrabajoGuiaUseCase({
      jobs: jobs as JobRepository,
      oas: oasVacio,
      generar: new GenerarGuiaUseCase({ async generar() { throw new Error('no'); } }),
      uow,
    });
    const r = await uc.ejecutarSiguiente('w-1');
    expect(r.tipo).toBe('fallido');
  });
});
```

- [ ] **Step 2: Run test — verificar que falla**

Run: `pnpm exec vitest run ProcesarTrabajoGuiaUseCase`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `ProcesarTrabajoGuiaUseCase`**

Crear `packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.ts`:

```typescript
// packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.ts
// Tanda 1 · Orquesta la cola asíncrona de la GUÍA (espejo de ProcesarTrabajoPruebaUseCase), pero
// STANDALONE desde un OA: carga el OA del corpus publicado (OaRepository) en vez de una planificación.
// Genera la guía híbrida, corre guiaGate (INV-1) y persiste UN borrador + traza_ia en una transacción.
// INV-3: nace 'borrador'. origen_id = null (no cuelga de ninguna unidad).

import type {
  JobRepository,
  OaRepository,
  ReposTransaccion,
  UnidadDeTrabajo,
} from '@faro/domain';
import { guiaGate } from '@faro/domain';
import type { ContextoCascada } from './tipos.js';
import type { GenerarGuiaUseCase } from './GenerarGuiaUseCase.js';

export type ResultadoProcesarGuia =
  | { tipo: 'sin_trabajo' }
  | { tipo: 'hecho'; jobId: string; documentoId: string }
  | { tipo: 'reintenta'; jobId: string; error: string }
  | { tipo: 'fallido'; jobId: string; error: string };

export interface DependenciasProcesarGuia {
  readonly jobs: JobRepository;
  readonly oas: OaRepository;
  readonly generar: GenerarGuiaUseCase;
  readonly uow: UnidadDeTrabajo;
  readonly maxIntentos?: number;
}

export class ProcesarTrabajoGuiaUseCase {
  private readonly jobs: JobRepository;
  private readonly oas: OaRepository;
  private readonly generar: GenerarGuiaUseCase;
  private readonly uow: UnidadDeTrabajo;
  private readonly maxIntentos: number;

  constructor(deps: DependenciasProcesarGuia) {
    this.jobs = deps.jobs;
    this.oas = deps.oas;
    this.generar = deps.generar;
    this.uow = deps.uow;
    this.maxIntentos = deps.maxIntentos ?? 3;
  }

  async ejecutarSiguiente(workerId: string): Promise<ResultadoProcesarGuia> {
    const job = await this.jobs.tomarSiguienteGuia(workerId);
    if (job === null) return { tipo: 'sin_trabajo' };

    const { asignatura, nivel, oaCodigo, conocimiento, establecimiento } = job.payload;

    // Carga el OA del corpus PUBLICADO (resuelve la corpus_version vigente). Errores PERMANENTES:
    // OA inexistente en el corpus publicado (un reintento no cambiaría el input).
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
      const { valor: guia, meta } = await this.generar.ejecutarConMeta(ctx, conocimiento);
      const reporte = guiaGate(guia);

      const documentoId = await this.uow.enTransaccion(async (repos: ReposTransaccion) => {
        const doc = await repos.documentos.crearBorrador({
          tipo: 'guia',
          establecimientoId: establecimiento,
          corpusVersionId: oa.corpusVersionId, // INV-4
          payload: guia,
          resultadoGates: reporte,
          estadoGeneracion: reporte.ok ? 'validado' : 'fallido',
        });
        await repos.trazas.registrar({
          documentoId: doc.id,
          corpusVersionId: oa.corpusVersionId,
          modelo: meta.modelo,
          rutaDecision: 'guia/manual',
          promptHash: '',
          recuperado: [],
          citas: [],
          evals: reporte,
          usage: meta.usage,
          revisor: null,
        });
        await repos.jobs.marcarHecho(job.id, doc.id);
        return doc.id;
      });

      return { tipo: 'hecho', jobId: job.id, documentoId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      if (job.intentos < this.maxIntentos) {
        await this.jobs.reintentar(job.id, mensaje);
        return { tipo: 'reintenta', jobId: job.id, error: mensaje };
      }
      await this.jobs.marcarFallido(job.id, mensaje);
      return { tipo: 'fallido', jobId: job.id, error: mensaje };
    }
  }

  private async fallar(jobId: string, error: string): Promise<ResultadoProcesarGuia> {
    await this.jobs.marcarFallido(jobId, error);
    return { tipo: 'fallido', jobId, error };
  }
}
```

- [ ] **Step 4: Exportar desde el índice de application**

En `packages/application/src/index.ts` añadir:

```typescript
export { ProcesarTrabajoGuiaUseCase } from './aula/cascada/ProcesarTrabajoGuiaUseCase.js';
export type { ResultadoProcesarGuia, DependenciasProcesarGuia } from './aula/cascada/ProcesarTrabajoGuiaUseCase.js';
```

- [ ] **Step 5: Run test — verificar que pasa**

Run: `pnpm exec vitest run ProcesarTrabajoGuiaUseCase`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.ts packages/application/src/aula/cascada/ProcesarTrabajoGuiaUseCase.test.ts packages/application/src/index.ts
git commit -m "feat(application): ProcesarTrabajoGuiaUseCase (cola guia, carga OA del corpus publicado)"
```

---

## Task 9: Export de la guía (`.docx`/`.pdf`)

Reusa el render de ítems de `planoPrueba` (factorizado) y los primitivos docx del adaptador de prueba.

**Files:**
- Modify: `packages/domain/src/ports/index.ts` (añadir `DatosInstitucionalesGuia` + `ExportGuiaPort`)
- Modify: `packages/domain/src/index.ts` (exportar ambos)
- Modify: `packages/infra-export/src/docx/planoPrueba.ts` (exportar `itemPlano`, `ItemPlano`)
- Create: `packages/infra-export/src/docx/planoGuia.ts`
- Create: `packages/infra-export/src/docx/GuiaExportAdapter.ts`
- Create: `packages/infra-export/src/docx/construirDocumentoGuia.ts`
- Modify: `packages/infra-export/src/index.ts` (exportar `GuiaExportAdapter`, `planoGuia`, `GuiaPlano`)
- Test: `packages/infra-export/src/docx/planoGuia.test.ts`

> **Una sola definición de `DatosInstitucionalesGuia`:** vive en el DOMINIO (`ports/index.ts`, porque el puerto `ExportGuiaPort` la referencia). `planoGuia.ts`, el adapter y la web la IMPORTAN de `@faro/domain` — nunca la redefinen.

- [ ] **Step 1: Definir el puerto + tipo en el dominio (primero, lo consume todo lo demás)**

En `packages/domain/src/ports/index.ts`, junto a `ExportPruebaPort` (importa `Guia` donde se importan los otros schema types del puerto):

```typescript
// --- Export de la Guía del alumno (.docx/.pdf) — Tanda 1, INV-6 ---
export interface DatosInstitucionalesGuia {
  readonly nombreColegio: string;
  readonly comuna: string;
  readonly docente?: string;
}

export interface ExportGuiaPort {
  aDocx(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
  aPdf(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado>;
}
```

En `packages/domain/src/index.ts`:

```typescript
export type { ExportGuiaPort, DatosInstitucionalesGuia } from './ports/index.js';
```

Run: `pnpm --filter @faro/domain build` (para que infra-export y web vean los nuevos tipos).

- [ ] **Step 2: Exportar `itemPlano` e `ItemPlano` desde `planoPrueba.ts`**

En `packages/infra-export/src/docx/planoPrueba.ts`, anteponer `export` a `function itemPlano(...)` (hoy es función local; `ItemPlano` ya es `export type`). No cambia comportamiento; solo visibilidad.

- [ ] **Step 3: Escribir el test del IR (falla primero)**

Crear `packages/infra-export/src/docx/planoGuia.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { DatosInstitucionalesGuia, Guia } from '@faro/domain';
import { planoGuia } from './planoGuia.js';

const guia: Guia = {
  asignatura: 'Ciencias Naturales',
  curso: '3º básico',
  oa: { codigo: 'CN03 OA 01', descripcion: 'Observar y describir los seres vivos.' },
  conocimiento: 'Características de los seres vivos',
  perfil_nivel: '3-4',
  titulo: 'Guía: Características de los seres vivos',
  explicacion: 'Los seres vivos nacen, crecen y se alimentan.',
  ejemplo: 'Un perro nace, crece y come.',
  ejercicios: [
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender',
      tipo: 'verdadero_falso',
      enunciado: 'Un árbol es un ser vivo.',
      alternativas: [
        { texto: 'Verdadero', correcta: true },
        { texto: 'Falso', correcta: false },
      ],
      retroalimentacion: 'Los árboles crecen.',
    },
  ],
};

const inst: DatosInstitucionalesGuia = { nombreColegio: 'Colegio Demo', comuna: 'Conchalí' };

describe('planoGuia', () => {
  it('produce el IR con encabezado, explicación, ejemplo y ejercicios numerados', () => {
    const plano = planoGuia(guia, inst);
    expect(plano.encabezado.titulo).toBe('Guía: Características de los seres vivos');
    expect(plano.encabezado.lineaColegio).toContain('Colegio Demo');
    expect(plano.encabezado.oa.codigo).toBe('CN03 OA 01');
    expect(plano.explicacion).toContain('seres vivos');
    expect(plano.ejemplo).toContain('perro');
    expect(plano.ejercicios).toHaveLength(1);
    expect(plano.ejercicios[0]!.numero).toBe(1);
    // El alumno NO ve la solución (mostrarSolucion = false).
    expect(plano.ejercicios[0]!.solucion).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test — verificar que falla**

Run: `pnpm exec vitest run planoGuia`
Expected: FAIL — módulo `./planoGuia.js` no existe.

- [ ] **Step 5: Implementar `planoGuia` (IR puro)**

Crear `packages/infra-export/src/docx/planoGuia.ts`:

```typescript
// packages/infra-export/src/docx/planoGuia.ts
// IR puro y testeable de la GUÍA del alumno: encabezado + explicación + ejemplo + ejercicios.
// Reusa itemPlano de planoPrueba para mapear cada ejercicio (variante alumno → sin solución).

import type { DatosInstitucionalesGuia, Guia, ItemPruebaType } from '@faro/domain';
import { itemPlano, type ItemPlano } from './planoPrueba.js';

export interface EncabezadoGuiaPlano {
  readonly lineaColegio: string;
  readonly docente?: string;
  readonly asignatura: string;
  readonly curso: string;
  readonly titulo: string;
  readonly conocimiento: string;
  readonly oa: { readonly codigo: string; readonly descripcion: string };
  readonly identificacion: ReadonlyArray<ReadonlyArray<string>>;
}

export interface GuiaPlano {
  readonly encabezado: EncabezadoGuiaPlano;
  readonly explicacion: string;
  readonly ejemplo: string;
  readonly ejercicios: readonly ItemPlano[];
}

export function planoGuia(guia: Guia, inst: DatosInstitucionalesGuia): GuiaPlano {
  const items: ItemPruebaType[] = [...guia.ejercicios, ...(guia.desafio ? [guia.desafio] : [])];
  // Variante alumno: mostrarSolucion = false (no se revelan respuestas).
  const ejercicios = items.map((it, i) => itemPlano(it, i + 1, false));

  return {
    encabezado: {
      lineaColegio: `${inst.nombreColegio} · ${inst.comuna}`,
      ...(inst.docente !== undefined ? { docente: inst.docente } : {}),
      asignatura: guia.asignatura,
      curso: guia.curso,
      titulo: guia.titulo,
      conocimiento: guia.conocimiento,
      oa: { codigo: guia.oa.codigo, descripcion: guia.oa.descripcion },
      identificacion: [['Nombre:', 'Curso:', 'Fecha:']],
    },
    explicacion: guia.explicacion,
    ejemplo: guia.ejemplo,
    ejercicios,
  };
}
```

- [ ] **Step 6: Run test — verificar que pasa**

Run: `pnpm --filter @faro/domain build && pnpm exec vitest run planoGuia`
Expected: PASS (1 test).

- [ ] **Step 7: Implementar `GuiaExportAdapter` + `construirDocumentoGuia`**

Crear `packages/infra-export/src/docx/GuiaExportAdapter.ts` **espejo de `PruebaExportAdapter.ts`** (misma estructura: `aDocx` arma el doc desde el IR y empaqueta con `Packer`; `aPdf` resuelve soffice, llama a `aDocx` y convierte). Reusa los helpers ya existentes en `PruebaExportAdapter.ts`/su módulo: `resolverSofficeBin`, `construirComandoSoffice`, `rutaPdfEsperada`, `MotorPdfNoDisponibleError`, `MIME_DOCX`, `MIME_PDF` (impórtalos del mismo lugar que `PruebaExportAdapter`). La única pieza nueva es `construirDocumentoGuia(plano: GuiaPlano): Document`.

```typescript
// packages/infra-export/src/docx/GuiaExportAdapter.ts
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Document, Packer } from 'docx';
import type { ArchivoExportado, DatosInstitucionalesGuia, ExportGuiaPort, Guia } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { planoGuia, type GuiaPlano } from './planoGuia.js';
// Reusa del módulo de la prueba: ajusta el import a donde vivan realmente estos símbolos
// (mira los imports de PruebaExportAdapter.ts).
import {
  MIME_DOCX,
  MIME_PDF,
  MotorPdfNoDisponibleError,
  resolverSofficeBin,
  construirComandoSoffice,
  rutaPdfEsperada,
} from './sofficePdf.js';
import { construirDocumentoGuia } from './construirDocumentoGuia.js';

const execFileP = promisify(execFile);

function nombreArchivoGuia(guia: Guia, idDocumento?: string): string {
  const slug = guia.conocimiento.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  return idDocumento !== undefined ? `guia-${slug}-${idDocumento}` : `guia-${slug}`;
}

export class GuiaExportAdapter implements ExportGuiaPort {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
  ) {}

  async aDocx(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const plano: GuiaPlano = planoGuia(guia, inst);
    const doc: Document = construirDocumentoGuia(plano);
    const data = await Packer.toBuffer(doc);
    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${nombreArchivoGuia(guia, idDocumento)}.docx`);
    await writeFile(ruta, data);
    this.log.info({ ruta, bytes: data.length, ejercicios: plano.ejercicios.length }, 'export.guia.docx');
    return { ruta, mime: MIME_DOCX, bytes: data.length };
  }

  async aPdf(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const bin = resolverSofficeBin();
    if (bin === null) throw new MotorPdfNoDisponibleError();
    const docx = await this.aDocx(guia, inst, idDocumento);
    const profileDir = await mkdtemp(join(tmpdir(), 'faro-soffice-'));
    try {
      const { args } = construirComandoSoffice(bin, docx.ruta, this.dirSalida, profileDir);
      await execFileP(bin, args, { timeout: 120_000 });
      const ruta = rutaPdfEsperada(this.dirSalida, docx.ruta);
      if (!existsSync(ruta)) throw new Error(`LibreOffice no produjo el PDF esperado en ${ruta}.`);
      const { size } = await stat(ruta);
      this.log.info({ ruta, bytes: size }, 'export.guia.pdf');
      return { ruta, mime: MIME_PDF, bytes: size };
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}
```

> **IMPORTANTE — imports de soffice/PDF:** abre `packages/infra-export/src/docx/PruebaExportAdapter.ts` y copia sus líneas de `import` para `resolverSofficeBin`, `construirComandoSoffice`, `rutaPdfEsperada`, `MotorPdfNoDisponibleError`, `MIME_DOCX`, `MIME_PDF` — usa exactamente esas mismas rutas (arriba están como `./sofficePdf.js` de forma ilustrativa).

Crear `packages/infra-export/src/docx/construirDocumentoGuia.ts`. **Replica los primitivos docx de `construirDocumentoPrueba`** (en `PruebaExportAdapter.ts`): mismos estilos de `Paragraph`/`HeadingLevel`/tablas. Estructura del documento, en orden:
1. Encabezado: `lineaColegio`; `docente` (si está); fila de identificación (`Nombre / Curso / Fecha`).
2. Título (`plano.encabezado.titulo`).
3. Línea `OA <codigo>: <descripcion>` y `Conocimiento: <conocimiento>`.
4. Sección **"¿Qué vamos a aprender?"** → `plano.explicacion`.
5. Sección **"Ejemplo"** → `plano.ejemplo`.
6. Sección **"Ahora practica"** → cada `plano.ejercicios[i]` renderizado **igual que en la prueba** (reusa el patrón de render por `tipo` de `construirDocumentoPrueba`: enunciado numerado + alternativas/líneas/pares según el `ItemPlano`). Como `mostrarSolucion=false`, NO se imprimen soluciones ni retroalimentación.

Firma: `export function construirDocumentoGuia(plano: GuiaPlano): Document`. Para el render por tipo de cada ejercicio, extrae/duplica la función de render de ítem de `construirDocumentoPrueba` (opera sobre `ItemPlano`, que ya exportaste en el Step 2). Si es práctico, factoriza esa función de render-de-ítem a un módulo compartido e impórtala en ambos; si no, replícala (es determinista y está cubierta por el test del IR + el smoke de Task 11).

- [ ] **Step 8: Exportar el adapter desde infra-export**

En `packages/infra-export/src/index.ts` añadir:

```typescript
export { GuiaExportAdapter } from './docx/GuiaExportAdapter.js';
export { planoGuia } from './docx/planoGuia.js';
export type { GuiaPlano } from './docx/planoGuia.js';
```

(`DatosInstitucionalesGuia` y `ExportGuiaPort` ya se exportan desde `@faro/domain` — ver Step 1.)

- [ ] **Step 9: Typecheck + tests del paquete**

Run:
```bash
pnpm --filter @faro/domain build
pnpm --filter @faro/infra-export typecheck
pnpm exec vitest run planoGuia
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/infra-export/src/docx/planoPrueba.ts packages/infra-export/src/docx/planoGuia.ts packages/infra-export/src/docx/planoGuia.test.ts packages/infra-export/src/docx/GuiaExportAdapter.ts packages/infra-export/src/docx/construirDocumentoGuia.ts packages/infra-export/src/index.ts packages/domain/src/ports/index.ts packages/domain/src/index.ts
git commit -m "feat(infra-export): GuiaExportAdapter + planoGuia (reusa itemPlano de la prueba)"
```

---

## Task 10: Cablear el worker

**Files:**
- Modify: `apps/worker/src/main.ts`

- [ ] **Step 1: Construir el procesador de guía**

En `apps/worker/src/main.ts`, junto a `pptInfantilUseCase`, añadir (importa `ProcesarTrabajoGuiaUseCase` de `@faro/application`, `GenerarGuiaUseCase` de `@faro/application`, y reusa `oas` ya construido arriba):

```typescript
  // --- Cola de guías del alumno (Tanda 1), en paralelo a las otras (no las toca) ---
  const guiaUseCase = new ProcesarTrabajoGuiaUseCase({
    jobs: new JobRepositoryDrizzle(db),
    oas,
    generar: new GenerarGuiaUseCase(llm),
    uow: new UnidadDeTrabajoDrizzle(db),
  });
```

- [ ] **Step 2: Añadir el bloque en el loop de polling**

Tras el bloque `const rpp = await pptInfantilUseCase.ejecutarSiguiente(workerId); switch (...) {...}`, añadir:

```typescript
    const rg = await guiaUseCase.ejecutarSiguiente(workerId);
    switch (rg.tipo) {
      case 'sin_trabajo':
        break;
      case 'hecho':
        log.info({ jobId: rg.jobId, documentoId: rg.documentoId }, 'worker: guía hecha');
        break;
      case 'reintenta':
        log.warn({ jobId: rg.jobId, error: rg.error }, 'worker: guía reencolada para reintento');
        break;
      case 'fallido':
        log.error({ jobId: rg.jobId, error: rg.error }, 'worker: guía fallida');
        break;
    }
```

Y añade `rg.tipo === 'sin_trabajo'` a la condición de backoff (las cinco colas vacías):

```typescript
    if (
      r.tipo === 'sin_trabajo' &&
      rp.tipo === 'sin_trabajo' &&
      rt.tipo === 'sin_trabajo' &&
      rpp.tipo === 'sin_trabajo' &&
      rg.tipo === 'sin_trabajo'
    ) {
      await esperar(INTERVALO_VACIO_MS);
    }
```

- [ ] **Step 3: Typecheck del worker**

Run: `pnpm --filter @faro/worker typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/main.ts
git commit -m "feat(worker): cablea la cola de guías al loop de polling"
```

---

## Task 11: Rutas web (encolar, estado, export) + helper

Mira primero la ruta de estado de la prueba `apps/web/app/api/aula/prueba/[jobId]/route.ts` para clonar su forma exacta (no extraída aquí; usa `jobs.obtenerEstado`).

**Files:**
- Create: `apps/web/app/api/aula/guia/route.ts`
- Create: `apps/web/app/api/aula/guia/[jobId]/route.ts`
- Create: `apps/web/app/api/aula/documentos/[id]/guia/route.ts`
- Create: `apps/web/src/lib/exportarGuia.ts`
- Modify: `apps/web/src/lib/produccion.ts` (exponer `guiaExport`)

- [ ] **Step 1: Exponer `guiaExport` en `produccion()`**

En `apps/web/src/lib/produccion.ts`, donde se construye `pruebaExport` (un `PruebaExportAdapter`), añadir un `guiaExport: new GuiaExportAdapter(<mismo dirSalida>, <mismo logger hijo>)` al objeto retornado, importando `GuiaExportAdapter` de `@faro/infra-export`. Usa exactamente el mismo `dirSalida` (carpeta `generated`) y patrón de logger que `pruebaExport`.

- [ ] **Step 2: Ruta de encolado `POST /api/aula/guia`**

Crear `apps/web/app/api/aula/guia/route.ts`:

```typescript
// POST /api/aula/guia — encola la generación de una GUÍA del alumno (Tanda 1, modo manual). Standalone
// desde un OA: body = { asignatura, nivel, oaCodigo, conocimiento, establecimiento }. Responde 202 { jobId }.

import { NextResponse } from 'next/server';
import { SchemaPayloadGuia } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/guia');

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo.' }, { status: 400 });
  }

  const parsed = SchemaPayloadGuia.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `Petición inválida: ${parsed.error.message}` }, { status: 400 });
  }

  try {
    const { jobs } = produccion();
    const jobId = await jobs.encolarGuia(parsed.data);
    log.info({ jobId, oaCodigo: parsed.data.oaCodigo }, 'guía encolada');
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    return responderError500(log, e, { oaCodigo: parsed.data.oaCodigo }, 'POST /guia falló');
  }
}
```

- [ ] **Step 3: Ruta de estado `GET /api/aula/guia/[jobId]`**

Crear `apps/web/app/api/aula/guia/[jobId]/route.ts` **clonando** `apps/web/app/api/aula/prueba/[jobId]/route.ts` (misma forma: lee `jobId`, llama `jobs.obtenerEstado(jobId)`, 404 si null, devuelve `{ estado, documentoId, error }`). Cambia solo el logger hijo a `'web/guia'`.

- [ ] **Step 4: Helper `prepararExportGuia`**

Crear `apps/web/src/lib/exportarGuia.ts`:

```typescript
// apps/web/src/lib/exportarGuia.ts
import { SchemaGuia, type DatosInstitucionalesGuia, type Guia } from '@faro/domain';
import { produccion } from './produccion';

export type PreparacionExportGuia =
  | { readonly ok: true; readonly guia: Guia; readonly inst: DatosInstitucionalesGuia }
  | { readonly ok: false; readonly status: number; readonly error: string };

export async function prepararExportGuia(
  id: string,
  override?: Partial<DatosInstitucionalesGuia>,
): Promise<PreparacionExportGuia> {
  const { documentos } = produccion();
  const doc = await documentos.porId(id);
  if (doc === null) return { ok: false, status: 404, error: `Documento '${id}' no encontrado.` };
  if (doc.tipo !== 'guia') return { ok: false, status: 400, error: `El documento '${id}' no es una guía.` };

  const guia = SchemaGuia.safeParse(doc.contenido);
  if (!guia.success) {
    return { ok: false, status: 422, error: 'El contenido del documento no es una guía válida.' };
  }

  const inst: DatosInstitucionalesGuia = {
    nombreColegio: override?.nombreColegio ?? guia.data.asignatura, // fallback inocuo; el colegio real viene por override
    comuna: override?.comuna ?? '[Comuna]',
    ...(override?.docente !== undefined ? { docente: override.docente } : {}),
  };
  return { ok: true, guia: guia.data, inst };
}
```

> Nota: la guía no guarda el nombre del colegio (es standalone desde un OA). El colegio/comuna/docente llegan como overrides de query (como en la prueba). El fallback de `nombreColegio` es inocuo; la web puede pasar `?nombreColegio=...`.

- [ ] **Step 5: Ruta de export `GET /api/aula/documentos/[id]/guia`**

Crear `apps/web/app/api/aula/documentos/[id]/guia/route.ts` **clonando** la ruta de export de la prueba (`apps/web/app/api/aula/documentos/[id]/prueba/route.ts`), con estos cambios: sin `variante` (la guía tiene una sola); usa `prepararExportGuia`; llama `guiaExport.aDocx(prep.guia, prep.inst, id)` / `guiaExport.aPdf(...)`; los overrides son `nombreColegio`, `comuna`, `docente` (no `porcentajeExigencia`). Conserva el manejo de `MotorPdfNoDisponibleError` → 503 y los headers de descarga.

```typescript
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NextResponse } from 'next/server';
import type { DatosInstitucionalesGuia } from '@faro/domain';
import { MIME_DOCX, MIME_PDF, MotorPdfNoDisponibleError } from '@faro/infra-export';
import { crearLoggerHijo } from '@faro/observability';
import { produccion } from '@/lib/produccion';
import { prepararExportGuia } from '@/lib/exportarGuia';
import { responderError500 } from '@/lib/respuestaError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = crearLoggerHijo('web/documentos/guia');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const url = new URL(_req.url);
  const formato = url.searchParams.get('formato') === 'pdf' ? 'pdf' : 'docx';

  const override: Partial<DatosInstitucionalesGuia> = {
    ...(url.searchParams.get('nombreColegio') !== null
      ? { nombreColegio: url.searchParams.get('nombreColegio') as string }
      : {}),
    ...(url.searchParams.get('comuna') !== null ? { comuna: url.searchParams.get('comuna') as string } : {}),
    ...(url.searchParams.get('docente') !== null ? { docente: url.searchParams.get('docente') as string } : {}),
  };

  try {
    const prep = await prepararExportGuia(id, override);
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

    const { guiaExport } = produccion();
    const archivo =
      formato === 'pdf'
        ? await guiaExport.aPdf(prep.guia, prep.inst, id)
        : await guiaExport.aDocx(prep.guia, prep.inst, id);
    const data = await readFile(archivo.ruta);

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': formato === 'pdf' ? MIME_PDF : MIME_DOCX,
        'Content-Disposition': `attachment; filename="${basename(archivo.ruta)}"`,
        'Content-Length': String(data.length),
      },
    });
  } catch (e) {
    if (e instanceof MotorPdfNoDisponibleError) {
      return NextResponse.json(
        { error: 'La exportación a PDF no está disponible en este entorno (falta LibreOffice). Usa .docx.' },
        { status: 503 },
      );
    }
    return responderError500(log, e, { id, formato }, 'GET /documentos/[id]/guia falló');
  }
}
```

- [ ] **Step 6: Typecheck de la web**

Run: `pnpm --filter @faro/web typecheck`
Expected: PASS. (Requiere `pnpm --filter @faro/domain build` y que infra-export compile.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/aula/guia apps/web/app/api/aula/documentos/[id]/guia apps/web/src/lib/exportarGuia.ts apps/web/src/lib/produccion.ts
git commit -m "feat(web): rutas de guía (encolar, estado, export) + helper"
```

---

## Task 12: UI — componente "Generar guía"

**Files:**
- Modify: `apps/web/app/aula/planificacion/page.tsx`

> En Tanda 1 la guía es standalone desde un OA. Para no rediseñar la pantalla, el componente toma como contexto la **misma planificación** que ya se está revisando (de ahí saca asignatura/nivel/establecimiento y la lista de OA), y pide al docente: elegir un OA y escribir el **conocimiento/tema**. (Tanda 2 reemplaza el campo libre por la lista de conocimientos auto-propuesta.)

- [ ] **Step 1: Añadir el componente `GenerarGuia`**

En `apps/web/app/aula/planificacion/page.tsx`, **clona** el componente `GenerarPrueba` como `GenerarGuia`, con estos cambios. Recibe el contexto de la planificación que el padre ya tiene a mano (asignatura, nivel, establecimiento, y la lista de OA con sus códigos). Añade dos inputs controlados: `<select>` de OA y `<input>` de texto para el conocimiento. El `fetch` POST va a `/api/aula/guia` con el body `{ asignatura, nivel, oaCodigo, conocimiento, establecimiento }`. El polling usa `sondearJob('/api/aula/guia', jobId)`. Los enlaces de descarga apuntan a `/api/aula/documentos/${guiaDocId}/guia?formato=docx`.

```tsx
function GenerarGuia({
  asignatura,
  nivel,
  establecimiento,
  oaCodigos,
}: {
  asignatura: string;
  nivel: string;
  establecimiento: string;
  oaCodigos: readonly string[];
}) {
  const [oaCodigo, setOaCodigo] = useState<string>(oaCodigos[0] ?? '');
  const [conocimiento, setConocimiento] = useState<string>('');
  const [estado, setEstado] = useState<'idle' | 'generando' | 'listo' | 'error' | 'segundo_plano'>('idle');
  const [guiaDocId, setGuiaDocId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const aplicar = useCallback((r: ResultadoSondeo) => {
    if (r.estado === 'fallido') {
      setErr(r.error);
      setEstado('error');
    } else if (r.estado === 'listo') {
      setGuiaDocId(r.documentoId);
      setEstado('listo');
    } else {
      setEstado('segundo_plano');
    }
  }, []);

  const generar = useCallback(async () => {
    if (oaCodigo === '' || conocimiento.trim() === '') {
      setErr('Elige un OA y escribe el conocimiento/tema de la guía.');
      setEstado('error');
      return;
    }
    setErr(null);
    setEstado('generando');
    try {
      const res = await fetch('/api/aula/guia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asignatura, nivel, oaCodigo, conocimiento: conocimiento.trim(), establecimiento }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? `POST → ${res.status}`);
      }
      const { jobId: nuevo } = (await res.json()) as { jobId: string };
      setJobId(nuevo);
      aplicar(await sondearJob('/api/aula/guia', nuevo));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo generar la guía.');
      setEstado('error');
    }
  }, [asignatura, nivel, establecimiento, oaCodigo, conocimiento, aplicar]);

  const comprobar = useCallback(async () => {
    if (jobId === null) return;
    setErr(null);
    setEstado('generando');
    try {
      aplicar(await sondearJob('/api/aula/guia', jobId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo comprobar la guía.');
      setEstado('error');
    }
  }, [jobId, aplicar]);

  return (
    <fieldset>
      <legend>Guía de trabajo del alumno (desde un OA · 3º-6º)</legend>
      {err !== null && <p style={{ color: '#b00020' }}>⚠ {err}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <label>
          OA:{' '}
          <select value={oaCodigo} onChange={(e) => setOaCodigo(e.target.value)}>
            {oaCodigos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Conocimiento:{' '}
          <input
            type="text"
            value={conocimiento}
            placeholder="Ej: Características de los seres vivos"
            onChange={(e) => setConocimiento(e.target.value)}
            style={{ width: '60%' }}
          />
        </label>
      </div>
      {(estado === 'idle' || estado === 'error') && (
        <button onClick={() => void generar()}>Generar guía (borrador)</button>
      )}
      {estado === 'generando' && <p>Generando la guía… (corre en el worker)</p>}
      {estado === 'segundo_plano' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>La guía sigue generándose en segundo plano.</span>
          <button onClick={() => void comprobar()}>Comprobar de nuevo</button>
        </div>
      )}
      {estado === 'listo' && guiaDocId !== null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Guía generada (borrador):</span>
          <a href={`/api/aula/documentos/${guiaDocId}/guia?formato=docx`}>.docx</a>
        </div>
      )}
    </fieldset>
  );
}
```

- [ ] **Step 2: Renderizar el componente**

Donde se renderizan `<GenerarPrueba .../>` y `<GenerarPptInfantil .../>` (dentro de `RevisionPlan`), añade `<GenerarGuia .../>` pasándole los datos de la planificación en contexto. La planificación de unidad ya cargada tiene `asignatura`, `nivel`, `establecimiento` y `oa` (lista con `codigo`). Ejemplo:

```tsx
<GenerarGuia
  asignatura={plan.asignatura}
  nivel={plan.nivel}
  establecimiento={plan.establecimiento}
  oaCodigos={plan.oa.map((o) => o.codigo)}
/>
```

> Ajusta `plan` al nombre real de la variable que tiene la `PlanificacionUnidad` en `RevisionPlan` (mira cómo `GenerarPrueba` obtiene `documentoId`; los datos de la unidad están en el mismo scope o se cargan junto al documento). Si en ese scope solo está el `documentoId` y no el objeto unidad, carga la unidad con `SchemaPlanificacionUnidad` desde el documento (mismo patrón que el resto de la pantalla) y pásale sus campos.

- [ ] **Step 3: Typecheck + lint de la web**

Run:
```bash
pnpm --filter @faro/web typecheck
pnpm exec eslint apps/web/app/aula/planificacion/page.tsx --max-warnings 0
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/aula/planificacion/page.tsx
git commit -m "feat(web): botón Generar guía en la pantalla de aula (modo manual)"
```

---

## Task 13: Verificación final + smoke

- [ ] **Step 1: Typecheck + lint + suite completa**

Run:
```bash
pnpm --filter @faro/domain build
pnpm typecheck
pnpm lint
pnpm exec vitest run
```
Expected: TODO verde. La suite debe pasar con los nuevos tests (guia, guiaGate, payloadGuia, GenerarGuiaUseCase, ProcesarTrabajoGuiaUseCase, planoGuia, repos.integration cola guia) y sin romper los existentes.

- [ ] **Step 2: Smoke en vivo (manual, requiere `.env` con `ANTHROPIC_API_KEY` para IA real; sin key, el worker usa samples y no hay muestra de guía → genera solo con key)**

```bash
docker compose up -d
pnpm seed          # asegura corpus publicado
pnpm dev           # levanta worker + web
```
Luego, en la web: abrir una planificación de unidad de **3º-6º**, en la sección "Guía de trabajo del alumno" elegir un OA, escribir un conocimiento (ej. "Características de los seres vivos") y "Generar guía". Verificar: el job aparece, el worker la genera, y el enlace `.docx` descarga una guía con explicación + ejemplo + ejercicios. Confirmar en DB:

```bash
docker exec faro-db psql -U faro -d faro -c "SELECT d.tipo, t.usage FROM traza_ia t JOIN documento_generado d ON d.id=t.documento_id WHERE d.tipo='guia' ORDER BY t.created_at DESC LIMIT 3;"
```

- [ ] **Step 3: Commit final (si hubo ajustes del smoke)**

```bash
git add -A
git commit -m "chore(guias): ajustes tras smoke de tanda 1"
```

---

## Notas de cierre

- **Tanda 2 (plan aparte):** `GenerarConocimientosUseCase` (descompone el OA en `{titulo, foco}[]`) + UI de lista/selección de conocimientos (HIL) que encola un job `guia` por cada conocimiento elegido. Reusa toda la maquinaria de esta tanda.
- **`[VERIFICAR]` (spec §11):** conseguir 1-2 PDFs reales de guía de 3º-6º para calcar el formato exacto en `construirDocumentoGuia`. La estructura "explicación → ejemplo → ejercicios" es canónica; ajústala si la ref real difiere.
- **DoD:** lint/typecheck verdes, sin `any`, suite verde, artefacto nace `borrador`.
