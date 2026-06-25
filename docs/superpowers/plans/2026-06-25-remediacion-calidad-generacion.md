# Remediación de calidad de generación (Plan 1 de 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los defectos de coherencia de contenido del smoke 2026-06-25 que NO requieren el nuevo pipeline de imágenes: anclar el concepto de la ficha/lámina (#1), y mejorar la prueba con dedup de ítems (#3) y calibración por tramo de edad (#4), más un pulido de numeración en la guía.

**Architecture:** Cambios acotados en `application` (use cases + prompts de `generacion.ts`) y `domain` (un detector puro en `prueba.ts`). Sin tocar `infra`. Todo se valida sin red (mocks de `LlmPort`). Es la fase 1 de 2: la fase 2 (`2026-06-25-remediacion-imagenes-ancladas.md`) añade las imágenes line-art reales a prueba/guía/PPT y absorbe #7 y #5.

**Tech Stack:** TypeScript strict, monorepo pnpm, Vitest, Zod. Generación híbrida vía `LlmPort`.

## Global Constraints

- **Regla hexagonal:** `domain` y `application` NUNCA importan de `@faro/infra-*`. `domain` se testea sin red.
- **HIL:** todo artefacto sigue naciendo `borrador`; estos cambios no alteran el estado.
- **Sin `any` injustificado; sin `console.log`. Conventional Commits.**
- **Verde antes de cada commit:** corre desde la raíz `pnpm exec vitest run <ruta>` (la suite del paquete), y al cierre `pnpm typecheck` + `pnpm lint` (eslint `--max-warnings 0`). `pnpm -r typecheck/lint` NO cubre `packages/*` — usa los scripts root.
- **Reintento por `GeneracionError`:** el worker reintenta cuando un use case lanza `GeneracionError`; por eso los rechazos de contenido inválido se modelan así (igual que la guardia anti-fuga existente).

---

### Task A1: La ficha usa el `concepto` del dibujo para los ejercicios (#1)

Raíz del bug: `GenerarFichaUseCase` pasa `opts?.concepto` (que en el smoke era `undefined`) al generador de ejercicios, en vez del `dibujo.concepto` ya resuelto. Por eso el título decía "manzanas" y los ejercicios hablaban de "globos".

**Files:**
- Modify: `packages/application/src/aula/cascada/GenerarFichaUseCase.ts:43`
- Test: `packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts`

**Interfaces:**
- Consumes: `ResolverDibujoUseCase.resolver(ctx, oaCodigo, opts) => Promise<DibujoResuelto>` con `DibujoResuelto.concepto: string`; `GenerarEjerciciosFichaUseCase.ejecutarConMeta(ctx, concepto?: string)`.
- Produces: comportamiento — los ejercicios reciben `dibujo.concepto`.

- [ ] **Step 1: Write the failing test**

Añade este `it` dentro del `describe('GenerarFichaUseCase', …)` de `GenerarFichaUseCase.test.ts` (el helper `deps()` ya hace que `descripcion` devuelva `concepto:'frutas'` y `banco.buscar` devuelva `null` → cache miss → `dibujo.concepto === 'frutas'`):

```ts
it('los ejercicios usan el CONCEPTO del dibujo, no opts.concepto (anclaje #1)', async () => {
  const d = deps();
  const uc = new GenerarFichaUseCase(d);
  // SIN opts.concepto: el concepto debe salir del dibujo resuelto ('frutas'), no de opts (undefined).
  await uc.ejecutarConMeta(ctxGrado('1º básico'));
  expect(d.ejercicios.ejecutarConMeta).toHaveBeenCalledWith(ctxGrado('1º básico'), 'frutas');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts`
Expected: FAIL — `ejecutarConMeta` fue llamado con `(ctx, undefined)`, no con `(ctx, 'frutas')`.

- [ ] **Step 3: Write minimal implementation**

En `GenerarFichaUseCase.ts`, línea 43, cambia el argumento de `opts?.concepto` a `dibujo.concepto`:

