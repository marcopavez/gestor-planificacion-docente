# ADR-001 — Estrategia de recuperación: RAG híbrido sobre grafo (GraphRAG legal) con verificación de citas

- **Estado:** Aceptado
- **Contexto:** Faro (copiloto de cumplimiento/documentación para colegios chilenos). Ver `solucion-educacion.md` y `plan-implementacion-faro.md`.
- **Decisión en una línea:** Implementar **RAG, pero robusto**: recuperación híbrida (vector + léxico) sobre un grafo normativo curado con vigencias, reranking, recuperación de documento padre, y un **gate de verificación de citas** obligatorio. No RAG ingenuo; no "solo contexto".

## Por qué (el problema)
Faro produce documentos regulados (auditoría de reglamento Decreto 67, borrador de PME, etc.). El estándar de corrección es **legal**: una cita equivocada o a una norma **derogada** es una falla grave, no un detalle de UX. El RAG ingenuo (chunking por ventanas fijas + solo vector + sin verificación) falla justo donde más duele. Por eso adoptamos RAG, pero con capas que neutralizan cada modo de falla.

## Decisión: arquitectura por capas

### A) Ingesta / indexación (offline — el foso)
1. **Chunking estructural por unidad legal** (ley → artículo → inciso → letra). Nada de ventanas fijas de N tokens. Cada chunk es una **unidad citable** con su `referencia` canónica (p.ej. *"Decreto 67/2018 art. 18 lit. f"*).
2. **Metadatos por chunk:** `norma_id`, tipo, jerarquía (ley > decreto > resolución), `vigencia_desde`/`vigencia_hasta`, estado (vigente/derogado/modificado), relaciones.
3. **Doble índice:** embeddings (**pgvector**) **+ full-text/BM25** (`tsvector` en Postgres). Razón: las consultas legales tienen términos/números exactos ("Decreto 67", "85% de asistencia") que el vector puede perder y el léxico captura.
4. **Resúmenes por norma** para *parent-document retrieval*.
5. **Embeddings:** Voyage AI (`voyage-law-2`, dominio legal) `[VERIFICAR: modelo/pricing]`.

### B) Recuperación (online)
- **Paso 0 — Pre-filtro de metadatos:** solo vigentes (`vigencia_hasta IS NULL OR > hoy`), por dependencia/tipo. → elimina "artículo derogado".
- **Paso 1 — Híbrida:** vector + BM25 en paralelo → fusión con **Reciprocal Rank Fusion (RRF)**. → elimina recall por términos exactos.
- **Paso 2 — Expansión por grafo (GraphRAG):** desde nodos semilla, traer (a) la **versión vigente** si el semilla fue modificado/derogado, (b) dependencias (`requiere`, `consolida_en_pme`). → habilita multi-hop y mata "trajo la versión vieja".
- **Paso 3 — Reranking:** cross-encoder o pase barato de **Haiku** que reordena por relevancia real → top-k preciso. → elimina ruido del top-k.
- **Paso 4 — Parent-document:** devolver el artículo/norma completa, no solo el chunk.

### C) Generación
- Contexto recuperado **+ (para el núcleo acotado) subset curado completo**, ambos en `system` con **prompt caching** (`cache_control: {ephemeral}`; prefijo estable primero, datos del colegio al final). Lecturas ~0.1×.
- **Salidas estructuradas** (Zod) con **citas obligatorias por afirmación**.
- **Routing** de modelos (Haiku/Sonnet/Opus) + adaptive thinking.

### D) Verificación de citas (gate de robustez — NO negociable)
Cada cita del output debe: (a) **existir** en el corpus, (b) estar **vigente**, (c) **respaldar** la afirmación.
- (a) y (b): chequeo **determinista** contra la DB.
- (c): **verificador LLM barato** (Haiku) que confirma que la norma citada respalda la afirmación.
- Si falla cualquiera → el documento se **marca/bloquea**, nunca pasa a `aprobado`. → mata la alucinación de citas.

### E) Evals (para poder *afirmar* que es robusto)
- **Recuperación:** `recall@k` (¿trajimos el artículo correcto?), `precision@k`, MRR, sobre un golden set etiquetado.
- **End-to-end:** exactitud de citas, corrección de vigencia, cobertura de ítems Decreto 67.
- **Gate en CI:** si `recall@k` o exactitud de citas cae bajo umbral, **falla el build**.

### F) Robustez adicional (dado que priorizamos robustez sobre velocidad)
- **Belt-and-suspenders para el núcleo:** como el subset acotado cabe en contexto, correr también *full-context cacheado* como red de seguridad / verificación cruzada contra lo recuperado.
- **Versionado del corpus:** al cambiar una norma, re-indexar y propagar vigencias por el grafo.
- **Observabilidad de recuperación:** registrar qué se recuperó por documento (auditable, alimenta `traza_ia`).

## Modo de falla → capa que lo elimina
| Modo de falla del RAG ingenuo | Capa que lo neutraliza |
|---|---|
| Recupera artículo derogado | Pre-filtro de vigencia (B0) + grafo (B2) |
| Pierde términos/números exactos | Híbrida vector+BM25 (B1) |
| No razona relaciones / multi-hop | Expansión por grafo (B2) |
| Ruido en top-k | Reranking (B3) |
| Contexto partido / cita imprecisa | Chunking estructural (A1) + parent-document (B4) |
| Alucina citas | Gate de verificación (D) |
| "No sabemos si es robusto" | Evals con recall@k + gate en CI (E) |

## Cuándo NO recuperar (usar solo contexto cacheado)
Para flujos del **núcleo acotado** cuyo corpus relevante cabe holgado en contexto, el full-context cacheado puede ir como camino primario (cero riesgo de recall) y la recuperación como complemento/expansión. Regla: **recuperación se vuelve obligatoria cuando el corpus deja de caber o crece la cola larga** (chat sobre toda la normativa MINEDUC, expansión).

## Consecuencias
- **Positivas:** corrección de nivel legal, defensibilidad (el grafo+vigencias+grounding es el foso), auditabilidad (Art. 8 bis [E15]), y métricas que respaldan el pitch.
- **Costos:** más trabajo de ingesta y de evals; latencia extra por rerank+verificación (mitigable con Haiku y caching). Aceptado: priorizamos robustez.
- **Dependencias nuevas:** Voyage (embeddings), `tsvector`/BM25, reranker.

## Alternativas descartadas
- **RAG ingenuo (ventanas fijas + solo vector + sin verificación):** rápido pero falla en vigencia, términos exactos y alucinación de citas. Inaceptable para compliance.
- **Solo contexto (sin recuperación):** viable para el núcleo acotado, pero no escala a toda la normativa MINEDUC; lo usamos como red de seguridad, no como única estrategia.
