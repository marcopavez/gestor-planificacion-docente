# Fase 3 — PPT infantil interactivo desde la planificación (6–12 años)

> **Spec de desarrollo v2 · STUB** — esqueleto a la espera de las **referencias de estilo** que aportará el dueño (README §6 #3). No construir hasta tener referencias.
> **Deriva de:** [`02-planificacion.md`](./02-planificacion.md) (consume la planificación); decisión del dueño (2026-06-07): PPT **colorido e interactivo, ideal para niños de 6–7 a 12 años**.
> **Reusa:** `PptxExportAdapter` (`packages/infra-export`) ya construido (deck `.pptx`).

---

## 1. Contexto y objetivo
Desde una **planificación aprobada** (o desde sus OA + experiencias), generar un **PPT** (`.pptx`) **colorido e interactivo** apto para básica (6–12 años): para que el docente lo proyecte en clases. Reorienta el deck existente (hoy neutro) a **público infantil**.

## 2. Decisiones confirmadas
- **Audiencia:** niños 6–12 años → lenguaje simple, mucho apoyo visual, interacción (preguntas, "¿qué sigue?", arrastrar/elegir, mini-juegos).
- **Entrada:** la planificación de Fase 2 (OA, experiencias/actividades, nivel/asignatura).
- **Salida:** `.pptx` (reusa `PptxExportAdapter`; ampliar a layout infantil/colorido).
- **Generación:** híbrida — estructura/secuencia desde la planificación; textos e ideas visuales por IA (`borrador`), revisados por el docente.

## 3. Pendiente de referencias del dueño (bloquea la spec completa)
Para completar §3–§9 se necesitan ejemplos de:
1. **PPT de referencia** (1–3) que el dueño quiera imitar: paleta, nivel de texto por slide, tipo de interacción, mascota/personajes, por nivel (1º vs 6º difieren mucho).
2. ¿El PPT cubre **una clase**, **un OA** o **la unidad completa**?
3. ¿Interacción **dentro de PowerPoint** (animaciones/hipervínculos/triggers) o basta colorido + preguntas en pantalla?

## 4. Esbozo técnico (provisional)
- `GenerarPptInfantilUseCase` (application) sobre `PlanificacionUnidad` → `ClaseDeck` (schema existente, a extender con estilo infantil: tema de color, íconos, slides de interacción).
- `PptxExportAdapter` extendido con **temas por nivel** (paleta, tipografía grande, ilustraciones).
- Nace `borrador` + `traza_ia`; HIL; INV-1…6 aplican.

## 5. Riesgos / abiertas
- **#3 referencias** — bloquea. Sin ellas, cualquier diseño es invención (contra la regla del dueño).
- Ilustraciones: ¿banco de imágenes propio, generación de imágenes, o íconos libres? `[VERIFICAR]`.
- Diferencias fuertes de estilo entre 1º y 6º: probablemente **temas por tramo** (1º–2º / 3º–4º / 5º–6º).
