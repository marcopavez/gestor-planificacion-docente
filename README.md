# gestor-planificacion-docente · "Faro"

Copiloto de **cumplimiento y documentación pedagógica** para colegios chilenos (K-12). Convierte la normativa MINEDUC y el currículum nacional en documentos regulados **listos para revisar** (pruebas, clases, PME, informes Decreto 67/83), con citas a la norma vigente y **revisión humana obligatoria**.

> Estado: **pre-construcción**. Documentación de producto y arquitectura madura; código aún no iniciado.

## El foso (no es un wrapper)
No es el LLM. Son **dos knowledge graphs curados** (normativa MINEDUC con vigencias + currículum nacional / OA), la **integración con instrumentos oficiales** (PME, SIGE, reglamento de evaluación) y la **lógica de workflow regulado** — expresados como *invariantes de arquitectura testeables*.

## Módulos (land → expand)
- **M0 Aula** — pruebas + clases alineadas a OA y Decreto 67 (uso diario, SEP-elegible).
- **M3 Normativo** — asistente con citas + auditoría del reglamento de evaluación.
- **M1 PME** — borrador del PME y los 6 planes (comprador SLEP/sostenedor).
- **M2 NEE** — PACI (Decreto 83) e informes per-alumno (Decreto 67).

## Por dónde empezar
1. Lee **`CLAUDE.md`** (mapa del proyecto y convenciones).
2. Visión de producto/negocio → **`docs/solucion-educacion.md`**.
3. Arquitectura técnica maestra → **`docs/arquitectura-faro.md`**.
4. Plan de construcción → **`docs/plan-implementacion-faro.md`** + ADRs.

## Stack (previsto)
Monorepo pnpm · Next.js + TypeScript `strict` · Postgres + pgvector · Drizzle · SDK Anthropic (Opus/Sonnet/Haiku) · Zod · Vitest. Generación asíncrona vía cola + worker.

## Cumplimiento
Encargado de tratamiento (Ley 21.719) · human-in-the-loop (Art. 8 bis) · privacy-by-design para datos de menores · posicionamiento SEP-elegible.
