// apps/web/src/lib/samplesLlm.ts
// LlmPort de modo demo (INV-6): NO usa API key ni token de suscripción. Sirve los artefactos
// curados de samples/<materia>/ y los valida contra el schema real (un sample inválido falla).
// Despacha por identidad de schema (el mismo objeto que pasan los use cases).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LlmPort } from '@faro/domain';
import { SchemaClaseDeck, SchemaPlanificacionClase, SchemaPlanificacionUnidad, SchemaPrueba } from '@faro/domain';

export function crearSamplesLlm(samplesDir: string): LlmPort {
  const archivoPorSchema = new Map<unknown, string>([
    [SchemaPlanificacionUnidad, 'planificacion-unidad.json'],
    [SchemaPlanificacionClase, 'planificacion-clase.json'],
    [SchemaPrueba, 'prueba.json'],
    [SchemaClaseDeck, 'clase-deck.json'],
  ]);

  return {
    async generar(args) {
      const archivo = archivoPorSchema.get(args.schema);
      if (archivo === undefined) {
        throw new Error(`SamplesLlm: no hay muestra para el schema (tarea=${args.tarea}).`);
      }
      const raw: unknown = JSON.parse(readFileSync(join(samplesDir, archivo), 'utf8'));
      const parsed = args.schema.parse(raw);
      return {
        parsed,
        stopReason: 'end_turn',
        usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        modelo: 'samples-demo',
      };
    },
  };
}
