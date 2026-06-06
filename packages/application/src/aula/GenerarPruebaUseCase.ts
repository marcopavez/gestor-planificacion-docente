// packages/application/src/aula/GenerarPruebaUseCase.ts
// Use case de la historia H-0.8 (slice Aula) — esqueleto Fase 0.
// Orquesta puertos del dominio; no sabe nada de infra ni de framework (INV-5).

import type {
  DocumentoRepository,
  JobRepository,
  LlmPort,
  NormaRepository,
  OaRepository,
  RerankerPort,
  RetrievalPort,
  TrazaRepository,
} from '@faro/domain';
import { GeneracionError } from '@faro/domain';

export interface GenerarPruebaInput {
  readonly documentoId: string;
  readonly establecimientoId: string;
  readonly asignatura: string;
  readonly curso: string;
  readonly oaIds: string[];
  readonly corpusVersionId: string;
}

interface UseCasePorts {
  retrieval: RetrievalPort;
  reranker: RerankerPort;
  llm: LlmPort;
  documentos: DocumentoRepository;
  traza: TrazaRepository;
  jobs: JobRepository;
  oa: OaRepository;
  normas: NormaRepository;
}

/**
 * GenerarPruebaUseCase — orquesta el slice de Aula (RF-0.17).
 * Esqueleto en Fase 0: la lógica completa (gates, reintento, traza) se implementa en H-0.8.
 * Este esqueleto prueba el cableado de puertos sin lógica de negocio real.
 */
export class GenerarPruebaUseCase {
  constructor(private readonly ports: UseCasePorts) {}

  async ejecutar(input: GenerarPruebaInput): Promise<void> {
    // TODO H-0.8: implementar el slice completo:
    // 1. Recuperar contexto OA con HybridRetriever
    // 2. Generar Prueba con LLM (structured output)
    // 3. pedagogicalGate + citationGate
    // 4. Reintento si gates bloquean (RF-0.19)
    // 5. Persistir documento_generado(borrador, validado) + traza_ia
    //
    // Referencia de compilación: ports y input tipados; se eliminan en H-0.8.
    void this.ports;
    void input;
    throw new GeneracionError('not-implemented', input.documentoId);
  }
}

export { GeneracionError };
