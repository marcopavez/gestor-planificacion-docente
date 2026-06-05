# ADR-002 — Monorepo pnpm con dominio puro (ports & adapters)

- **Estado:** Aceptado (2026-06-05)
- **Contexto:** Faro (ver `arquitectura-faro.md`). El plan original (`plan-implementacion-faro.md` §0) asumía "app única modular".
- **Decisión:** Monorepo pnpm con paquetes: `domain` (TS puro, sin frameworks ni I/O), `application` (use cases), `infra-*` (adapters: Drizzle, Anthropic, Voyage, reranker, export, OCR), `apps/web` (Next.js), `apps/worker` (cola), `apps/ingest` (CLI). **Regla de dependencia:** los `import` apuntan siempre al dominio; `infra`/`apps` dependen de `application`/`domain`, nunca al revés. Se enforza con ESLint boundaries + fronteras físicas de paquete.
- **Por qué:** el dominio regulado (vigencias, validez de citas, ítem→OA, una-sola-correcta) debe compilar y testearse **sin Next.js**, de forma determinista; las integraciones externas (Voyage, reranker, OCR, export) deben ser reemplazables; permite escalar a worker de ingesta + multi-tenant sin refactor doloroso.
- **Consecuencias:** (+) testabilidad, aislamiento, escala; (−) más setup inicial (workspaces, lint de boundaries). Aceptado.
- **Alternativas descartadas:** app única Next.js modular — acopla el dominio al framework y obliga a un refactor costoso al escalar.
- **Relación:** habilita los gates testeables del ADR-001.
