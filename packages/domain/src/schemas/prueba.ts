// packages/domain/src/schemas/prueba.ts
// Schema Zod de Prueba — RF-0.7, §4.6.
// Los constraints numéricos (min/max, conteos) NO van aquí: se validan en pedagogicalGate.
// El SDK de Anthropic no soporta esos constraints en structured outputs (blueprint §3.1, §7.2).

import { z } from 'zod';

export const ItemPrueba = z.object({
  oa: z.string(), // OA al que tributa el ítem
  habilidad: z.enum(['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear']),
  tipo: z.enum(['seleccion_multiple', 'verdadero_falso', 'desarrollo', 'completacion']),
  enunciado: z.string(),
  alternativas: z
    .array(z.object({ texto: z.string(), correcta: z.boolean() }))
    .optional(), // solo para seleccion_multiple y verdadero_falso
  respuesta_correcta: z.string().optional(), // para desarrollo y completacion
  puntaje: z.number(),
});

export const SchemaPrueba = z.object({
  asignatura: z.string(),
  curso: z.string(),
  tabla_especificaciones: z.array(
    z.object({
      oa: z.string(),
      n_items: z.number(),
      puntaje: z.number(),
    }),
  ),
  items: z.array(ItemPrueba),
  pauta_correccion: z.string(),
  alineada_reglamento: z.boolean(), // respeta reglamento Decreto 67 [E10]
  version_nee_dua: z.boolean(), // variante Decreto 83 [E11] — deferida a Fase 2
  // Perfil por nivel: ajusta tipo/conteo de ítems en pedagogicalGate (1B = 1º básico, pre-lectores).
  perfil_nivel: z.enum(['1B', '2B', '3B', 'generico']),
});

export type Prueba = z.infer<typeof SchemaPrueba>;
export type ItemPruebaType = z.infer<typeof ItemPrueba>;
