# Fase 2 — M0 Aula: cascada de generación (Unidad → Clase → Prueba + `.pptx`) con plantillas configurables

> **Spec de desarrollo** · Deriva de `docs/arquitectura-faro.md` §11 (Fase 2), `docs/solucion-educacion.md` §4 (M0 Aula), las guías MINEDUC en `docs/` (`guia-para-el-proceso-de-elaboracion-de-la-planificacion.pdf`, `orientaciones-para-la-comprension-del-curriculum.pdf`) y las **decisiones del dueño (sesión 2026-06-06)**.
> **Reencuadre:** esta spec **expande** la `02-aula.md` planificada en el índice (`specs/README.md`). El alcance pasó de "pruebas + clases" a la **cascada completa de la planificación docente chilena**: del OA al material de aula, generado por Faro como borradores citados y revisables.
> **Estado:** lista para revisión del dueño. Bloqueada para construir por datos abiertos (Programa de Estudio con indicadores; reglamento de evaluación real) — ver §9.
> **Lee primero:** [`README.md`](./README.md) (invariantes INV-1…INV-6, DoD global), [`00-cimientos.md`](./00-cimientos.md) y [`01-nucleo-rag.md`](./01-nucleo-rag.md) (la base que esta fase usa).

---

## 1. Contexto y objetivo

### 1.1 La cascada (workflow real del docente chileno)
El currículum nacional define una **cascada** de planificación, confirmada por las guías MINEDUC (ver memoria de dominio `chilean-curriculum-planning-framework`):

```
Bases Curriculares (OA)
   → Planificación Anual            (distribución de OA en el año; fuera del MVP)
   → Planificación de Unidad        ← Faro genera
   → Planificación de Clase         ← Faro genera (fija profundidad + momentos)
   → Material didáctico:  Prueba    ← Faro genera (desde la tabla de especificaciones)
                          .pptx     ← Faro genera (deck de la clase)
```

El **único piso fijo** es el OA (Bases Curriculares, obligatorio). Todo lo demás —formato de la planificación, indicadores, metodologías— **varía por establecimiento** (MINEDUC lo permite explícitamente si se cumple el OA). Por eso la plantilla de planificación es **configurable por colegio**, no fija.

### 1.2 Objetivo
Que un docente, partiendo de **OA seleccionados** (Matemática 1º básico) y de la **plantilla de su colegio**, obtenga la cascada completa como **documentos `borrador` citados, gateados y con `traza_ia`** — cada uno revisable y editable (HIL) — sobre la arquitectura hexagonal + worker asíncrono ya establecida en Fase 0/1. El valor: devolverle horas al docente generando el papeleo regulado alineado a OA + Decreto 67.

### 1.3 Decisiones confirmadas por el dueño (sesión 2026-06-06)
- **Cadena del primer slice:** `OA → Planificación de Unidad → Planificación de Clase → { Prueba, .pptx }` (cascada completa).
- **Plantilla:** **esquema configurable + presets**. Se modela la plantilla como dato (secciones/campos), extensible/modificable por colegio; se siembran 2 presets reales de la *Escuela General José Alejandro Bernales D-114* (1º básico, rico mono-asignatura; 3º básico, liviano multi-asignatura).
- **Indicadores de evaluación:** se **cura el Programa de Estudio** oficial (Matemática 1º básico) y se incorpora al corpus como fuente citable. **No se generan ni inventan** indicadores oficiales `[VERIFICAR: el dueño aporta/indica el PDF del Programa de Estudio]`.
- **Asignatura/nivel objetivo:** Matemática 1º básico (corpus OA ya curado: `corpus/curriculum/matematica-1-basico.json`).
- **Faro genera la planificación** (no es solo un input); la planificación del docente puede además **subirse** como referencia en una iteración posterior (ver §2.2).

### 1.4 Precondiciones y enmiendas a fases anteriores
**Precondición:** Fase 0 (cimientos: monorepo, DB, dominio, `AnthropicLlmAdapter`, `HybridRetriever`, gates, worker, slice de prueba) y, para grounding semántico real, Fase 1 (ingesta + RAG). El slice de esta fase puede correr con `FakeEmbeddings` hasta tener Voyage (INV-6), igual que Fase 0.

**Enmiendas que esta fase introduce sobre el esquema de Fase 0** (migraciones aditivas, no rompen lo existente):
- `documento_generado.tipo` admite `planificacion_unidad` y `planificacion_clase` (ya admite `prueba`, `clase`).
- Nuevas tablas: `plantilla_planificacion`, `solicitud_generacion`; columna `documento_generado.origen_id` (self-ref, trazabilidad de la cascada).
- `objetivo_aprendizaje.indicadores` deja de estar vacío para Matemática 1º (se puebla desde el Programa de Estudio curado).
- Nuevo paquete `packages/infra-export` (`PptxExportAdapter`, `DocxExportAdapter`) — ya previsto en blueprint §4.

