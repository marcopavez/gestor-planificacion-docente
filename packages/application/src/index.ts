// packages/application/src/index.ts
// Paquete @faro/application: orquesta puertos del dominio vía use cases.
// INV-5: solo importa @faro/domain. No importa infra-*, next, SDK de Anthropic ni apps.

export type { GenerarPruebaInput } from './aula/GenerarPruebaUseCase.js';
export { GenerarPruebaUseCase, GeneracionError } from './aula/GenerarPruebaUseCase.js';
