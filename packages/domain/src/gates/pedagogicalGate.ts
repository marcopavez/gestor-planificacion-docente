// packages/domain/src/gates/pedagogicalGate.ts
// Coherencia determinista de la prueba FORMATIVA: ancla OA (cada ítem tributa a la tabla), validez
// por tipo de ítem y, si hay ponderación completa, que los puntajes cuadren. Spec §4.6.

import type { Prueba } from '../schemas/prueba.js';
import { validarItemPrueba } from './itemPrueba.js';
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
    // Validez por tipo de ítem (una correcta / ordenar / términos pareados) — compartida con la guía.
    h.push(...validarItemPrueba(it, n));
    // 'pictorico': sin validación extra (la imagen es solo una descripción placeholder).
  });

  // Puntajes: como el puntaje es opcional en formativa, solo validamos si TODOS los ítems y todas las
  // filas de la tabla traen puntaje. Si falta alguno, no bloqueamos (caso formativo sin ponderación).
  const itemsConPuntaje = prueba.items.every((it) => it.puntaje !== undefined);
  const tablaConPuntaje = prueba.tabla_especificaciones.every((t) => t.puntaje !== undefined);
  if (itemsConPuntaje && tablaConPuntaje) {
    const puntajeItems = prueba.items.reduce((s, it) => s + (it.puntaje ?? 0), 0);
    const puntajeTabla = prueba.tabla_especificaciones.reduce((s, t) => s + (t.puntaje ?? 0), 0);
    if (puntajeItems !== puntajeTabla) {
      h.push({
        gate: 'pedagogica',
        regla: 'puntajes_cuadran',
        severidad: 'bloquea',
        mensaje: `La suma de puntajes de ítems (${puntajeItems}) no coincide con la tabla de especificaciones (${puntajeTabla}).`,
      });
    }
  }

  return construirResultado(h);
}