### 1.5 Épicas cubiertas
Épica **G** completa (generadores de Aula: pruebas + clases + export) **+** un **módulo de planificación** nuevo (no estaba en el plan de épicas; se documenta aquí como extensión de G).

---

## 2. Alcance

### 2.1 Entra
- **Motor de plantillas configurable** (`PlantillaPlanificacion`): definición data-driven de secciones/campos por colegio, con 2 presets reales sembrados (Bernales 1º y 3º). Selección y edición de plantilla; campos requeridos vs opcionales.
- **Generador de Planificación de Unidad** alineada a OA (basal/complementario/OAT), indicadores (Programa de Estudio), llenando la plantilla activa.
- **Generador de Planificación de Clase** (clase a clase: objetivo de la clase, inicio/desarrollo/cierre, recursos, evaluación formativa) derivada de la unidad.
- **Generador de Prueba** (extiende el slice de Fase 0) construida desde la **tabla de especificaciones** (indicadores), con **perfil por nivel** (1º básico: pictórica, lectura en voz alta, pocos ítems).
- **Generador de deck `.pptx`** de la clase (`PptxExportAdapter`), con estructura inicio/desarrollo/cierre y notas docentes.
- **Orquestación de la cascada** como cadena de jobs asíncronos (cada artefacto = `documento_generado(borrador)` + `traza_ia`), con estado consultable y resultados parciales.
- **Gates** deterministas: `planificacionGate` (cobertura OA, indicador↔OA, coherencia de horas/momentos), `pedagogicalGate` (extendido), `citationGate` (Decreto 67 + OA + indicadores).
- **Curación del Programa de Estudio** (Matemática 1º) → indicadores citables en el corpus (extiende el `apps/ingest` de Fase 1).
- **HIL:** flujo `borrador → en_revision → aprobado/rechazado` por documento; edición; regeneración aguas abajo cuando se edita un documento aguas arriba.
- **Export adicional:** Prueba/Planificación a `.docx` (reuso del `infra-export`).

