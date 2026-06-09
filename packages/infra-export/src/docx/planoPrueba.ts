// packages/infra-export/src/docx/planoPrueba.ts
// Fase 4 · Layout intermedio (IR) de la PRUEBA FORMATIVA: representación PURA y testeable derivada de
// la `Prueba` (artefacto de IA) + `EncabezadoPrueba` (config del caller) + `VariantePrueba`. El render a
// .docx (PruebaExportAdapter) y a .pdf consumen este mismo IR; los tests asertan sobre el IR (secciones,
// orden, numeración, soluciones) sin descomprimir el .docx — análogo a plano.ts de la planificación.
//
// UNA función + UN flag `mostrarSolucion` distingue alumno/pauta (no dos IR distintos): la pauta es el
// mismo documento con las respuestas + retroalimentación reveladas, más la tabla de especificaciones.
//
// REGLA "no inventar estructuras": las secciones agrupan los ítems por su `tipo` en un orden pedagógico
// fijo; las instrucciones son textos fijos (español de Chile). No se inventan columnas ni campos que la
// prueba real no traiga.

import type { EncabezadoPrueba, ItemPruebaType, Prueba, VariantePrueba } from '@faro/domain';

export interface EncabezadoPlano {
  // Placeholder "IMAGEN: …" del escudo (misma filosofía que 'pictorico'): nunca un asset real.
  readonly escudo?: string;
  readonly lineaColegio: string; // "Escuela José A. Bernales D-114 · Conchalí"
  readonly docente?: string;
  readonly asignatura: string;
  readonly titulo: string;
  readonly curso: string;
  readonly identificacion: ReadonlyArray<ReadonlyArray<string>>; // filas de la tabla 2×2 de identificación
  readonly oaFilas: ReadonlyArray<{ readonly codigo: string; readonly descripcion: string }>;
}

/** Ítem renderizable, discriminado por `tipo`. `solucion`/`retro` solo se rellenan en la variante pauta. */
export type ItemPlano =
  | {
      readonly tipo: 'seleccion_multiple';
      readonly numero: number;
      readonly enunciado: string;
      readonly puntaje?: number;
      readonly alternativas: ReadonlyArray<{ readonly etiqueta: string; readonly texto: string; readonly correcta: boolean }>;
      readonly solucion?: string;
      readonly retro?: string;
    }
  | {
      readonly tipo: 'verdadero_falso';
      readonly numero: number;
      readonly enunciado: string;
      readonly puntaje?: number;
      readonly correcta?: 'V' | 'F';
      readonly solucion?: string;
      readonly retro?: string;
    }
  | {
      readonly tipo: 'completacion' | 'desarrollo';
      readonly numero: number;
      readonly enunciado: string;
      readonly puntaje?: number;
      readonly solucion?: string;
      readonly retro?: string;
    }
  | {
      readonly tipo: 'ordenar';
      readonly numero: number;
      readonly enunciado: string;
      readonly puntaje?: number;
      readonly elementos: readonly string[];
      readonly solucion?: string;
      readonly retro?: string;
    }
  | {
      readonly tipo: 'terminos_pareados';
      readonly numero: number;
      readonly enunciado: string;
      readonly puntaje?: number;
      readonly columnaA: readonly string[];
      readonly columnaB: readonly string[];
      readonly solucion?: string;
      readonly retro?: string;
    }
  | {
      readonly tipo: 'pictorico';
      readonly numero: number;
      readonly enunciado: string;
      readonly puntaje?: number;
      readonly imagenPlaceholder: string;
      readonly solucion?: string;
      readonly retro?: string;
    };

export interface SeccionPruebaPlano {
  readonly romano: string;
  readonly instruccion: string;
  readonly puntaje?: number;
  readonly items: readonly ItemPlano[];
}

export interface PruebaPlano {
  readonly encabezado: EncabezadoPlano;
  readonly mostrarSolucion: boolean;
  readonly asignatura: string;
  readonly curso: string;
  readonly tipoEvaluacion: string;
  readonly secciones: readonly SeccionPruebaPlano[];
  // Solo en variante 'pauta':
  readonly pautaCorreccion?: string;
  readonly tablaEspecificaciones?: ReadonlyArray<{ readonly codigo: string; readonly nItems: number; readonly puntaje?: number }>;
}

