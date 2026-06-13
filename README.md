# gestor-planificacion-docente · "Faro" (v2)

**Generador de planificaciones docentes para educación básica chilena (1º–6º).** Dado **curso + asignatura + Objetivos de Aprendizaje (OA)**, produce la **planificación con el formato real del colegio** (`.docx`/`.pdf`) y, desde ella, un **PPT infantil** y una **prueba formativa** aptos para niños de 6–12 años. Generación **híbrida** (datos fijos del currículum + redacción de IA), todo nace **borrador** y lo revisa el docente (HIL).

> **Estado:** MVP **funcional de punta a punta** (Fases 0–4 construidas; el corpus cubre todas las asignaturas MINEDUC de básica). **Aún no es un producto vendible:** falta el piloto (Fase 5), validar la IA real a lo ancho del currículum, calibrar el tramo 5º–6º y las imágenes reales del PPT. Ver `specs/README.md` y `CLAUDE.md`.
>
> Hubo un pivote (2026-06-07): se **eliminó** la v1 normativa (RAG, Decreto 67/83 como motor, PME, PACI). Esa documentación queda en `docs/` marcada como *aparcada*.

## Probarlo en local — 3 comandos

**Una sola vez (setup):**

```bash
pnpm install
cp .env.example .env       # luego edita .env (ver abajo)
```

En `.env` deja al menos:

```ini
DATABASE_URL=postgresql://faro:faro@localhost:5544/faro   # coincide con docker-compose.yml (host 5544)
# Opcional pero recomendado — sin esto, la IA corre en modo "samples" (ver nota):
ANTHROPIC_API_KEY=sk-ant-...
```

**Cada vez (los 3 comandos):**

```bash
docker compose up -d   # 1. Postgres local
pnpm seed              # 2. migraciones + ingiere TODO el corpus de OA y publica la versión
pnpm dev               # 3. worker + web juntos (Ctrl+C para detener)
```

Abre **http://localhost:3000/aula/planificacion** → elige Formato (A/B) + asignatura/nivel/OA → **Generar** → revisa en HIL → botones **"Generar PPT infantil"** y **"Generar prueba formativa"**, cada uno con su descarga.

`pnpm seed` es idempotente (re-correrlo no duplica). `docker compose down` apaga la base; `docker compose down -v` además borra sus datos.

### Notas importantes

- **IA real vs. `samples`:** sin `ANTHROPIC_API_KEY` (ni `CLAUDE_CODE_OAUTH_TOKEN`), el worker genera con **contenido enlatado de UNA materia (Matemática 1º básico)** — útil para ver el flujo, pero solo fiel para esa materia. Con la key, genera cualquier materia ya ingerida.
- **`.pdf`** requiere **LibreOffice** (`soffice`) instalado; el `.docx`/`.pptx` no lo necesitan.
- Sin tocar nada de infraestructura, la verificación más rápida de que todo está cableado es la **suite de tests** (abajo).

## Verificación rápida (sin DB ni IA)

```bash
pnpm test        # genera .pptx/.docx reales y ejercita worker + colas (pglite en memoria)
pnpm typecheck
pnpm lint        # --max-warnings 0
```

## Arquitectura (resumen)

Monorepo **pnpm** · **Next.js** App Router + React + TypeScript `strict` · **Postgres + Drizzle** · SDK Anthropic / Claude Code · Zod · Vitest · generación **asíncrona** vía cola + worker. **Ports & Adapters (hexagonal):** el dominio (currículum/OA, plantillas, generación, validación) no depende de frameworks; LLM y export (`.docx`/`.pdf`/`.pptx`) son adapters reemplazables. **Sin pgvector / sin RAG en v2.**

- `apps/web` — UI (Next.js) y rutas API.
- `apps/worker` — consume la cola y genera (planificación, PPT infantil, prueba).
- `apps/ingest` — CLI que ingiere el corpus de OA a la base.
- `packages/{domain,application}` — dominio puro + casos de uso.
- `packages/infra-{db,corpus,export,ai}` — adapters (Drizzle, archivos de corpus, export, LLM).
- `corpus/` — OA por asignatura/nivel (manifiesto en `corpus/curriculum/_manifest.json`), catálogos y plantillas.

## Por dónde seguir

1. **`CLAUDE.md`** — mapa del proyecto y convenciones (fuente de verdad de la v2).
2. **`specs/README.md`** — plan de build por fases + invariantes + alcance.
3. **`docs/`** — visión v1 normativa (aparcada) y las plantillas reales de referencia.
