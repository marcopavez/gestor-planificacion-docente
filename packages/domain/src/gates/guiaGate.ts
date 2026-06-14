// packages/domain/src/gates/guiaGate.ts
// Coherencia determinista de la GUÍA (sin red): validez por tipo de cada ejercicio (reusa
// validarItemPrueba) + al menos un ejercicio. No hay tabla de especificaciones ni puntajes (no es prueba).

import type { Guia } from '../schemas/guia.js';
import { validarItemPrueba } from './itemPrueba.js';
import { construirResultado, type Hallazgo, type ResultadoGate } from './tipos.js';

export function guiaGate(guia: Guia): ResultadoGate {
  const h: Hallazgo[] = [];

  if (guia.ejercicios.length === 0) {
    h.push({
      gate: 'pedagogica',
      regla: 'guia_con_ejercicios',
      severidad: 'bloquea',
      mensaje: 'La guía no trae ejercicios de práctica.',
    });
  }

  const items = [...guia.ejercicios, ...(guia.desafio ? [guia.desafio] : [])];
  items.forEach((it, i) => {
    h.push(...validarItemPrueba(it, i + 1));
  });

  return construirResultado(h);
}