// Orden FIJO pedagógico de las secciones romanas (recordar → crear-ish). Solo se crea sección para los
// tipos presentes; el romano se asigna en este orden.
const ORDEN_TIPOS = [
  'verdadero_falso',
  'seleccion_multiple',
  'terminos_pareados',
  'completacion',
  'ordenar',
  'pictorico',
  'desarrollo',
] as const;

type TipoItem = (typeof ORDEN_TIPOS)[number];

// Instrucción por tipo (texto fijo, español de Chile).
const INSTRUCCION: Record<TipoItem, string> = {
  verdadero_falso: 'Escribe V si es verdadero o F si es falso.',
  seleccion_multiple: 'Marca con una X la alternativa correcta.',
  terminos_pareados: 'Une con una línea cada elemento de la columna A con su par en la columna B.',
  completacion: 'Completa con la palabra que falta.',
  ordenar: 'Ordena escribiendo el número que corresponde.',
  pictorico: 'Observa la imagen y responde.',
  desarrollo: 'Responde con tus palabras.',
};

// Índice Bloom para ordenar los ítems DENTRO de cada sección (recordar < … < crear).
const ORDEN_BLOOM = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'];
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const ETIQUETAS_ALT = ['A', 'B', 'C', 'D', 'E', 'F'];

function indiceBloom(habilidad: string): number {
  const i = ORDEN_BLOOM.indexOf(habilidad);
  return i === -1 ? ORDEN_BLOOM.length : i;
}

/** Construye el IR de la prueba a partir de la prueba, el encabezado y la variante. */
export function planoPrueba(prueba: Prueba, encabezado: EncabezadoPrueba, variante: VariantePrueba): PruebaPlano {
  const mostrarSolucion = variante === 'pauta';

  let numero = 0;
  const secciones: SeccionPruebaPlano[] = [];
  for (const tipo of ORDEN_TIPOS) {
    const delTipo = prueba.items
      .filter((it) => it.tipo === tipo)
      .sort((a, b) => indiceBloom(a.habilidad) - indiceBloom(b.habilidad));
    if (delTipo.length === 0) continue;

    const items = delTipo.map((it) => itemPlano(it, ++numero, mostrarSolucion));
    secciones.push({
      romano: ROMANOS[secciones.length] ?? String(secciones.length + 1),
      instruccion: INSTRUCCION[tipo],
      ...(puntajeSeccion(items) !== undefined ? { puntaje: puntajeSeccion(items) } : {}),
      items,
    });
  }

  return {
    encabezado: encabezadoPlano(prueba, encabezado),
    mostrarSolucion,
    // asignatura/curso salen de la PRUEBA (única fuente de verdad), no del encabezado.
    asignatura: prueba.asignatura,
    curso: prueba.curso,
    tipoEvaluacion: prueba.tipo_evaluacion,
    secciones,
    ...(mostrarSolucion ? { pautaCorreccion: prueba.pauta_correccion } : {}),
    ...(mostrarSolucion
      ? {
          tablaEspecificaciones: prueba.tabla_especificaciones.map((t) => ({
            codigo: t.oa,
            nItems: t.n_items,
            ...(t.puntaje !== undefined ? { puntaje: t.puntaje } : {}),
          })),
        }
      : {}),
  };
}

/** Suma de puntajes de la sección SOLO si todos los ítems traen puntaje (formativa puede no ponderar). */
function puntajeSeccion(items: readonly ItemPlano[]): number | undefined {
  if (items.length === 0 || items.some((i) => i.puntaje === undefined)) return undefined;
  return items.reduce((acc, i) => acc + (i.puntaje ?? 0), 0);
}

