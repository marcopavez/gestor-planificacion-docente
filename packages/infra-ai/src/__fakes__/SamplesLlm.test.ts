// Regresión del modo demo (sin API key): SamplesLlm debe servir un borrador válido para el flujo de
// planificación híbrida (H-2.7). Sin esta muestra, todo job 'planificacion' fallaba en modo samples
// (el schema SchemaBorradorPlanificacionIa no estaba registrado).

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SchemaBorradorPlanificacionIa, SchemaPlanificacionUnidad } from '@faro/domain';
import { crearSamplesLlm } from './SamplesLlm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, '../../../../samples/aula-matematica-1b');

describe('SamplesLlm (modo demo sin red)', () => {
  it('sirve un borrador de planificación válido para SchemaBorradorPlanificacionIa', async () => {
    const llm = crearSamplesLlm(SAMPLES_DIR);
    const salida = await llm.generar({
      tarea: 'redaccion',
      schema: SchemaBorradorPlanificacionIa,
      system: [],
      entradaUsuario: '',
    });
    expect(salida.parsed).not.toBeNull();
    expect(salida.parsed?.proposito.length).toBeGreaterThan(0);
    expect(salida.parsed?.experiencias.length).toBeGreaterThan(0);
    expect(salida.parsed?.indicadores.length).toBeGreaterThan(0);
  });

  it('sigue sirviendo la planificación de unidad de la cascada (no se rompió)', async () => {
    const llm = crearSamplesLlm(SAMPLES_DIR);
    const salida = await llm.generar({
      tarea: 'redaccion',
      schema: SchemaPlanificacionUnidad,
      system: [],
      entradaUsuario: '',
    });
    expect(salida.parsed).not.toBeNull();
  });
});
