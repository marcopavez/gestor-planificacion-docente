// packages/application/src/planificacion/ListarPlanificacionAnualUseCase.ts
// Caso de uso: listar PlanificacionAnual por filtro (passthrough al repositorio).

import type { PlanificacionAnualGuardada, PlanificacionAnualRepository } from '@faro/domain';

export interface FiltroListarPlan {
  readonly establecimiento: string;
  readonly asignatura?: string;
  readonly nivel?: string;
  readonly anio?: number;
}

export class ListarPlanificacionAnualUseCase {
  constructor(private readonly planes: PlanificacionAnualRepository) {}

  async ejecutar(filtro: FiltroListarPlan): Promise<PlanificacionAnualGuardada[]> {
    return this.planes.listar(filtro);
  }
}
