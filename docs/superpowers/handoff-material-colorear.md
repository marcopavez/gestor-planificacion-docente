# Handoff — implementar "Material para colorear" (Plan 1 + Plan 2)

> Pega el bloque de abajo como primer mensaje en una sesión nueva de Claude Code, en este repo.

---

Trabajas en el repo **Faro** (`gestor-planificacion-docente`): generador de planificaciones docentes para básica chilena. Monorepo hexagonal (pnpm + TypeScript strict + NodeNext + Vitest), Ports & Adapters. Lee `CLAUDE.md` y `specs/README.md` para el contexto v2 antes de actuar.

**TAREA:** implementar la feature **"Material para colorear"** (láminas y fichas line-art B&N para imprimir y pintar, ligadas al OA, para 1º–3º básico), en **dos planes secuenciales**. El diseño ya está aprobado y formalizado.

**LEE PRIMERO — es la fuente de verdad con TODAS las decisiones:**
`docs/superpowers/specs/2026-06-22-material-colorear-design.md`

**PROCESO (usa las superpowers skills, no improvises el flujo):**
1. **Plan 1** (fundación + lámina pura — §7 del spec): invoca `superpowers:writing-plans` para producir el plan TDD, luego `superpowers:subagent-driven-development` (o `executing-plans`) para ejecutarlo tarea por tarea, con review entre tareas y un review de rama al final. Cierra con `superpowers:finishing-a-development-branch`.
2. Cuando el Plan 1 esté verde y revisado, **repite para el Plan 2** (ficha educativa: ejercicios del motor de guías + dibujo).

**DECISIONES CLAVE (del spec — no las re-derives):**
- **Patrón híbrido:** Claude propone la *descripción* del dibujo anclada al OA (texto); **Google Imagen 4 Fast** la convierte en line-art B&N. Detrás de un `ImageGenPort` **reemplazable** (INV-6).
- **Cache por (OA/concepto):** el dibujo se genera una vez y se reusa; **integra con el banco de imágenes ya existente** (`packages/domain/src/imagenes/catalogo.ts` + `resolver.ts`; assets en `packages/infra-export/assets/imagenes/`). Extiende `EntradaImagen` con `fuente:'imagen-ia'`, `tipo:'linea_bn'`.
- **Tramo 1º–3º** (grado ≤ 3) para el material colorear. **Desde 4º:** pruebas/fichas SIN imagen; el **PPT conserva sus íconos a color (banco Noto) en TODOS los tramos — NO lo toques.**
- **Legal (no negociable):** dibujos **originales generados**; el prompt NUNCA pide personajes con copyright/marca (nada de Disney/Frozen); NUNCA scrapear coloring pages de internet.

**RESTRICCIONES (DoD del proyecto):**
- Sin `any`/`console.log`; `pnpm typecheck` + `pnpm test` verdes; lint limpio; todo artefacto de IA nace **`borrador`** (HIL: el docente revisa/regenera el dibujo).
- **Gotcha de tests:** corre `pnpm exec vitest run <path-desde-la-raíz>` (NO `pnpm --filter X exec vitest run src/...` → da "No test files found"; el root de vitest es el monorepo).
- **`vitest` no type-checea estricto** → usa `pnpm --filter <pkg> exec tsc --build` para pillar errores de tipo (p.ej. `noUncheckedIndexedAccess`).
- El adapter de Imagen necesita una API key (`GEMINI_API_KEY` o la var del proveedor). **Sin key → degrada a placeholder, no rompe.** Verifica el endpoint/SDK exacto de Imagen 4 Fast contra la doc vigente del proveedor (NO de memoria). Para IDs/precios de **Claude**, consulta la skill `claude-api`.

**CONTEXTO ÚTIL (reusa, no reinventes):**
- El banco de imágenes (íconos color para el PPT) ya está construido: catálogo + resolución determinista (dominio puro) + `PptxExportAdapter` que inserta imágenes con **fallback** + `existsSync`. Sigue ese mismo patrón (catálogo/puerto/adapter/cache) para el banco generado.
- El motor de guías/prueba (`GenerarGuiaUseCase` / `GenerarPruebaFormativaUseCase` en `packages/application/src/aula/cascada/`) genera los ejercicios anclados al OA — reúsalo para las fichas del Plan 2.
- Patrón de export: `planoGuia.ts` / `planoPrueba.ts` (`packages/infra-export/src/docx/`).

---
