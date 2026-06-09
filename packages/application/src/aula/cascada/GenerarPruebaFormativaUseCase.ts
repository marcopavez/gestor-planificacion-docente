// packages/application/src/aula/cascada/GenerarPruebaFormativaUseCase.ts
// Fase 4 (prueba formativa): genera una Prueba FORMATIVA desde una PlanificacionUnidad (salida de Fase 2).
// Análogo standalone derivado-de-unidad de GenerarPruebaCascadaUseCase (que usa bloqueCorpus(ctx)); este
// usa bloqueCorpusUnidad(unidad) porque aguas abajo solo se tiene la planificación.
// Híbrido: los ítems y la tabla de especificaciones (anclados a OA) salen de la IA; el use case
// SOBRESCRIBE lo que no se inventa (asignatura/curso/perfil_nivel/tipo_evaluacion) con datos fijos de la
// unidad — mismo patrón data-driven que GenerarPptInfantilUseCase (perfil_nivel por tramo de edad).
// La prueba nace BORRADOR: la IA solo redacta; los gates (pedagogicalGate) los corre el orquestador/HIL,
// no este use case (misma convención que la cascada y el PPT infantil).

import type { LlmPort, PlanificacionUnidad, Prueba } from '@faro/domain';
import { SchemaPrueba, tramoDeNivel } from '@faro/domain';
import { bloqueCorpusUnidad, entradaPrueba, exigirParsedConMeta, INSTR_PRUEBA } from './generacion.js';
import type { MetaGeneracion } from './generacion.js';

export class GenerarPruebaFormativaUseCase {
  constructor(private readonly llm: LlmPort) {}

  async ejecutarConMeta(unidad: PlanificacionUnidad): Promise<{ valor: Prueba; meta: MetaGeneracion }> {
    // La IA redacta la prueba (schema validado); su aporte real son los ítems y la tabla. El use case fija el resto.
    const salida = await this.llm.generar({
      tarea: 'redaccion',
      schema: SchemaPrueba,
      system: [bloqueCorpusUnidad(unidad), INSTR_PRUEBA],
      entradaUsuario: entradaPrueba(unidad),
    });
    const { valor: borrador, meta } = exigirParsedConMeta(salida);

    // Ensamblaje: SOBRESCRIBE lo que NO inventa la IA (datos fijos de la unidad). Los ítems/tabla
    // (anclados a OA) vienen de la IA. perfil_nivel por tramo (data-driven, como el PPT); tipo formativa.
    const prueba: Prueba = {
      ...borrador,
      asignatura: unidad.asignatura,
      curso: unidad.nivel,
      perfil_nivel: tramoDeNivel(unidad.nivel),
      tipo_evaluacion: 'formativa',
    };

    // Revalida la prueba ensamblada contra el contrato del dominio (la sobreescritura no rompe el schema).
    return { valor: SchemaPrueba.parse(prueba), meta };
  }

  async ejecutar(unidad: PlanificacionUnidad): Promise<Prueba> {
    return (await this.ejecutarConMeta(unidad)).valor;
  }
}