function encabezadoPlano(prueba: Prueba, e: EncabezadoPrueba): EncabezadoPlano {
  // fila2: puntaje total (si está), puntaje obtenido, y nota (con % de exigencia si está) — calca la
  // tabla 2×2 de identificación de la prueba real, sin inventar columnas que no estén.
  const puntajeTotal = e.puntajeTotal !== undefined ? `Puntaje total: ${e.puntajeTotal} puntos` : 'Puntaje total:';
  const nota = e.porcentajeExigencia !== undefined ? `Nota:   Exigencia ${e.porcentajeExigencia}%` : 'Nota:';
  return {
    ...(e.escudo !== undefined ? { escudo: `IMAGEN: ${e.escudo}` } : {}),
    lineaColegio: `${e.nombreColegio} · ${e.comuna}`,
    ...(e.docente !== undefined ? { docente: e.docente } : {}),
    asignatura: prueba.asignatura,
    titulo: e.titulo,
    curso: prueba.curso,
    identificacion: [
      ['Nombre:', 'Fecha:'],
      [puntajeTotal, 'Puntaje obtenido:', nota],
    ],
    oaFilas: e.oa.map((o) => ({ codigo: o.codigo, descripcion: o.descripcion })),
  };
}

/** Deriva el `ItemPlano` de un `ItemPruebaType` según su tipo, con numeración continua y soluciones HIL. */
function itemPlano(it: ItemPruebaType, numero: number, mostrarSolucion: boolean): ItemPlano {
  const base = { numero, enunciado: it.enunciado, ...(it.puntaje !== undefined ? { puntaje: it.puntaje } : {}) };
  const retro = mostrarSolucion && it.retroalimentacion !== undefined ? { retro: it.retroalimentacion } : {};

  switch (it.tipo) {
    case 'seleccion_multiple': {
      const alternativas = (it.alternativas ?? []).map((alt, i) => ({
        etiqueta: ETIQUETAS_ALT[i] ?? String(i + 1),
        texto: alt.texto,
        correcta: alt.correcta,
      }));
      const correcta = alternativas.find((a) => a.correcta);
      const solucion =
        mostrarSolucion && correcta !== undefined ? { solucion: `${correcta.etiqueta}) ${correcta.texto}` } : {};
      return { tipo: 'seleccion_multiple', ...base, alternativas, ...solucion, ...retro };
    }
    case 'verdadero_falso': {
      const correcta = correctaVF(it);
      const solucion = mostrarSolucion && correcta !== undefined ? { solucion: correcta } : {};
      return {
        tipo: 'verdadero_falso',
        ...base,
        ...(mostrarSolucion && correcta !== undefined ? { correcta } : {}),
        ...solucion,
        ...retro,
      };
    }
    case 'completacion':
    case 'desarrollo': {
      const solucion =
        mostrarSolucion && it.respuesta_correcta !== undefined ? { solucion: it.respuesta_correcta } : {};
      return { tipo: it.tipo, ...base, ...solucion, ...retro };
    }
    case 'ordenar': {
      const elementos = it.secuencia_correcta ?? [];
      const solucion = mostrarSolucion && elementos.length > 0 ? { solucion: elementos.join(' → ') } : {};
      return { tipo: 'ordenar', ...base, elementos, ...solucion, ...retro };
    }
    case 'terminos_pareados': {
      const pares = it.pares ?? [];
      const solucion =
        mostrarSolucion && pares.length > 0
          ? { solucion: pares.map((p) => `${p.columnaA} ↔ ${p.columnaB}`).join('; ') }
          : {};
      return {
        tipo: 'terminos_pareados',
        ...base,
        columnaA: pares.map((p) => p.columnaA),
        columnaB: pares.map((p) => p.columnaB),
        ...solucion,
        ...retro,
      };
    }
    case 'pictorico': {
      const solucion =
        mostrarSolucion && it.respuesta_correcta !== undefined ? { solucion: it.respuesta_correcta } : {};
      return {
        tipo: 'pictorico',
        ...base,
        imagenPlaceholder: `IMAGEN: ${it.imagen ?? '(sin descripción)'}`,
        ...solucion,
        ...retro,
      };
    }
  }
}

/** Deriva 'V'/'F' de las alternativas de un ítem verdadero_falso (texto "Verdadero"/"V" con correcta:true). */
function correctaVF(it: ItemPruebaType): 'V' | 'F' | undefined {
  const verdadera = it.alternativas?.find((a) => /^\s*(v|verdadero)\s*$/i.test(a.texto));
  if (verdadera !== undefined) return verdadera.correcta ? 'V' : 'F';
  // Sin etiqueta clara: si hay exactamente una correcta, no podemos saber cuál es V/F → undefined.
  return undefined;
}