```ts
    const dibujo = await this.resolver.resolver(ctx, oa.codigo, opts);
    // El concepto YA resuelto por el dibujo alimenta los ejercicios → título, dibujo y ejercicios
    // comparten un solo concepto (anclaje #1; antes se pasaba opts?.concepto, que podía ser undefined).
    const { valor: ejercicios, meta: metaEj } = await this.ejercicios.ejecutarConMeta(ctx, dibujo.concepto);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts`
Expected: PASS (todos los tests del archivo, incluido el existente que pasa `{ concepto: 'frutas' }`).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/GenerarFichaUseCase.ts packages/application/src/aula/cascada/GenerarFichaUseCase.test.ts
git commit -m "fix(ficha): los ejercicios usan el concepto del dibujo (anclaje #1)"
```

---

### Task A2: `INSTR_DIBUJO` exige que `descripcion_en` represente el `concepto` (#1)

Segunda mitad de #1: dentro de la misma llamada, el LLM devolvía `concepto="conteo de manzanas"` pero `descripcion_en="birds in trees"` (sin amarre). El modelo de imagen solo ve `descripcion_en` → dibujó pájaros. Reforzamos la instrucción.

**Files:**
- Modify: `packages/application/src/aula/cascada/generacion.ts` (constante `INSTR_DIBUJO`)
- Test: `packages/application/src/aula/cascada/generacion.test.ts` (crear)

**Interfaces:**
- Produces: `INSTR_DIBUJO: BloqueSistema` con la cláusula de anclaje en su `.texto`.

- [ ] **Step 1: Write the failing test**

Crea `packages/application/src/aula/cascada/generacion.test.ts`:

```ts
// Tests de los prompts/entradas de la cascada (sin red): garantizan que las reglas críticas de
// calibración/anclaje no se borren por accidente. No validan la salida del LLM (eso es el smoke).
import { describe, expect, it } from 'vitest';
import { INSTR_DIBUJO } from './generacion.js';

