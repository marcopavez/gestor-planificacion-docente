// packages/application/src/aula/cascada/derivarContextoCascada.ts
// Función pura (INV-1) que construye el ContextoCascada desde una UnidadPlanificada.
// El dominio puro (gates, schemas) provee los tipos; no hay I/O aquí.

import type { ObjetivoAprendizaje, OaVigencia } from '@faro/domain';
import { ReglaDominioError, estaVigente } from '@faro/domain';
import type { UnidadPlanificada } from '@faro/domain';
import type { ContextoCascada, OaCorpus } from './tipos.js';

/**
 * Construye el ContextoCascada para ejecutar la cascada de Aula desde una unidad planificada.
 *
 * @param unidad          - Unidad de la PlanificacionAnual (qué OA se trabajan).
 * @param cabecera        - Metadatos del plan (establecimiento, asignatura, nivel, corpus).
 * @param oaDelCorpus     - OA del corpus para la asignatura/nivel (de OaRepository).
 * @param hoy             - Fecha de referencia para calcular vigencia (inyectada — INV-1).
 */
export function derivarContextoCascada(
  unidad: UnidadPlanificada,
  cabecera: {
    establecimiento: string;
    asignatura: string;
    nivel: string;
    corpusVersionId: string;
  },
  oaDelCorpus: readonly ObjetivoAprendizaje[],
  hoy: Date,
): ContextoCascada {
  // Índice del corpus por código para búsquedas O(1).
  const porCodigo = new Map(oaDelCorpus.map((o) => [o.codigo, o]));

  // Defensa de última línea: el secuenciaAnualGate ya debió bloquear OA inexistentes.
  // Si algún código de la unidad no está en el corpus, lanzamos ReglaDominioError.
  for (const codigo of unidad.oaCodigos) {
    if (!porCodigo.has(codigo)) {
      throw new ReglaDominioError(
        'oa_no_encontrado_en_corpus',
        `El OA ${codigo} de la unidad "${unidad.titulo}" no existe en el corpus (corpusVersionId: ${cabecera.corpusVersionId}). El secuenciaAnualGate debió bloquearlo previamente.`,
      );
    }
  }

  // Mapear OA seleccionados (los de la unidad) → OaCorpus (nivel application).
  // 'categoria: basal' por defecto: el corpus no trae categoría por-OA aún.
  // 'habilidades' se omite: no está en ObjetivoAprendizaje (entidad de dominio).
  const oaSeleccionados: OaCorpus[] = unidad.oaCodigos.map((codigo) => {
    // El cast es seguro: validamos existencia arriba.
    const oa = porCodigo.get(codigo)!;
    return {
      codigo: oa.codigo,
      categoria: 'basal',
      descripcion: oa.descripcion,
      indicadores: oa.indicadores.length > 0 ? oa.indicadores : undefined,
    };
  });

  // Corpus completo para validación de citas (citationGate): todo el corpus de la asignatura/nivel.
  // 'vigente' se calcula contra 'hoy' con el helper determinista de dominio (INV-1).
  const oaCorpusValidacion: OaVigencia[] = oaDelCorpus.map((oa) => ({
    codigo: oa.codigo,
    vigente: estaVigente(oa.vigenciaDesde, oa.vigenciaHasta, hoy),
  }));

  return {
    establecimiento: cabecera.establecimiento,
    asignatura: cabecera.asignatura,
    nivel: cabecera.nivel,
    unidadTitulo: unidad.titulo,
    oaSeleccionados,
    corpusVersionId: cabecera.corpusVersionId,
    oaCorpusValidacion,
  };
}
