// packages/application/src/aula/cascada/GenerarPptInfantilUseCase.ts
// Fase 3 (PPT infantil): genera un ClaseDeck INFANTIL desde una PlanificacionUnidad (salida de Fase 2).
// Híbrido: la ESTRUCTURA y el anclaje a OA salen de la planificación (datos fijos); la IA redacta los
// slides (texto simple por tramo + slides de interacción), validados contra SchemaClaseDeck. El use case
// SOBRESCRIBE los campos que no se inventan (titulo/asignatura/nivel/oa/tramo_edad/tema): el aporte real
// de la IA son los slides, igual que GenerarClaseDeckUseCase pero con el LOOK infantil data-driven.
// El LOOK vive en el `tema` (TEMAS_DECK_INFANTIL, placeholders a calibrar con las referencias del dueño),
// elegido por tramo de edad — no lo decide la IA ni se hardcodea por nivel.
// El deck nace BORRADOR: la IA solo redacta; la revisión docente (HIL) va después.
//
// DIFERIDO (NO en esta versión): triggers/animaciones, mini_juego, e integración web/worker async.

import type { ClaseDeck, LlmPort, PlanificacionUnidad } from '@faro/domain';
import { SchemaClaseDeck, TEMAS_DECK_INFANTIL, tramoDeNivel } from '@faro/domain';
import { bloqueCorpusUnidad, entradaDeckInfantil, exigirParsedConMeta, INSTR_DECK_INFANTIL } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';

export class GenerarPptInfantilUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(
    unidad: PlanificacionUnidad,
  ): Promise<{ valor: ClaseDeck; meta: MetaGeneracion }> {
    // Tramo de edad → tema (data-driven). El default '3-4' cubre niveles no reconocidos (ver tramoDeNivel).
    const tramo = tramoDeNivel(unidad.nivel);
    const tema = TEMAS_DECK_INFANTIL[tramo];

    // La IA redacta el deck (schema validado); su aporte real son los slides. El use case fija el resto.
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaClaseDeck,
      system: [bloqueCorpusUnidad(unidad), INSTR_DECK_INFANTIL],
      entradaUsuario: entradaDeckInfantil(unidad, tramo),
    });
    const { valor: borrador, meta } = exigirParsedConMeta(salida);

    // Ensamblaje: SOBRESCRIBE los campos que no se inventan con los datos fijos de la planificación.
    // Los OA salen VERBATIM de la unidad (descarta lo que la IA haya puesto en `oa`). El tema/tramo los
    // pone la app (LOOK data-driven). Solo `slides` proviene de la IA.
    const deck: ClaseDeck = {
      ...borrador,
      titulo: `${unidad.unidad} · PPT infantil`,
      asignatura: unidad.asignatura,
      nivel: unidad.nivel,
      oa: unidad.oa.map((o) => o.codigo),
      tramo_edad: tramo,
      tema,
    };

    // Revalida el deck ensamblado contra el contrato del dominio (la sobreescritura no rompe el schema).
    return { valor: SchemaClaseDeck.parse(deck), meta };
  }

  async ejecutar(unidad: PlanificacionUnidad): Promise<ClaseDeck> {
    return (await this.ejecutarConMeta(unidad)).valor;
  }
}
