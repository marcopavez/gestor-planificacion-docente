// packages/domain/src/gates/itemPrueba.ts
// Validez por TIPO de un ítem (independiente de tabla/puntaje): exactamente una correcta en SM/VF,
// secuencia válida en 'ordenar', pares válidos en 'terminos_pareados'. La usan pedagogicalGate (prueba)
// y guiaGate (guía) para no duplicar las reglas por-ítem.

import type { ItemPruebaType } from '../schemas/prueba.js';
import type { Hallazgo } from './tipos.js';

export function validarItemPrueba(it: ItemPruebaType, numero: number): Hallazgo[] {
  const h: Hallazgo[] = [];

  if (it.tipo === 'seleccion_multiple' || it.tipo === 'verdadero_falso') {
    const correctas = (it.alternativas ?? []).filter((a) => a.correcta).length;
    if (correctas !== 1) {
      h.push({
        gate: 'pedagogica',
        regla: 'una_correcta',
        severidad: 'bloquea',
        mensaje: `El ítem ${numero} (${it.tipo}) tiene ${correctas} alternativas correctas; debe ser exactamente 1.`,
      });
    }
  }

  if (it.tipo === 'ordenar') {
    const sec = it.secuencia_correcta ?? [];
    const sinDuplicados = new Set(sec).size === sec.length;
    if (sec.length === 0 || !sinDuplicados) {
      h.push({
        gate: 'pedagogica',
        regla: 'una_correcta',
        severidad: 'bloquea',
        mensaje: `El ítem ${numero} (ordenar) requiere secuencia_correcta no vacía y sin duplicados.`,
      });
    }
  }

  if (it.tipo === 'terminos_pareados') {
    const pares = it.pares ?? [];
    const paresValidos = pares.every((p) => p.columnaA.length > 0 && p.columnaB.length > 0);
    if (pares.length === 0 || !paresValidos) {
      h.push({
        gate: 'pedagogica',
        regla: 'una_correcta',
        severidad: 'bloquea',
        mensaje: `El ítem ${numero} (terminos_pareados) requiere pares no vacíos con columnaA y columnaB.`,
      });
    }
  }

  return h;
}
