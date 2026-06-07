# Fase 4 — Prueba formativa evaluable apta para niños, desde la planificación

> **Spec de desarrollo v2 · STUB** — esqueleto a la espera de las **referencias de estilo** que aportará el dueño (README §6 #3). No construir hasta tener referencias.
> **Deriva de:** [`02-planificacion.md`](./02-planificacion.md) (consume la planificación); decisión del dueño (2026-06-07): una **prueba formativa (NO sumativa), evaluable, apta para niños**.
> **Reusa:** schema `Prueba` (`packages/domain/src/schemas/prueba.ts`) ya construido — se **reorienta** a formativa + infantil (se descarta el framing Decreto 67 de v1).

---

## 1. Contexto y objetivo
Desde una **planificación** (sus OA + indicadores), generar una **prueba formativa evaluable** apta para básica (6–12 años): ítems claros, con apoyo visual, que el docente usa para **retroalimentar** (formativa), no para calificar (sumativa).

## 2. Decisiones confirmadas
- **Tipo:** **formativa**, no sumativa (sin ponderaciones/calificación; foco en evidencia de aprendizaje y retroalimentación).
- **Audiencia:** niños 6–12 años → enunciados simples, ítems pictóricos/lúdicos, pocas alternativas.
- **Evaluable:** cada ítem tiene respuesta/criterio correcto para que el docente pueda corregir.
- **Entrada:** la planificación de Fase 2 (OA + indicadores `ia_borrador`).
- **Salida:** `.docx` + `.pdf` (reusa `ExportPort` de Fase 2). `[VERIFICAR]` si también se quiere una versión interactiva.
- **Sin Decreto 67:** se elimina el requisito de "≥16 ítems / reglamento de evaluación" de v1 (era normativa, fuera de alcance).

## 3. Pendiente de referencias del dueño (bloquea la spec completa)
Para completar §3–§9 se necesitan ejemplos de:
1. **Prueba(s) de referencia** que el dueño quiera imitar: tipos de ítem (selección con imágenes, unir, completar, marcar, dibujar), cantidad típica, formato de hoja, por nivel.
2. ¿La prueba cubre **un OA**, **una clase** o **la unidad**?
3. ¿Incluye **pauta de corrección / rúbrica** para el docente? (probable sí, al ser "evaluable").

## 4. Esbozo técnico (provisional)
- `GenerarPruebaFormativaUseCase` (application) sobre `PlanificacionUnidad` → `Prueba` (schema existente, reorientado: `tipo: 'formativa'`, `perfil_nivel` infantil, ítems con apoyo visual).
- Construcción desde los **indicadores** (puente OA→ítem): un ítem tributa a un indicador.
- Export `.docx`/`.pdf` (reusa `ExportPort`); pauta de corrección como sección.
- Nace `borrador` + `traza_ia`; HIL; validaciones deterministas (ítem→OA/indicador existe; una sola alternativa correcta). INV-1…6 aplican.

## 5. Riesgos / abiertas
- **#3 referencias** — bloquea. Sin ellas, el formato de ítems es invención.
- Ítems pictóricos para 1º–2º (aún sin lectura fluida): requieren imágenes — mismo dilema de assets que Fase 3.
- Reuso del schema `Prueba`: revisar qué campos de v1 (ponderación/Decreto 67) se retiran al ser formativa.
