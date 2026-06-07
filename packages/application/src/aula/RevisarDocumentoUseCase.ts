// packages/application/src/aula/RevisarDocumentoUseCase.ts
// Caso de uso: revisión humana (HIL) de un documento generado (RF-PA.11/12, CA-PA.5).
// La transición SIEMPRE pasa por la máquina de estados pura del dominio (`transicionar`);
// este use case nunca toca SQL ad-hoc. Si la máquina rechaza la transición, NUNCA se persiste:
// el documento no cambia de estado (INV-2/INV-3). El CHECK de DB es la última red.

import type {
  DocumentoGenerado,
  DocumentoRepository,
  AccionRevision,
  ContextoTransicion,
} from '@faro/domain';
import { ReglaDominioError, transicionar } from '@faro/domain';

// Resultado discriminado (espejo de EditarPlanificacionAnualUseCase):
//  - ok                       → documento con su nuevo estado persistido.
//  - razon 'no_encontrado'    → el id no existe (la web responde 404).
//  - razon 'transicion_invalida' → la máquina rechazó la transición; `regla` distingue el motivo
//    ('transicion_invalida' → 409; 'aprobacion_sin_humano' → 422). `mensaje` es legible.
export type ResultadoRevision =
  | { readonly ok: true; readonly documento: DocumentoGenerado }
  | { readonly ok: false; readonly razon: 'no_encontrado' }
  | {
      readonly ok: false;
      readonly razon: 'transicion_invalida';
      readonly mensaje: string;
      readonly regla: string;
    };

export class RevisarDocumentoUseCase {
  constructor(private readonly documentos: DocumentoRepository) {}

  /** borrador → en_revision (RF-PA.11). */
  async enviarARevision(id: string): Promise<ResultadoRevision> {
    return this.aplicar(id, 'enviar_a_revision');
  }

  /** en_revision → aprobado; exige autorHumano no vacío (INV-3, Art. 8 bis). */
  async aprobar(id: string, autorHumano: string): Promise<ResultadoRevision> {
    return this.aplicar(id, 'aprobar', { autorHumano });
  }

  /** en_revision → rechazado (RF-PA.11). */
  async rechazar(id: string): Promise<ResultadoRevision> {
    return this.aplicar(id, 'rechazar');
  }

  // Nota: la máquina del dominio también soporta `reenviar` (rechazado → en_revision); su
  // endpoint/UI quedan fuera del alcance de H-PA.10 (trabajo futuro).

  /**
   * Núcleo común: resuelve el documento, corre la transición pura del dominio y, SOLO si
   * la máquina la acepta, persiste el nuevo estado. ReglaDominioError → resultado discriminado;
   * cualquier otro error (infra) se relanza para que la web responda 500.
   */
  private async aplicar(
    id: string,
    accion: AccionRevision,
    ctx?: ContextoTransicion,
  ): Promise<ResultadoRevision> {
    const doc = await this.documentos.porId(id);
    if (doc === null) {
      return { ok: false, razon: 'no_encontrado' };
    }

    let resultado;
    try {
      // La máquina de estados del dominio es la ÚNICA fuente de verdad de la transición (INV-2/INV-3).
      resultado = transicionar(doc.estadoRevision, accion, ctx);
    } catch (e) {
      if (e instanceof ReglaDominioError) {
        // Si la máquina rechaza, NUNCA persistimos: el documento queda intacto.
        return { ok: false, razon: 'transicion_invalida', mensaje: e.message, regla: e.regla };
      }
      throw e;
    }

    await this.documentos.actualizarEstadoRevision(id, resultado.estado, resultado.autorHumano);

    // Releemos para devolver el documento con su estado/autor ya persistidos.
    const actualizado = await this.documentos.porId(id);
    if (actualizado === null) {
      // El documento existía hace un instante; si desaparece, es un fallo de infra → 500.
      throw new Error(`El documento '${id}' desapareció tras actualizar su estado de revisión.`);
    }
    return { ok: true, documento: actualizado };
  }
}