### 2.2 NO entra (deferido)
| Deferido | A la fase / condición |
|---|---|
| **Variante NEE/DUA** de la prueba/planificación (Decreto 83) | Requiere texto de Decreto 83 `[VERIFICAR]`; siguiente iteración de Fase 2 |
| **Planificación Anual** (distribución de OA en el año) y **diagnóstica/nivelación** | Fase posterior (M0 ampliado) |
| **Subir-e-inferir** la plantilla desde un PDF/Word del colegio (OCR de tablas → estructura) | Fase posterior (necesita `OcrAdapter`, decisión #3) |
| **Adaptación visual** completa al estilo del colegio (logo, tipografías, layout fino del export) | v1 entrega estructura configurable; el *theming* visual es iteración posterior |
| Otras asignaturas/niveles (más allá de Matemática 1º) | Fase 1 cura el resto del currículum; esta spec se valida sobre Matemática 1º |
| Chat normativo M3, PME, auditoría de reglamento | Fases 3/4 |
| RLS, DPA, multi-tenant SLEP, dashboard de costos | Fase 5 |

---

## 3. Requisitos funcionales (RF-2.n)

> Cada RF es *testable*. Origen entre paréntesis.

**Motor de plantillas**
- **RF-2.1 · Definición de plantilla data-driven.** Existe `PlantillaPlanificacion` con una `definicion` (secciones → campos; cada campo con `clave`, `etiqueta`, `tipo`, `requerido`, `origen`, `orden`, `opciones?`). El dominio expone tipos TS puros para validarla. *(Decisión dueño; guía §6/§9)*
- **RF-2.2 · Presets reales sembrados.** El seed crea ≥2 plantillas: *Bernales 1º básico* (mono-asignatura, rica: Propósito, Habilidades Siglo XXI, Metodologías, OA basal/complementario/transversal, Experiencias, Tipo de aprendizaje, Indicadores, Instrumentos, Recursos) y *Bernales 3º básico* (multi-asignatura, liviana: OA priorizado, Habilidades, Experiencias, Evaluación). Reconstruidas de los PDF reales (`.scratch/plani-1b.txt`, `.scratch/plani-3b.txt`), **sin inventar**. *(Decisión dueño)*
- **RF-2.3 · Selección/edición de plantilla por establecimiento.** Un colegio puede activar un preset, clonarlo y modificar campos (agregar/quitar/renombrar/marcar requerido). La plantilla activa por `(establecimiento, tipo)` gobierna generación y export. *(Decisión dueño: extensible/modificable)*

**Esquemas y generación**
- **RF-2.4 · Esquema canónico + extras.** Existen los schemas Zod `PlanificacionUnidad` y `PlanificacionClase` con los **campos oficiales MINEDUC** (núcleo estable) más un mapa `extras` para los campos school-specific descritos por la plantilla. Los constraints numéricos/cobertura **no** van en el schema (van en gates, blueprint §3.1). *(Guía §9; blueprint §7.2)*
- **RF-2.5 · Generar Planificación de Unidad.** `GenerarPlanificacionUnidadUseCase` recupera contexto (OA + indicadores + Decreto 67 vigentes vía `HybridRetriever`) y genera una `PlanificacionUnidad` que **cumple la plantilla activa** (todos los campos `requerido` presentes) y **cubre los OA basales** seleccionados. *(Blueprint §11 Fase 2; guía §9)*
- **RF-2.6 · Generar Planificación de Clase.** `GenerarPlanificacionClaseUseCase` deriva, de la unidad, una secuencia de **clases** (objetivo de la clase, inicio/desarrollo/cierre, recursos, evaluación formativa, indicadores), respetando las **horas pedagógicas** de la unidad. *(Guía §6/§8: la clase fija la profundidad)*
- **RF-2.7 · Generar Prueba con perfil de nivel.** `GenerarPruebaUseCase` (extiende Fase 0) construye la `Prueba` desde la **tabla de especificaciones** (indicadores ↔ ítems) con un **`perfil_nivel`** que ajusta tipo/conteo de ítems. Para 1º básico: ítems pictóricos / de lectura en voz alta, conteo reducido `[VERIFICAR: rango exacto]`. **No** se fuerza "≥16 ítems" (esa norma del Decreto 67 rige el *reglamento*, no la prueba). *(Decreto 67 art. 18; guía §6; decisión dueño)*
- **RF-2.8 · Generar deck `.pptx`.** `GenerarClaseDeckUseCase` produce un `ClaseDeck` (slides por momento inicio/desarrollo/cierre, notas docentes, sugerencias de imagen) y el `PptxExportAdapter` lo exporta a `.pptx`. *(Blueprint §11 Fase 2; §4)*

**Cadena, gates, persistencia**
- **RF-2.9 · Cascada como cadena de jobs.** `POST` de cascada crea una `solicitud_generacion` + el `documento_generado(planificacion_unidad, borrador, encolado)` + su job. Al completar cada paso, el worker **encola el siguiente** (`unidad → clase → {prueba, deck}`), enlazando `documento_generado.origen_id`. *(ADR-003; blueprint §3.3)*
- **RF-2.10 · Resultados parciales y poll.** `GET` de la solicitud refleja el avance por documento (`encolado|generando|validado|fallido`) y entrega cada artefacto validado sin esperar a los demás. *(ADR-003)*
- **RF-2.11 · `planificacionGate` determinista.** Bloquea: campo `requerido` de la plantilla ausente; OA referenciado inexistente en el curso/asignatura/`corpus_version`; indicador que no tributa a un OA presente; OA **basal sin cobertura** (sin clase/indicador que lo aborde); suma de duraciones de clases incoherente con las horas de la unidad. Marca (no bloquea): calidad pedagógica de actividades, adecuación DUA (LLM, TODO). *(INV-1, INV-2; guía §9)*
- **RF-2.12 · `pedagogicalGate` (extendido).** Mantiene los chequeos de Fase 0 (ítem→OA existe; SM con exactamente una correcta; suma de puntajes ↔ tabla de especificaciones) y agrega: cada ítem tributa a un **indicador** existente. *(Fase 0 RF-0.14; guía §6)*
- **RF-2.13 · `citationGate` sobre la cascada.** Cada documento cita OA/indicadores/Decreto 67 **existentes + vigentes** en la `corpus_version`; bloquea citas inexistentes/derogadas. El "¿respalda?" (Haiku) queda advisory/TODO. *(Fase 0 RF-0.15; ADR-001 §D)*
- **RF-2.14 · Nace `borrador` + `traza_ia`.** Todo artefacto de la cascada nace `borrador` (INV-3, `CHECK chk_aprobado_requiere_humano`) y deja `traza_ia` con `corpus_version_id`, modelo, recuperado, citas, gates y `usage`. *(INV-3, INV-4)*
- **RF-2.15 · Reintento acotado.** Si los gates bloqueantes fallan, 1 reintento con hallazgos en el prompt; si vuelve a fallar, queda `borrador`/`fallido` con hallazgos visibles (nunca auto-aprueba). *(Fase 0 RF-0.19)*

**HIL, export, corpus**
- **RF-2.16 · Revisión humana (HIL).** Un documento `borrador` puede pasar a `en_revision`, editarse, y a `aprobado` (requiere `autor_humano`) o `rechazado`. Editar un documento aguas arriba ofrece **regenerar** los aguas abajo (marca los derivados como desactualizados). *(INV-3; Art. 8 bis)*
- **RF-2.17 · Export `.pptx`/`.docx`.** `ExportPort` con `PptxExportAdapter` (deck) y `DocxExportAdapter` (prueba/planificación), renderizando según la plantilla activa. El archivo se referencia desde `documento_generado.contenido`. *(Blueprint §4, §11 Fase 2; #5)*
- **RF-2.18 · Indicadores en el corpus.** El `apps/ingest` cura el Programa de Estudio (Matemática 1º) y puebla `objetivo_aprendizaje.indicadores` (citables) en una `corpus_version`. *(Decisión dueño; orientaciones §3: indicadores viven en Programas)*
- **RF-2.19 · Reglamento del colegio.** La generación de la prueba respeta `establecimiento.reglamento_evaluacion` (ponderaciones, tipos permitidos) cuando exista; si falta, usa defaults conservadores y lo marca. *(Decreto 67 art. 18; corpus/README pendiente)*
- **RF-2.20 · Catálogos oficiales.** Los catálogos usados por plantillas/gates (instrumentos de evaluación, momentos, tipo de aprendizaje conceptual/procedimental/actitudinal, dimensiones OAT) se modelan como **datos de referencia** citables a la guía MINEDUC, no hardcode disperso. *(Guía §4–6; orientaciones §2)*

---

## 4. Diseño técnico + contratos

### 4.1 Encaje arquitectónico
La cascada es **composición de use cases sobre los puertos existentes** (no nueva arquitectura). Reusa: `RetrievalPort`/`HybridRetriever`, `LlmPort`/`AnthropicLlmAdapter` (routing+caching+`parse()`), gates de `domain`, `job_generacion` + worker, `traza_ia`, `corpus_version`. Agrega: `ExportPort` (+adapters), `PlantillaRepository`, los 4 use cases y `planificacionGate`. **Regla de dependencia intacta** (INV-5).

### 4.2 Modelo de datos (DDL — enmiendas aditivas)
```sql
-- Plantilla de planificación configurable por colegio (definicion data-driven).
CREATE TABLE plantilla_planificacion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid REFERENCES establecimiento(id),   -- NULL = preset base (global)
  tipo               text NOT NULL,                         -- unidad | clase
  nombre             text NOT NULL,                         -- 'Bernales 1º básico — unidad'
  version            int  NOT NULL DEFAULT 1,
  estado             text NOT NULL DEFAULT 'activa',        -- activa | archivada
  definicion         jsonb NOT NULL,                        -- DefinicionPlantilla (§4.3)
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plantilla_activa ON plantilla_planificacion (establecimiento_id, tipo, estado);

-- Agrupa una cascada de generación (saga).
CREATE TABLE solicitud_generacion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL REFERENCES establecimiento(id),
  asignatura         text NOT NULL,
  curso              text NOT NULL,
  oa_ids             jsonb NOT NULL,                         -- OA seleccionados
  plantilla_unidad_id uuid REFERENCES plantilla_planificacion(id),
  plantilla_clase_id  uuid REFERENCES plantilla_planificacion(id),
  estado             text NOT NULL DEFAULT 'en_proceso',     -- en_proceso | completada | parcial | fallida
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Enmiendas a documento_generado (Fase 0):
ALTER TABLE documento_generado ADD COLUMN solicitud_id uuid REFERENCES solicitud_generacion(id);
ALTER TABLE documento_generado ADD COLUMN origen_id    uuid REFERENCES documento_generado(id); -- de qué deriva
-- tipo ahora admite: prueba | clase | planificacion_unidad | planificacion_clase (CHECK ampliado)
```
> Comentario de cumplimiento inline obligatorio donde se toquen datos del colegio: *"nivel curso/contenido, no individualizado por alumno"* (bajo riesgo Ley 21.719 en MVP).

### 4.3 Motor de plantillas (tipos TS — `packages/domain/src/plantillas`)
```ts
export type TipoCampo =
  | 'texto' | 'texto_largo' | 'lista_texto'
  | 'checkbox_multiple' | 'seleccion_unica'
  | 'ref_oa' | 'ref_indicador'
  | 'tabla_especificaciones' | 'momentos_clase' | 'tabla';

export type OrigenCampo = 'manual' | 'generado_ia' | 'derivado_oa' | 'catalogo';

export interface CampoPlantilla {
  readonly clave: string;            // 'proposito_unidad'
  readonly etiqueta: string;         // 'Propósito de la Unidad'
  readonly tipo: TipoCampo;
  readonly requerido: boolean;
  readonly origen: OrigenCampo;
  readonly orden: number;
  readonly opciones?: readonly string[];   // checkbox/seleccion/catalogo
  readonly ayuda?: string;
}
export interface SeccionPlantilla {
  readonly clave: string; readonly titulo: string; readonly orden: number;
  readonly campos: readonly CampoPlantilla[];
}
export interface DefinicionPlantilla {
  readonly tipo: 'unidad' | 'clase';
  readonly secciones: readonly SeccionPlantilla[];
}
// Validación pura (sin red, INV-1): un contenido cumple la plantilla si trae todos los
// campos `requerido` y los valores respetan el `tipo`/`opciones`.
export function cumplePlantilla(def: DefinicionPlantilla, contenido: unknown): ResultadoPlantilla;
```

### 4.4 Schemas de dominio (Zod — `domain/schemas`)
```ts
// schemas/planificacionUnidad.ts — núcleo oficial MINEDUC + extras school-specific.
export const OaReferenciado = z.object({
  codigo: z.string(),                                   // 'MA01 OA 03'
  categoria: z.enum(['basal', 'complementario', 'transversal']),
  descripcion: z.string(),
});
export const PlanificacionUnidad = z.object({
  asignatura: z.string(), nivel: z.string(), unidad: z.string(),
  proposito: z.string(),
  duracion_semanas: z.number(), horas_pedagogicas: z.number(),
  oa: z.array(OaReferenciado),
  habilidades: z.array(z.string()),
  indicadores_evaluacion: z.array(z.object({ oa: z.string(), texto: z.string() })),
  contenidos: z.object({ conceptuales: z.array(z.string()), procedimentales: z.array(z.string()), actitudinales: z.array(z.string()) }),
  actividades: z.array(z.string()),
  instrumentos_evaluacion: z.array(z.string()),
  tipo_evaluacion: z.array(z.enum(['diagnostica', 'formativa', 'sumativa'])),
  extras: z.record(z.string(), z.unknown()),            // campos definidos por la plantilla
});

// schemas/planificacionClase.ts
export const Clase = z.object({
  numero: z.number(),
  oa: z.array(z.string()),
  objetivo_clase: z.string(),
  inicio: z.string(), desarrollo: z.string(), cierre: z.string(),
  recursos: z.array(z.string()),
  evaluacion_formativa: z.string(),
  indicadores: z.array(z.string()),
  duracion_min: z.number(),
  extras: z.record(z.string(), z.unknown()),
});
export const PlanificacionClase = z.object({ unidad_ref: z.string(), clases: z.array(Clase) });

// schemas/claseDeck.ts (deck .pptx)
export const ClaseDeck = z.object({
  titulo: z.string(), oa: z.array(z.string()),
  slides: z.array(z.object({
    momento: z.enum(['inicio', 'desarrollo', 'cierre']),
    titulo: z.string(), contenido: z.array(z.string()),
    notas_docente: z.string(), sugerencia_imagen: z.string().optional(),
  })),
});

// schemas/prueba.ts (extiende Fase 0): + perfil de nivel
export const Prueba = PruebaFase0.extend({
  perfil_nivel: z.enum(['1B', '2B', '3B', 'generico']),  // ajusta tipo/conteo en pedagogicalGate
});
```
> `extras` y constraints (conteos, cobertura, ponderaciones) se validan en gates, no en el schema (el SDK no soporta `min/max`/recursión — blueprint §3.1, §7.2).

### 4.5 Puertos nuevos/extendidos (`domain/ports`)
```ts
// export.ts
export interface ArchivoExportado { readonly ruta: string; readonly mime: string; readonly bytes: number; }
export interface ExportPort {
  exportarPptx(deck: ClaseDeck, plantilla?: DefinicionPlantilla): Promise<ArchivoExportado>;
  exportarDocx(doc: unknown, plantilla: DefinicionPlantilla): Promise<ArchivoExportado>;
}
// repositories.ts (+)
export interface PlantillaRepository {
  activaPorTipo(establecimientoId: string, tipo: 'unidad' | 'clase'): Promise<PlantillaPlanificacion | null>;
  porId(id: string): Promise<PlantillaPlanificacion | null>;
  guardar(p: NuevaPlantilla): Promise<PlantillaPlanificacion>;
}
export interface SolicitudRepository {
  crear(input: NuevaSolicitud): Promise<Solicitud>;
  porId(id: string): Promise<SolicitudConDocumentos | null>;
}
```
`ExportPort` se implementa en `packages/infra-export` (`PptxExportAdapter` — librería `[VERIFICAR: pptxgenjs u otra]`; `DocxExportAdapter`). Almacenamiento: filesystem local en dev; object storage S3-compatible en prod `[VERIFICAR: proveedor, open Q #5]`.

### 4.6 Gates (`domain/gates`)
**`planificacionGate(plan, plantilla, oaDelCurso, indicadores)`** → `ResultadoGate`:

| Chequeo | Tipo | Acción |
|---|---|---|
| Campo `requerido` de la plantilla presente y bien tipado | Determinista | **Bloquea** |
| Cada OA referenciado existe en curso/asignatura/`corpus_version` | Determinista | **Bloquea** |
| Cada indicador tributa a un OA presente | Determinista | **Bloquea** |
| Cada **OA basal** cubierto por ≥1 clase/indicador | Determinista | **Bloquea** |
| Suma de `duracion_min` de clases ↔ horas pedagógicas de la unidad | Determinista | **Bloquea** |
| Momentos de evaluación requeridos presentes | Determinista | Marca |
| Calidad pedagógica de actividades / adecuación DUA | LLM | **TODO** (advisory) |

**`pedagogicalGate`** (Fase 0 + ítem→indicador) y **`citationGate`** (existe+vigente) como §3 RF-2.12/2.13.

### 4.7 Orquestación de la cascada (`application/aula` + worker)
```ts
// Pipeline declarativo: cada paso produce un documento_generado(borrador) y, al validar,
// encola el siguiente. El worker es el de Fase 0 (FOR UPDATE SKIP LOCKED), sin cambios de patrón.
const CASCADA = ['planificacion_unidad', 'planificacion_clase', 'prueba', 'clase_deck'] as const;
// unidad → clase → {prueba, deck}: prueba y deck derivan de la clase y pueden encolarse en paralelo.
// origen_id enlaza cada artefacto con su predecesor; solicitud_id agrupa la cascada.
```
- **HIL opcional entre pasos:** por defecto la cascada corre completa (todos `borrador`); si el dueño activa "revisar unidad antes de seguir", el paso siguiente espera a `aprobado` de la unidad `[VERIFICAR: por defecto correr completa]`.

### 4.8 Contratos de API (`apps/web/app/api`)
```
POST /api/aula/cascada
  body: { establecimientoId, asignatura, curso, oaIds[], plantillaUnidadId?, plantillaClaseId?, perfilNivel? }
  202 → { solicitudId, documentos: [{ id, tipo, estadoGeneracion }] }   // crea solicitud + unidad(encolado) + job

GET /api/aula/cascada/:solicitudId
  200 → { solicitudId, estado, documentos: [{ id, tipo, estadoGeneracion, estadoRevision, origenId }] }

GET /api/aula/documento/:id      → contenido + citas + hallazgos de gates (por artefacto)
POST /api/aula/documento/:id/revision  → { accion: 'aprobar'|'rechazar'|'editar', autorHumanoId, contenido? }
GET /api/aula/documento/:id/export?formato=pptx|docx  → archivo (o URL firmada)

GET  /api/plantillas?tipo=unidad|clase&establecimientoId=...
POST /api/plantillas             → clonar/editar definición (configurable por colegio)
```
> El `POST` **nunca** genera en el request (ADR-003): encola y responde 202. La UI hace *polling* (o SSE `[VERIFICAR]`).

### 4.9 Routing por paso (reusa `infra-ai/anthropic/router.ts`, RF-0.10)
| Paso | Tarea | Modelo (default) | Nota |
|---|---|---|---|
| Planificación de Unidad | `redaccion` | `claude-sonnet-4-6` | estructura rica; cachea corpus OA/indicadores |
| Planificación de Clase | `redaccion` | `claude-sonnet-4-6` | deriva de la unidad (en contexto) |
| Prueba | `redaccion` | `claude-sonnet-4-6` | desde tabla de especificaciones |
| Deck `.pptx` | `redaccion` | `claude-sonnet-4-6` | salida estructurada `ClaseDeck` |
| (casos ambiguos / normativo) | `razonamiento_normativo` | `claude-opus-4-8` | solo si escala |
> **Nota IA (CLAUDE.md §5):** antes de fijar IDs/precios/mínimos de caching, **consultar la skill `claude-api`**. Se reusan los valores ya verificados en `00-cimientos.md` §4.5 (mínimos 4096 Opus/Haiku, 2048 Sonnet; `effort:max` solo Opus; `parsed_output` puede ser `null`).

### 4.10 Ingesta del Programa de Estudio (indicadores) — extiende `apps/ingest` (Fase 1)
`faro ingest <programa-estudio> --familia oa-indicadores --etiqueta ...` cura los **indicadores de evaluación** por OA del Programa de Estudio (Matemática 1º) y los asocia a `objetivo_aprendizaje.indicadores`, citables. Chunking determinista, sin inventar (INV-1). `[VERIFICAR: PDF/fuente del Programa de Estudio que aporta el dueño]`.

---

## 5. Historias → tareas (commits)

> Un commit convencional por unidad. Cada historia hereda el DoD global.

- **H-2.1 · `feat(domain): motor de plantillas (tipos + cumplePlantilla)`** — tipos §4.3 + validación pura. → *CA-2.1*
- **H-2.2 · `feat(db): plantilla_planificacion + solicitud_generacion + enmiendas documento_generado`** — DDL §4.2 + migración up/down. → *CA-2.2*
- **H-2.3 · `feat(db): seed presets Bernales 1º y 3º`** — 2 plantillas reales reconstruidas de los PDF. → *CA-2.3*
- **H-2.4 · `feat(domain): schemas Zod PlanificacionUnidad/Clase/ClaseDeck + Prueba.perfil_nivel`** — §4.4. → *CA-2.4*
- **H-2.5 · `feat(ingest): indicadores desde Programa de Estudio (Matemática 1º)`** — §4.10. → *CA-2.5*
- **H-2.6 · `feat(domain): planificacionGate + pedagogicalGate extendido`** — §4.6. → *CA-2.6, CA-2.7*
- **H-2.7 · `feat(aula): GenerarPlanificacionUnidadUseCase`** — §4.7; cumple plantilla; cubre OA basales. → *CA-2.8*
- **H-2.8 · `feat(aula): GenerarPlanificacionClaseUseCase`** — deriva clases; coherencia de horas. → *CA-2.9*
- **H-2.9 · `feat(aula): GenerarPruebaUseCase (perfil 1º) + GenerarClaseDeckUseCase`** — desde tabla de especificaciones / clase. → *CA-2.10, CA-2.11*
- **H-2.10 · `feat(infra-export): PptxExportAdapter + DocxExportAdapter`** — `ExportPort`. → *CA-2.12*
- **H-2.11 · `feat(aula): orquestación de la cascada (solicitud + cadena de jobs)`** — §4.7; resultados parciales. → *CA-2.13, CA-2.14*
- **H-2.12 · `feat(web): API cascada + documento + revisión + export + plantillas`** — §4.8; composition root. → *CA-2.15, CA-2.16*
- **H-2.13 · `feat(web): editor revisable + flujo HIL borrador→aprobado`** — RF-2.16. → *CA-2.17*
- **H-2.14 · `test: gates + cascada e2e + alineación OA`** — unit gates; e2e cascada; eval alineación. → *CA-2.18, CA-2.19*
- **H-2.15 · `docs: runbook de la cascada + plantillas`** — cómo generar y configurar plantillas. → *CA-2.20*

---

## 6. Criterios de aceptación (CA-2.n)

- **CA-2.1** `cumplePlantilla` valida (sin red) que un contenido trae los campos `requerido` y respeta `tipo`/`opciones`; falla ante un requerido ausente.
- **CA-2.2** Migración up/down crea `plantilla_planificacion`, `solicitud_generacion` y las columnas nuevas; `documento_generado.tipo` admite los 4 tipos.
- **CA-2.3** El seed deja ≥2 presets con la estructura real de los PDF Bernales (1º rica, 3º liviana); ningún campo inventado fuera de lo observado/oficial.
- **CA-2.4** Los schemas `PlanificacionUnidad/Clase/ClaseDeck` validan ejemplos válidos/ inválidos; `Prueba.perfil_nivel` existe.
- **CA-2.5** Tras la ingesta, los OA de Matemática 1º tienen indicadores citables (no vacíos) en la `corpus_version`; cada indicador referencia su OA.
- **CA-2.6** `planificacionGate` **bloquea** una unidad con un OA inexistente, un indicador huérfano, un OA **basal sin cobertura**, o duraciones de clase incoherentes con las horas.
- **CA-2.7** `pedagogicalGate` bloquea ítem cuyo OA/indicador no existe, SM sin exactamente una correcta, o puntajes inconsistentes.
- **CA-2.8** `GenerarPlanificacionUnidadUseCase` produce una unidad que **cumple la plantilla activa** y cubre los OA basales seleccionados; nace `borrador` + `traza_ia(corpus_version)`.
- **CA-2.9** `GenerarPlanificacionClaseUseCase` genera clases cuya suma de `duracion_min` cuadra (±tolerancia) con las horas de la unidad; cada clase tributa a un OA de la unidad.
- **CA-2.10** La prueba con `perfil_nivel='1B'` respeta el perfil (tipos/conteo de ítems para 1º) y se construye desde la tabla de especificaciones (cada ítem ↔ indicador).
- **CA-2.11** El `ClaseDeck` tiene slides por momento (inicio/desarrollo/cierre) con notas docentes.
- **CA-2.12** `PptxExportAdapter` produce un `.pptx` abrible que refleja el deck; `DocxExportAdapter` exporta prueba/planificación.
- **CA-2.13** `POST /api/aula/cascada` responde `202 {solicitudId, documentos}` y **no** genera en el request; crea la solicitud + unidad(encolado) + job.
- **CA-2.14** El worker encadena `unidad → clase → {prueba, deck}` enlazando `origen_id`; `GET` muestra resultados **parciales** a medida que validan.
- **CA-2.15** `GET /api/aula/documento/:id` devuelve contenido + citas + hallazgos de gates por artefacto.
- **CA-2.16** `GET .../export?formato=pptx|docx` entrega el archivo del artefacto.
- **CA-2.17** Un `borrador` pasa a `aprobado` **solo** con `autor_humano` (CHECK); editar la unidad ofrece regenerar los derivados (marcados desactualizados).
- **CA-2.18** Tests verdes: unit de `planificacionGate`/`pedagogicalGate`/`cumplePlantilla`; e2e de la cascada (POST → worker → GET con los 4 artefactos `validado`/`borrador`).
- **CA-2.19** Eval de **alineación a OA ≥ 0.95** sobre un set etiquetado (ítems/actividades que tributan al OA/indicador declarado).
- **CA-2.20** Siguiendo el runbook, un tercero genera la cascada completa con el seed y configura/clona una plantilla.

### DoD de cierre de fase (blueprint §11 Fase 2)
El docente genera, edita, aprueba y descarga `.pptx`/`.docx` alineado a OA + Decreto 67; los gates bloquean artefactos inválidos antes de la revisión; cada artefacto nace `borrador` con `traza_ia`; `cache_read_input_tokens > 0` en 2ª llamada idéntica; CI verde.

---

## 7. Plan de pruebas + evals

| Nivel | Qué | Dónde | Sin red? |
|---|---|---|---|
| **Unit (dominio)** | `cumplePlantilla`; `planificacionGate` (cobertura OA, horas); `pedagogicalGate` (ítem→indicador); reglas de vigencia | `domain` | **Sí** (INV-1) |
| **Integration** | repos Drizzle (plantilla/solicitud); `HybridRetriever` con indicadores; ingesta del Programa de Estudio | `infra-db`, `apps/ingest` | DB local, sin LLM |
| **Eval** | alineación a OA/indicador ≥ 0.95 (parte determinista ítem↔indicador + juez Haiku); fidelidad de citas (existe+vigente) | `evals` | Corpus fijo; juez Haiku |
| **E2E** | cascada completa: POST → worker (4 pasos) → gates → traza → GET + export `.pptx` | `apps/web` + `apps/worker` + `infra-export` | Stack completo (LLM real o grabado) |

- **Vitest** en todos los niveles; fakes (`FakeEmbeddings`, `FakeLlm`, `FakeReranker`, `FakeExport`) para use cases sin red.
- `evals/thresholds.json`: agrega `alineacion_oa ≥ 0.95`; **CI falla** bajo umbral (con golden set del experto).

---

## 8. DoD + invariantes

**DoD:** §6 (CA-2.* + DoD de cierre) + DoD global del [`README.md`](./README.md) §4.

**Invariantes materializados:**
- **INV-1** — `cumplePlantilla`, `planificacionGate`, RRF, reglas de vigencia: puros, testeados sin red.
- **INV-2** — el LLM redacta borradores; los gates deterministas corren antes de cualquier cambio de estado; el juez LLM solo advierte.
- **INV-3** — todos los artefactos de la cascada nacen `borrador`; `CHECK chk_aprobado_requiere_humano` impide `aprobado` sin `autor_humano`.
- **INV-4** — cada artefacto referencia la `corpus_version` exacta en su `traza_ia`.
- **INV-5** — `infra-export`/`apps` dependen de `domain`/`application`; nunca al revés (lint de boundaries).
- **INV-6** — export (pptx/docx) y embeddings/reranker tras puertos; cambiarlos no toca la lógica de la cascada.

**Comentario de cumplimiento inline obligatorio** donde se toquen datos del colegio: *"nivel curso/contenido, no individualizado por alumno"*.

---

## 9. Riesgos y preguntas abiertas

**Bloqueantes para construir (datos — el dueño los aporta, no se inventan):**
- **Programa de Estudio (Matemática 1º básico)** → indicadores de evaluación oficiales (RF-2.18). `[VERIFICAR: PDF/fuente]`.
- **Reglamento de evaluación real** de un colegio (Decreto 67) → alinear la prueba (RF-2.19). `[VERIFICAR]`.
- **Priorización Curricular**: ¿sigue vigente en 2026? Define si "OA Priorizado/Basal" es norma nacional o énfasis del colegio. `[VERIFICAR]`.

**No bloqueantes (defaults propuestos; el dueño corrige):**
- **Perfil de prueba 1º básico** (pre-lectores): default pictórico / lectura en voz alta / pocos ítems, **no** "≥16 ítems". `[VERIFICAR: rango exacto y tipos]`.
- **Decreto 83 (DUA)** + **OAT** lista oficial → necesarios para la variante NEE/DUA (deferida). `[VERIFICAR]`.
- **`.pptx`**: librería del adapter (`pptxgenjs`?), estructura del deck, header/logo del colegio, sugerencias de imagen. `[VERIFICAR]`.
- **Object storage** para `.pptx`/`.docx` (open Q #5) y **"instantly"** (poll vs SSE). `[VERIFICAR]`.
- **HIL entre pasos**: ¿la cascada corre completa por defecto o pausa para aprobar la unidad? Default: corre completa. `[VERIFICAR]`.

**Riesgos y mitigación:**
| Riesgo | Mitigación |
|---|---|
| Plantillas demasiado variables → schema imposible | Núcleo canónico estable (oficial) + `extras` data-driven; gate valida contra la plantilla, no contra Zod rígido |
| Indicadores ausentes/erróneos | Curar del Programa de Estudio (citable); `corpus_version` permite corregir; gate bloquea indicador huérfano |
| Cascada lenta (4 LLM en serie) bloquea HTTP | Worker + cola; 202 + poll; pasos prueba/deck en paralelo tras la clase |
| Prueba de 1º básico inadecuada al nivel | `perfil_nivel` en `pedagogicalGate`; eval de alineación; HIL |
| Export `.pptx` frágil / proveedor de storage | `ExportPort` reemplazable (INV-6); filesystem en dev; storage prod `[VERIFICAR]` |
| `parsed_output: null` en cualquier paso | Manejo obligatorio → `GeneracionError`, job `fallido`, no persiste basura (RF-0.9) |

---

> **Antes de implementar:** el dueño revisa y aprueba esta spec; aporta el Programa de Estudio (indicadores) y el reglamento; confirma vigencia de Priorización Curricular. La construcción sigue el orden de §5 sobre los cimientos de Fase 0 (que pueden levantarse en paralelo). **No** hacer push a remoto sin confirmación.