describe('INSTR_DIBUJO', () => {
  it('exige que descripcion_en represente exactamente el concepto (anclaje #1)', () => {
    expect(INSTR_DIBUJO.texto).toContain("DEBE representar exactamente el 'concepto'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts`
Expected: FAIL — la cláusula aún no existe en `INSTR_DIBUJO`.

- [ ] **Step 3: Write minimal implementation**

En `generacion.ts`, dentro de `INSTR_DIBUJO`, añade el bullet de anclaje justo después del bullet de `descripcion_en` (el array completo queda así):

```ts
export const INSTR_DIBUJO = instruccion(
  [
    'Propón UN dibujo simple para COLOREAR (line-art), apropiado para niños de 1º a 3º básico, ligado al OA y al conocimiento provistos.',
    'El dibujo es pedagógico, NO decorativo: refleja lo que se aprende (p. ej. conteo → objetos para contar; "seres vivos" → un animal concreto).',
    "- 'concepto': etiqueta CORTA en español de lo que se dibuja (p. ej. 'conteo de frutas').",
    "- 'descripcion_en': descripción visual EN INGLÉS, concreta y breve (1–2 frases), de UNA escena simple apta para line-art de contornos gruesos.",
    "- 'descripcion_en' DEBE representar exactamente el 'concepto' (el MISMO motivo): si concepto='conteo de manzanas', el dibujo son manzanas — nunca otro objeto. No cambies de tema entre ambos campos.",
    'Reglas del dibujo (obligatorias):',
    '  · Sin texto, letras ni números dentro del dibujo.',
    '  · Formas simples y grandes, fáciles de pintar para un niño pequeño.',
    '  · PROHIBIDO: personajes con copyright o marca (Disney, Frozen, Pokémon, logos, etc.). Solo objetos/animales/escenas genéricos y originales.',
    '  · Evita escenas con personas si puedes (prefiere animales/objetos).',
  ].join('\n'),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/generacion.ts packages/application/src/aula/cascada/generacion.test.ts
git commit -m "fix(ficha): ancla descripcion_en al concepto en INSTR_DIBUJO (#1)"
```

---

### Task C1: Detector `itemsDuplicados()` en el dominio (#3)

La prueba del smoke tuvo dos ítems con enunciado idéntico ("¿Qué artista está en el 2º lugar?"). Ni el prompt ni el schema lo evitaban. Añadimos un detector puro (estilo `fugaDeTextoEnItems`).

**Files:**
- Modify: `packages/domain/src/schemas/prueba.ts` (añadir función)
- Modify: `packages/domain/src/index.ts:107` (exportar)
- Test: `packages/domain/src/schemas/prueba.test.ts`

**Interfaces:**
- Produces: `itemsDuplicados(items: readonly ItemPruebaType[]): { itemIndex: number } | null` — índice del primer ítem cuyo enunciado normalizado (trim, minúsculas, espacios colapsados) repite uno anterior; `null` si todos distintos.

- [ ] **Step 1: Write the failing test**

Añade a `packages/domain/src/schemas/prueba.test.ts` (importa `itemsDuplicados` desde `./prueba.js`):

```ts
import { itemsDuplicados } from './prueba.js';

describe('itemsDuplicados', () => {
  const base = {
    oa: 'MA01 OA 01',
    habilidad: 'recordar' as const,
    tipo: 'seleccion_multiple' as const,
    alternativas: [
      { texto: 'a', correcta: true },
      { texto: 'b', correcta: false },
    ],
  };

  it('detecta enunciados repetidos (normaliza espacios y mayúsculas)', () => {
    const items = [
      { ...base, enunciado: '¿Qué artista está en el 2º lugar?' },
      { ...base, enunciado: '  ¿Qué Artista está en el  2º lugar?  ' },
    ];
    expect(itemsDuplicados(items)).toEqual({ itemIndex: 1 });
  });

  it('devuelve null cuando todos los enunciados son distintos', () => {
    const items = [
      { ...base, enunciado: '¿Cuántas estrellas hay?' },
      { ...base, enunciado: '¿Qué número viene después del 8?' },
    ];
    expect(itemsDuplicados(items)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/schemas/prueba.test.ts`
Expected: FAIL — `itemsDuplicados` no existe / no se exporta.

- [ ] **Step 3: Write minimal implementation**

En `packages/domain/src/schemas/prueba.ts`, al final del archivo, añade:

```ts
/**
 * Detecta ítems con el MISMO enunciado (normalizado: trim, minúsculas, espacios colapsados). Un
 * duplicado en una prueba/ficha es un defecto de generación (p. ej. dos ítems "¿quién va 2º?" que
 * sólo cambian la imagen). El caller lanza GeneracionError → el worker reintenta (INV-2). Devuelve el
 * índice del PRIMER ítem repetido, o null si todos los enunciados son distintos.
 */
export function itemsDuplicados(
  items: readonly ItemPruebaType[],
): { itemIndex: number } | null {
  const vistos = new Set<string>();
  for (const [itemIndex, it] of items.entries()) {
    const norm = it.enunciado.trim().toLowerCase().replace(/\s+/g, ' ');
    if (norm.length === 0) continue; // enunciado vacío lo cazan otros gates, no este
    if (vistos.has(norm)) return { itemIndex };
    vistos.add(norm);
  }
  return null;
}
```

En `packages/domain/src/index.ts`, línea 107, añade `itemsDuplicados` a la lista exportada desde `./schemas/prueba.js`:

```ts
export { SchemaPrueba, ItemPrueba, LIMITE_TEXTO_ITEM, fugaDeTextoEnPrueba, fugaDeTextoEnItems, itemsDuplicados } from './schemas/prueba.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/domain/src/schemas/prueba.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/schemas/prueba.ts packages/domain/src/index.ts packages/domain/src/schemas/prueba.test.ts
git commit -m "feat(prueba): detector itemsDuplicados en el dominio (#3)"
```

---

### Task C2: La prueba rechaza ítems duplicados (guard + reintento) (#3)

**Files:**
- Modify: `packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.ts` (import + guard tras la guardia de fuga)
- Test: `packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.test.ts`

**Interfaces:**
- Consumes: `itemsDuplicados` de `@faro/domain` (Task C1); `GeneracionError`.

- [ ] **Step 1: Write the failing test**

Añade este `it` dentro del `describe` de `GenerarPruebaFormativaUseCase.test.ts`:

```ts
it('rechaza (GeneracionError) una prueba con dos ítems de enunciado idéntico (#3)', async () => {
  const itm: Prueba['items'][number] = {
    oa: 'CN01 OA 01',
    habilidad: 'recordar',
    tipo: 'seleccion_multiple',
    enunciado: '¿Cuál de estos es un ser vivo?',
    alternativas: [
      { texto: 'Una roca', correcta: false },
      { texto: 'Un árbol', correcta: true },
    ],
    retroalimentacion: 'Observa cuál puede crecer.',
  };
  const pruebaDup: Prueba = {
    ...pruebaMuestra,
    tabla_especificaciones: [{ oa: 'CN01 OA 01', n_items: 2 }],
    items: [itm, { ...itm }],
  };
  const llm: LlmPort = {
    async generar(args) {
      return {
        parsed: args.schema.parse(pruebaDup),
        stopReason: 'end_turn',
        usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        modelo: 'm',
      };
    },
  };
  const uc = new GenerarPruebaFormativaUseCase(llm);
  await expect(uc.ejecutar(unidadMuestra('1º básico'))).rejects.toThrow(GeneracionError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.test.ts`
Expected: FAIL — sin la guardia, la prueba duplicada se acepta y no lanza.

- [ ] **Step 3: Write minimal implementation**

En `GenerarPruebaFormativaUseCase.ts`, añade `itemsDuplicados` al import de `@faro/domain` y la guardia justo después de la guardia de fuga (tras la línea 48):

```ts
import { fugaDeTextoEnPrueba, GeneracionError, itemsDuplicados, SchemaPrueba, tramoDeNivel } from '@faro/domain';
```

```ts
    const fuga = fugaDeTextoEnPrueba(valido);
    if (fuga !== null) {
      throw new GeneracionError(`fuga_texto:${fuga.campo}#${fuga.itemIndex}(${fuga.largo})`);
    }

    // Anti-duplicados: la IA a veces repite el mismo enunciado en dos ítems (sólo cambia la imagen).
    // Un duplicado es contenido inválido → rechazo + reintento (INV-2), igual que la fuga.
    const dup = itemsDuplicados(valido.items);
    if (dup !== null) {
      throw new GeneracionError(`items_duplicados:#${dup.itemIndex}`);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.test.ts`
Expected: PASS (los tests existentes siguen verdes: `pruebaMuestra` tiene 6 enunciados distintos → sin falso positivo).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.ts packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.test.ts
git commit -m "fix(prueba): rechaza items con enunciado duplicado (#3)"
```

---

### Task C3: El tramo de edad llega al prompt de la prueba (`entradaPrueba`) (#4)

`entradaPrueba` no pasaba el tramo, así que `INSTR_PRUEBA` no podía calibrar (a diferencia de `entradaDeckInfantil`, que sí pasa el tramo). Le añadimos el parámetro `tramo` y el use case lo provee.

**Files:**
- Modify: `packages/application/src/aula/cascada/generacion.ts` (`entradaPrueba`)
- Modify: `packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.ts:26` (pasar el tramo)
- Test: `packages/application/src/aula/cascada/generacion.test.ts`

**Interfaces:**
- Produces: `entradaPrueba(unidad: PlanificacionUnidad, tramo: '1-2' | '3-4' | '5-6'): string` — el string incluye una línea `Tramo de edad: <tramo> básico`.

- [ ] **Step 1: Write the failing test**

Añade a `generacion.test.ts` (nuevo import + bloque; el cast minimal evita un fixture completo — `entradaPrueba` sólo hace `JSON.stringify(unidad)`):

```ts
import { entradaPrueba } from './generacion.js';
import type { PlanificacionUnidad } from '@faro/domain';

const unidadMin = { unidad: 'U1', asignatura: 'Matemática', nivel: '1º básico', oa: [] } as unknown as PlanificacionUnidad;

describe('entradaPrueba', () => {
  it('incluye el tramo de edad para calibrar el prompt (#4)', () => {
    const s = entradaPrueba(unidadMin, '1-2');
    expect(s).toContain('Tramo de edad: 1-2 básico');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts`
Expected: FAIL — error de tipos: `entradaPrueba` aún acepta 1 argumento (la llamada con 2 no compila / el string no contiene la línea).

- [ ] **Step 3: Write minimal implementation**

En `generacion.ts` reemplaza `entradaPrueba`:

```ts
export function entradaPrueba(unidad: PlanificacionUnidad, tramo: '1-2' | '3-4' | '5-6'): string {
  return [
    `Tramo de edad: ${tramo} básico`,
    `Planificación de unidad (JSON):\n${JSON.stringify(unidad)}`,
    '',
    'Genera una evaluación formativa que evalúe los OA basales de la unidad, calibrada a ese tramo de edad.',
  ].join('\n');
}
```

En `GenerarPruebaFormativaUseCase.ts`, línea 26, pasa el tramo (`tramoDeNivel` ya está importado):

```ts
      entradaUsuario: entradaPrueba(unidad, tramoDeNivel(unidad.nivel)),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.test.ts`
Expected: PASS (el doble de `LlmPort` despacha por identidad del schema, no por `entradaUsuario`, así que la prueba use-case sigue verde).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/generacion.ts packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.ts packages/application/src/aula/cascada/generacion.test.ts
git commit -m "feat(prueba): pasa el tramo de edad al prompt (calibracion #4)"
```

---

### Task C4: Reglas por tramo + unicidad en `INSTR_PRUEBA` (#3, #4)

**Files:**
- Modify: `packages/application/src/aula/cascada/generacion.ts` (`INSTR_PRUEBA`)
- Test: `packages/application/src/aula/cascada/generacion.test.ts`

**Interfaces:**
- Produces: `INSTR_PRUEBA: BloqueSistema` cuyo `.texto` contiene la regla de unicidad y las reglas del tramo 1-2.

- [ ] **Step 1: Write the failing test**

Añade a `generacion.test.ts` (nuevo import + bloque):

```ts
import { INSTR_PRUEBA } from './generacion.js';

describe('INSTR_PRUEBA', () => {
  it('exige unicidad de enunciados (#3)', () => {
    expect(INSTR_PRUEBA.texto).toContain('no repitas el mismo enunciado');
  });
  it('da reglas para el tramo 1-2 pre-lectores (#4)', () => {
    expect(INSTR_PRUEBA.texto).toContain('MÁXIMO 2 alternativas');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts`
Expected: FAIL — las cláusulas no existen aún.

- [ ] **Step 3: Write minimal implementation**

En `generacion.ts` reemplaza `INSTR_PRUEBA` completo: añade el bullet de unicidad y reemplaza la línea débil de tramo 1-2 por el bloque calibrado:

```ts
export const INSTR_PRUEBA = instruccion(
  [
    'Genera una evaluación FORMATIVA (para aprender, no para calificar) anclada a los OA de la unidad.',
    "- 'tipo_evaluacion': 'formativa' (úsala salvo que se pida 'diagnostica').",
    "- 'tabla_especificaciones': una fila por OA evaluado (n_items; el puntaje es opcional en formativa).",
    '- Cada ítem tributa a un OA de la unidad; selección múltiple y verdadero/falso con EXACTAMENTE una alternativa correcta.',
    "- Puedes usar tipos variados apropiados al nivel: 'seleccion_multiple', 'verdadero_falso', 'completacion', 'desarrollo', 'ordenar' (con 'secuencia_correcta'), 'terminos_pareados' (con 'pares' columnaA↔columnaB) y 'pictorico' (con 'imagen' = una DESCRIPCIÓN BREVE, 1 frase, del apoyo visual; nunca una imagen real).",
    "- Cada campo de texto contiene SOLO el contenido del ítem para el estudiante: NUNCA escribas notas para ti, razonamiento, ni instrucciones de formato dentro de un campo (sobre todo en 'imagen').",
    '- Cada ítem evalúa algo DISTINTO: no repitas el mismo enunciado en dos ítems (ni la misma pregunta cambiando sólo la imagen).',
    "- El corazón formativo: cada ítem lleva 'retroalimentacion' = qué orientar al estudiante si falla.",
    "- 'perfil_nivel' según el tramo de edad ('1-2' para 1º–2º básico, '3-4', '5-6', o 'generico').",
    '- Calibración por TRAMO DE EDAD (viene en la entrada del usuario):',
    '  · Tramo 1-2 (pre-lectores): enunciados MUY breves, pensados para que el/la docente los lea en voz alta; en selección múltiple usa MÁXIMO 2 alternativas; NO uses verdadero/falso con secuencias largas de números; NO uses "ordenar" con más de 3 elementos.',
    '  · Tramos 3-4 y 5-6: enunciados para lectores autónomos, con complejidad creciente según el tramo.',
    "- El puntaje es opcional: si lo incluyes en un ítem, inclúyelo también en su fila de la tabla y haz que cuadren.",
  ].join('\n'),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/generacion.ts packages/application/src/aula/cascada/generacion.test.ts
git commit -m "feat(prueba): reglas por tramo + unicidad en INSTR_PRUEBA (#3, #4)"
```

---

### Task D1: Sub-partes con letras en `INSTR_GUIA` (pulido)

En el smoke, el ítem 5 de la guía reiniciaba la numeración interna a "1, 2, 3". Instruimos a usar letras para las sub-partes.

**Files:**
- Modify: `packages/application/src/aula/cascada/generacion.ts` (`INSTR_GUIA`)
- Test: `packages/application/src/aula/cascada/generacion.test.ts`

**Interfaces:**
- Produces: `INSTR_GUIA: BloqueSistema` con la regla de sub-partes en su `.texto`.

- [ ] **Step 1: Write the failing test**

Añade a `generacion.test.ts`:

```ts
import { INSTR_GUIA } from './generacion.js';

describe('INSTR_GUIA', () => {
  it('pide numerar sub-partes con letras para no reiniciar la numeración', () => {
    expect(INSTR_GUIA.texto).toContain('letras (a, b, c)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts`
Expected: FAIL — la regla no existe.

- [ ] **Step 3: Write minimal implementation**

En `generacion.ts`, añade un bullet al final del array de `INSTR_GUIA`:

```ts
    '- Si un ítem tiene varias partes, numéralas con letras (a, b, c) dentro del ítem; NO reinicies la numeración de los ítems.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/application/src/aula/cascada/generacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/aula/cascada/generacion.ts packages/application/src/aula/cascada/generacion.test.ts
git commit -m "fix(guia): sub-partes con letras para no reiniciar numeracion"
```

---

### Task Z: Verificación final del Plan 1

- [ ] **Step 1: Suite completa**

Run: `pnpm exec vitest run`
Expected: todo verde (sin regresiones).

- [ ] **Step 2: Typecheck + lint (scripts root)**

Run: `pnpm typecheck`
Expected: 0 errores.
Run: `pnpm lint`
Expected: 0 warnings/errores.

- [ ] **Step 3: Sin commit adicional** (los cambios ya se commitearon por task). Si typecheck/lint encuentran algo, arréglalo en un commit `fix:` acotado.

---

## Self-Review (cobertura del spec)

- **#1 (anclaje ficha/lámina):** Task A1 (ejercicios usan `dibujo.concepto`) + A2 (`descripcion_en` representa `concepto`). La coherencia ficha↔lámina y el compartir PNG ya los da el cache `(oa, concepto)` existente; no requiere cambio. ✓
- **#3 (dedup):** Task C1 (detector) + C2 (guard en el use case) + la regla de unicidad en C4. ✓
- **#4 (calibración pre-lectores):** Task C3 (tramo al prompt) + C4 (reglas por tramo). La regla "≥1 ítem pictórico con imagen real" se difiere al Plan 2 (depende de las imágenes reales). ✓ (parcial por diseño)
- **D (numeración guía):** Task D1. ✓
- **Fuera de este plan (van al Plan 2 `2026-06-25-remediacion-imagenes-ancladas.md`):** B (imágenes line-art en prueba/guía/PPT), #5 (objetos a contar + no revelar el conteo), #7 (`sugerencia_imagen` en notas).
- **Placeholder scan:** sin TBD/TODO; cada step trae el código real. **Type consistency:** `itemsDuplicados(...) => { itemIndex } | null` se usa idéntico en C1 y C2; `entradaPrueba(unidad, tramo)` idéntico en C3 y su llamada.
