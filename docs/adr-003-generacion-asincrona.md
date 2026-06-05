# ADR-003 — Generación asíncrona vía worker/cola

- **Estado:** Aceptado (2026-06-05)
- **Contexto:** Faro (ver `arquitectura-faro.md`). La generación combina recuperación + rerank + verificación + thinking adaptivo → **~10–60 s**.
- **Decisión:** la generación corre en `apps/worker` consumiendo una **cola**; el endpoint HTTP **encola y responde 202 + id**; hay un `GET` de estado del job. Los documentos generados nacen en estado `borrador`.
- **Por qué:** correr generaciones largas dentro de un Route Handler de Next.js arriesga **timeouts** y mata la **observabilidad de costos**; la cola desacopla carga, permite **reintentos** e instrumentación de tokens por job.
- **Consecuencias:** (+) robustez, observabilidad, reintentos; (−) infraestructura de cola + worker + estado de jobs. Aceptado.
- **Excepción:** el **chat normativo (M3)** puede ser síncrono + streaming (respuestas cortas, UX conversacional).
- **Alternativas descartadas:** generación síncrona en el request HTTP (timeouts y mala UX en generaciones largas).
