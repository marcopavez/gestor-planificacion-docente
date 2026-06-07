// packages/domain/src/hil/estadoRevision.ts
// Máquina de estados HIL (human-in-the-loop) — pura, sin I/O (RF-PA.11, INV-2, INV-3).
// Art. 8 bis Ley 21.719: toda decisión automatizada sobre un documento requiere revisión humana;
// no existe ruta de código que lleve a 'aprobado' sin un autorHumano identificado.

import { ReglaDominioError } from '../errors/index.js';
// Reutiliza el tipo canónico de la entidad para evitar duplicación en el barrel.
import type { EstadoRevision } from '../entities/index.js';

export type { EstadoRevision };

export type AccionRevision =
  | 'enviar_a_revision'  // borrador → en_revision
  | 'aprobar'            // en_revision → aprobado (exige autorHumano)
  | 'rechazar'           // en_revision → rechazado
  | 'reenviar';          // rechazado → en_revision

export interface ContextoTransicion {
  /** Identificador del humano que aprueba. Obligatorio en la acción 'aprobar'. */
  readonly autorHumano?: string;
}

export interface ResultadoTransicion {
  readonly estado: EstadoRevision;
  /** Propagado desde el contexto si la acción es 'aprobar'. */
  readonly autorHumano: string | null;
}

/**
 * Transición pura de la máquina de estados de revisión.
 * Lanza ReglaDominioError si la transición no está permitida o si se intenta
 * aprobar sin autorHumano (INV-2, INV-3).
 */
export function transicionar(
  actual: EstadoRevision,
  accion: AccionRevision,
  ctx?: ContextoTransicion,
): ResultadoTransicion {
  switch (accion) {
    case 'enviar_a_revision': {
      if (actual !== 'borrador') {
        throw new ReglaDominioError(
          'transicion_invalida',
          `No se puede enviar a revisión un documento en estado '${actual}'. Solo 'borrador' puede enviarse.`,
        );
      }
      return { estado: 'en_revision', autorHumano: null };
    }

    case 'aprobar': {
      if (actual !== 'en_revision') {
        throw new ReglaDominioError(
          'transicion_invalida',
          `No se puede aprobar un documento en estado '${actual}'. Solo 'en_revision' puede aprobarse.`,
        );
      }
      // INV-2/INV-3 + Art. 8 bis: aprobar sin autorHumano está prohibido por diseño.
      if (!ctx?.autorHumano || ctx.autorHumano.trim() === '') {
        throw new ReglaDominioError(
          'aprobacion_sin_humano',
          'Aprobar un documento requiere identificar al revisor humano (autorHumano). ' +
            'Ningún sistema automatizado puede aprobar documentos (Art. 8 bis Ley 21.719).',
        );
      }
      return { estado: 'aprobado', autorHumano: ctx.autorHumano };
    }

    case 'rechazar': {
      if (actual !== 'en_revision') {
        throw new ReglaDominioError(
          'transicion_invalida',
          `No se puede rechazar un documento en estado '${actual}'. Solo 'en_revision' puede rechazarse.`,
        );
      }
      return { estado: 'rechazado', autorHumano: null };
    }

    case 'reenviar': {
      if (actual !== 'rechazado') {
        throw new ReglaDominioError(
          'transicion_invalida',
          `No se puede reenviar a revisión un documento en estado '${actual}'. Solo 'rechazado' puede reenviarse.`,
        );
      }
      return { estado: 'en_revision', autorHumano: null };
    }

    default: {
      // Exhaustividad garantizada en tiempo de compilación; el runtime solo llegaría aquí
      // si se pasara un valor fuera del tipo — se blinda igual.
      const _accion: never = accion;
      throw new ReglaDominioError(
        'accion_desconocida',
        `Acción de revisión desconocida: '${String(_accion)}'.`,
      );
    }
  }
}
