# ADR-004 — Corpus versionado (`corpus_version`) como entidad de primera clase

- **Estado:** Aceptado (2026-06-05)
- **Contexto:** Faro (ver `arquitectura-faro.md`, `adr-001-recuperacion-rag.md`). La corrección es de nivel legal: hay que poder reproducir qué vio cada generación.
- **Decisión:** introducir `corpus_version` (publicable; inmutable al publicar). Cada `traza_ia` referencia la **`corpus_version` exacta** que vio la generación. Re-indexar el corpus produce una **nueva versión**.
- **Por qué:** **defensibilidad legal** (reproducir qué normas/OA y qué vigencias vio una generación), **rollback** ante un error de ingesta, y **auditabilidad** — más allá de `vigencia_desde/hasta` por norma.
- **Consecuencias:** (+) trazabilidad reproducible, rollback; (−) gestión de versiones e índices por versión. Aceptado.
- **Relación:** complementa el pre-filtro de vigencia y el gate de citas del ADR-001.
