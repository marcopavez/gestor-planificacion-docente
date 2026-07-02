// packages/application/src/planificacion/ListarPlanificacionAnualUseCase.ts
// Caso de uso: listar PlanificacionAnual por filtro (passthrough al repositorio).

import type { PlanificacionAnualGuardada, PlanificacionAnualRepository } from '@faro/domain';

export interface FiltroListarPlan {
  // usuarioId acota siempre al dueño (tenancy) — el repo de dominio ya lo exige (Fase 1).
  readonly usuarioId: string;
  readonly establecimiento?: string;
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
