// Integración de la cola 'planificacion' (H-2.7) sobre pglite: encolar/tomar con payload íntegro y la
// AISLACIÓN entre tipos de trabajo — un job de planificación NO lo toma el consumidor de cascada
// (tomarSiguiente filtra 'cascada_unidad'), para que ambos coexistan sin chocar.

import { describe, expect, it } from 'vitest';
import type { PayloadPlanificacion } from '@faro/domain';
import type { DrizzleDb } from '../db.js';
import { JobRepositoryDrizzle } from '../repos/JobRepositoryDrizzle.js';
import { crearDbTest } from './pgliteHelper.js';

const PAYLOAD: PayloadPlanificacion = {
  establecimiento: 'Escuela General José Alejandro Bernales D-114',
  asignatura: 'Matemática',
  nivel: '1º básico',
  unidad: 'Unidad 1',
  plantilla: 'A',
  oaCodigos: ['MA01 OA 03', 'MA01 OA 04'],
  duracion_semanas: 6,
};

describe('JobRepository — cola de planificación (H-2.7)', () => {
  it('encola, el consumidor de cascada NO lo toma, y el de planificación sí (payload íntegro)', async () => {
    const db = await crearDbTest();
    const jobs = new JobRepositoryDrizzle(db as unknown as DrizzleDb);

    const id = await jobs.encolarPlanificacion(PAYLOAD);

    // Aislación: el consumidor de cascada filtra por tipo y no toma el job de planificación.
    expect(await jobs.tomarSiguiente('w')).toBeNull();

    // El consumidor de planificación sí lo toma, con el payload reconstruido y validado.
    const trabajo = await jobs.tomarSiguientePlanificacion('w');
    expect(trabajo?.id).toBe(id);
    expect(trabajo?.intentos).toBe(1);
    expect(trabajo?.payload.oaCodigos).toEqual(['MA01 OA 03', 'MA01 OA 04']);
    expect(trabajo?.payload.plantilla).toBe('A');

    // Ya tomado (en_proceso) → no hay más pendientes en la cola de planificación.
    expect(await jobs.tomarSiguientePlanificacion('w')).toBeNull();
    const estado = await jobs.obtenerEstado(id);
    expect(estado?.estado).toBe('en_proceso');
  }, 60_000);
});
