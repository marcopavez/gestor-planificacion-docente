// packages/domain/src/gates/pedagogicalGate.ts
// RF-2.12 (Fase 0 + cascada): coherencia determinista de la prueba (Decreto 67). Spec §4.6.

import type { Prueba } from '../schemas/prueba.js';
import { construirResultado, type Hallazgo, type ResultadoGate } from './tipos.js';

export function pedagogicalGate(prueba: Prueba): ResultadoGate {
  const h: Hallazgo[] = [];
  const oaTabla = new Set(prueba.tabla_especificaciones.map((t) => t.oa));

  prueba.items.forEach((it, i) => {
    const n = i + 1;
    // Cada ítem tributa a un OA presente en la tabla de especificaciones.
    if (!oaTabla.has(it.oa)) {
      h.push({
        gate: 'pedagogica',
        regla: 'item_en_tabla',
        severidad: 'bloquea',
        mensaje: `El ítem ${n} tributa a ${it.oa}, ausente en la tabla de especificaciones.`,
        ref: it.oa,
      });
    }
    // Selección múltiple / verdadero-falso: exactamente una alternativa correcta.
    if (it.tipo === 'seleccion_multiple' || it.tipo === 'verdadero_falso') {
      const correctas = (it.alternativas ?? []).filter((a) => a.correcta).length;
      if (correctas !== 1) {
        h.push({
          gate: 'pedagogica',
          regla: 'una_correcta',
          severidad: 'bloquea',
          mensaje: `El ítem ${n} (${it.tipo}) tiene ${correctas} alternativas correctas; debe ser exactamente 1.`,
        });
      }
    }
  });

  // La suma de puntajes de ítems coincide con la tabla de especificaciones.
  const puntajeItems = prueba.items.reduce((s, it) => s + it.puntaje, 0);
  const puntajeTabla = prueba.tabla_especificaciones.reduce((s, t) => s + t.puntaje, 0);
  if (puntajeItems !== puntajeTabla) {
    h.push({
      gate: 'pedagogica',
      regla: 'puntajes_cuadran',
      severidad: 'bloquea',
      mensaje: `La suma de puntajes de ítems (${puntajeItems}) no coincide con la tabla de especificaciones (${puntajeTabla}).`,
    });
  }

  return construirResultado(h);
}
