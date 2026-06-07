// packages/application/src/planificacion/ObtenerPlanificacionAnualUseCase.ts
// Caso de uso: obtener una PlanificacionAnual por id (passthrough al repositorio).

import type { PlanificacionAnualGuardada, PlanificacionAnualRepository } from '@faro/domain';

export class ObtenerPlanificacionAnualUseCase {
  constructor(private readonly planes: PlanificacionAnualRepository) {}

  async ejecutar(id: string): Promise<PlanificacionAnualGuardada | null> {
    return this.planes.obtener(id);
  }
}
