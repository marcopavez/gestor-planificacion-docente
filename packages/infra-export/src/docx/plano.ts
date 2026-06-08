// packages/infra-export/src/docx/plano.ts
// Layout intermedio (IR) del documento de planificación: una representación PURA y testeable que se
// deriva 1:1 de la `definicion` de la plantilla activa (calca las tablas del PDF real — RF-2.9/2.11).
// El render a .docx (DocxExportAdapter) y a .pdf (PdfExportAdapter) consumen este mismo IR; los tests
// asertan sobre el IR (secciones/orden/contenido/LOOK) sin tener que descomprimir el .docx.
//
// REGLA "no inventar estructuras" (RF-2.11): las secciones del IR son EXACTAMENTE las de la plantilla
// (mismas claves, mismo orden); no se agrega ninguna sección que no esté en el preset.
//
// El LOOK (orientación, sombreados, encabezado institucional, título) es DATA-DRIVEN (RF-2.3): viene
// del bloque `tema` de la plantilla (plantilla.tema / seccion.tema), no hardcodeado por formato.

import type {
  CampoPlantillaType,
  CatalogosPlanificacion,
  ClaveCatalogo,
  PlanificacionUnidad,
  PlantillaPlanificacion,
  SeccionPlantillaType,
} from '@faro/domain';
import { listaCampo, seleccionCheckbox, valorEscalarCampo } from '@faro/domain';

export interface OpcionCheck {
  readonly etiqueta: string;
  readonly marcado: boolean;
}

/** Bloque de contenido renderizable; discriminado por `tipo`. */
export type BloquePlano =
  | { readonly tipo: 'campos'; readonly filas: ReadonlyArray<{ etiqueta: string; valor: string }> }
  | { readonly tipo: 'parrafo'; readonly texto: string }
  | { readonly tipo: 'lista'; readonly items: readonly string[] }
  | { readonly tipo: 'checkbox'; readonly titulo: string; readonly opciones: readonly OpcionCheck[] }
  // Lista numerada en UNA línea (los "Principios DUA" del Formato B: "1 … 2 … 3 …", no checkboxes).
  | { readonly tipo: 'lista_en_linea'; readonly items: readonly string[] }
  | {
      readonly tipo: 'checkbox_matriz';
      readonly columnas: ReadonlyArray<{ titulo: string; opciones: readonly OpcionCheck[] }>;
    }
  // Formato A: OA agrupados por categoría (Basal/Complementario/Transversal). Cada grupo es una fila
  // con la categoría a la izquierda (celda alta, sombreada) y la lista "OAxx: descripción" a la derecha.
  | {
      readonly tipo: 'tabla_oa_a';
      readonly grupos: ReadonlyArray<{
        categoria: string;
        oas: ReadonlyArray<{ codigo: string; descripcion: string }>;
      }>;
    }
  // Formato B: una fila por OA — columnas [OA Priorizado, Habilidades, Experiencias, Evaluación].
  | {
      readonly tipo: 'tabla_oa_b';
      readonly filas: ReadonlyArray<{
        codigo: string; // forma corta (OA3), para mostrar en negrita junto a la descripción
        descripcion: string;
        habilidades: readonly string[];
        experiencias: readonly string[];
        evaluacion: readonly string[];
      }>;
    };

export interface SeccionPlano {
  readonly clave: string;
  readonly titulo: string;
  // false cuando el título de la sección repite el del documento (la sección de encabezado): no se
  // duplica el título arriba de la grilla.
  readonly mostrarTitulo: boolean;
  readonly bandaColor?: string; // sombreado de la banda de título de la sección (crema OA en A)
  readonly cabeceraColor?: string; // sombreado de las cabeceras de tabla/matriz de la sección (naranja B)
  readonly bloques: readonly BloquePlano[];
}

/** Tema VISUAL resuelto del documento (con defaults aplicados). */
export interface TemaPlano {
  readonly orientacion: 'vertical' | 'horizontal';
  readonly header?: {
    readonly izquierda: readonly string[];
    readonly centro: readonly string[];
    readonly derecha: readonly string[];
    readonly bandaColor?: string;
  };
  readonly titulo: readonly string[];
  readonly tituloBanda?: string; // sombreado de la banda full-width tras el título (celeste en A)
  readonly colorEtiqueta?: string; // sombreado de celdas-etiqueta de la grilla del encabezado (crema en A)
  readonly colorCategoria?: string; // sombreado de la columna de categoría de la tabla de OA (celeste en A)
}

export interface DocumentoPlano {
  readonly titulo: string;
  readonly tema: TemaPlano;
  readonly secciones: readonly SeccionPlano[];
}

const TIPOS_ESCALARES = new Set(['encabezado', 'texto', 'numero', 'fecha']);
// Orden de presentación de las categorías de OA en el Formato A.
const ORDEN_CATEGORIA = ['basal', 'complementario', 'transversal', 'priorizado'];
// Etiqueta de la columna de categoría en la tabla de OA del Formato A (verbatim del PDF real).
const ETIQUETA_CATEGORIA: Record<string, string> = {
  basal: 'OA Basal',
  complementario: 'OA Complementarios',
  transversal: 'OA Transversales',
  priorizado: 'OA Priorizados',
};
// Texto del tipo de evaluación en la columna "Evaluación" del Formato B (verbatim del PDF real).
const TEXTO_EVALUACION: Record<string, string> = {
  diagnostica: 'Evaluación Diagnóstica',
  formativa: 'Evaluación Formativa',
  sumativa: 'Evaluación Sumativa',
};

/** Construye el IR del documento a partir del plan, la plantilla activa y los catálogos. */
export function planoDocumento(
  plan: PlanificacionUnidad,
  plantilla: PlantillaPlanificacion,
  catalogos: CatalogosPlanificacion,
): DocumentoPlano {
  const secciones = [...plantilla.secciones]
    .sort((a, b) => a.orden - b.orden)
    .map((seccion) => bloquesDeSeccion(plan, plantilla, seccion, catalogos));
  return { titulo: plantilla.nombre, tema: temaDocumento(plantilla), secciones };
}

/** Resuelve el tema con sus defaults (sin `tema` → vertical, sin membrete, título = nombre). */
function temaDocumento(plantilla: PlantillaPlanificacion): TemaPlano {
  const t = plantilla.tema;
  return {
    orientacion: t?.orientacion ?? 'vertical',
    ...(t?.header !== undefined ? { header: t.header } : {}),
    titulo: t?.titulo ?? [plantilla.nombre],
    ...(t?.tituloBanda !== undefined ? { tituloBanda: t.tituloBanda } : {}),
    ...(t?.colorEtiqueta !== undefined ? { colorEtiqueta: t.colorEtiqueta } : {}),
    ...(t?.colorCategoria !== undefined ? { colorCategoria: t.colorCategoria } : {}),
  };
}

function bloquesDeSeccion(
  plan: PlanificacionUnidad,
  plantilla: PlantillaPlanificacion,
  seccion: SeccionPlantillaType,
  catalogos: CatalogosPlanificacion,
): SeccionPlano {
  const campos = [...seccion.campos].sort((a, b) => a.orden - b.orden);
  const bloques: BloquePlano[] = [];

  let i = 0;
  while (i < campos.length) {
    const campo = campos[i];
    if (campo === undefined) break;

    // Corre de campos escalares consecutivos → una tabla etiqueta/valor (el encabezado, p. ej.).
    if (TIPOS_ESCALARES.has(campo.tipo)) {
      const filas: Array<{ etiqueta: string; valor: string }> = [];
      while (i < campos.length && campos[i] !== undefined && TIPOS_ESCALARES.has(campos[i]!.tipo)) {
        const c = campos[i]!;
        filas.push({ etiqueta: c.etiqueta, valor: formatearEscalar(valorEscalarCampo(plan, c.clave)) });
        i++;
      }
      bloques.push({ tipo: 'campos', filas });
      continue;
    }

    // Corre de checkbox_set consecutivos. El layout de la SECCIÓN decide la disposición:
    //  - 'matriz'         → multi-columna lado a lado (la Diversificación);
    //  - 'lista_en_linea' → numerada en una línea (los Principios DUA del Formato B);
    //  - 'apilado'/ausente→ cada set apilado por separado (la Evaluación; RF-2.11: no se inventa una
    //    matriz por mera adyacencia).
    if (campo.tipo === 'checkbox_set') {
      const columnas: Array<{ titulo: string; opciones: OpcionCheck[] }> = [];
      while (i < campos.length && campos[i] !== undefined && campos[i]!.tipo === 'checkbox_set') {
        const c = campos[i]!;
        columnas.push({ titulo: c.etiqueta, opciones: opcionesCheck(plan, c, catalogos) });
        i++;
      }
      if (seccion.layout === 'matriz' && columnas.length > 1) {
        bloques.push({ tipo: 'checkbox_matriz', columnas });
      } else if (seccion.layout === 'lista_en_linea') {
        for (const c of columnas) {
          bloques.push({ tipo: 'lista_en_linea', items: c.opciones.filter((o) => o.marcado).map((o) => o.etiqueta) });
        }
      } else {
        for (const c of columnas) bloques.push({ tipo: 'checkbox', titulo: c.titulo, opciones: c.opciones });
      }
      continue;
    }

    if (campo.tipo === 'texto_largo') {
      bloques.push({ tipo: 'parrafo', texto: formatearEscalar(valorEscalarCampo(plan, campo.clave)) });
      i++;
      continue;
    }

    if (campo.tipo === 'lista') {
      bloques.push({ tipo: 'lista', items: listaCampo(plan, campo) });
      i++;
      continue;
    }

    if (campo.tipo === 'tabla_oa') {
      // NOTA RF-2.3: la FORMA de la tabla (A agrupada por categoría vs B 4 columnas por OA) se elige por
      // el formato del plan, no por un dato de la plantilla — único branch estructural por formato. Las
      // dos formas consumen dimensiones de datos distintas; hacerlo data-driven (un `variante` en el
      // campo) sería pulido de mantenibilidad, no cambia la salida con los 2 formatos actuales.
      bloques.push(plan.plantilla === 'B' ? tablaOaB(plan) : tablaOaA(plan));
      i++;
      continue;
    }

    i++; // tipo no renderizable: lo saltamos sin romper el orden
  }

  return {
    clave: seccion.clave,
    titulo: seccion.titulo,
    mostrarTitulo: seccion.titulo !== plantilla.nombre,
    ...(seccion.tema?.banda !== undefined ? { bandaColor: seccion.tema.banda } : {}),
    ...(seccion.tema?.cabecera !== undefined ? { cabeceraColor: seccion.tema.cabecera } : {}),
    bloques,
  };
}

function opcionesCheck(
  plan: PlanificacionUnidad,
  campo: CampoPlantillaType,
  catalogos: CatalogosPlanificacion,
): OpcionCheck[] {
  if (campo.catalogo === undefined) return [];
  const marcadas = new Set(seleccionCheckbox(plan, campo));
  return catalogos[campo.catalogo as ClaveCatalogo].map((o) => ({
    etiqueta: o.etiqueta,
    marcado: marcadas.has(o.etiqueta),
  }));
}

function tablaOaA(plan: PlanificacionUnidad): BloquePlano {
  // Agrupa los OA por categoría (en el orden Basal → Complementario → Transversal). Cada grupo es una
  // fila: la categoría a la izquierda (celda alta) y sus OA apilados a la derecha — calca el PDF real
  // (no hay líneas entre los OA de una misma categoría).
  const orden = [...plan.oa].sort((a, b) => indiceCategoria(a.categoria) - indiceCategoria(b.categoria));
  const grupos: Array<{ categoria: string; oas: Array<{ codigo: string; descripcion: string }> }> = [];
  for (const oa of orden) {
    const etiqueta = ETIQUETA_CATEGORIA[oa.categoria] ?? oa.categoria;
    const ultimo = grupos[grupos.length - 1];
    const fila = { codigo: codigoCorto(oa.codigo), descripcion: oa.descripcion };
    if (ultimo !== undefined && ultimo.categoria === etiqueta) ultimo.oas.push(fila);
    else grupos.push({ categoria: etiqueta, oas: [fila] });
  }
  return { tipo: 'tabla_oa_a', grupos };
}

function tablaOaB(plan: PlanificacionUnidad): BloquePlano {
  // La columna "Evaluación" del Formato B muestra el TIPO de evaluación (texto), no los indicadores:
  // el PDF real no tiene columna de indicadores (4 columnas: OA · Habilidades · Experiencias · Eval).
  const evaluacion = plan.evaluacion.tipo.map((t) => TEXTO_EVALUACION[t] ?? t);
  // Las experiencias son a nivel de bloque (no por OA en el modelo de datos): se muestran en la primera
  // fila para no repetirlas. (Experiencias/eval por OA sería una mejora de GENERACIÓN, no de render.)
  return {
    tipo: 'tabla_oa_b',
    filas: plan.oa.map((o, idx) => ({
      codigo: codigoCorto(o.codigo),
      descripcion: o.descripcion,
      habilidades: o.habilidades,
      experiencias: idx === 0 ? plan.experiencias : [],
      evaluacion,
    })),
  };
}

/**
 * Forma CORTA del código de OA para mostrar (solo display; el dato real no se altera): el corpus trae
 * "MA01 OA 03" → "OA3"; "LE03 OA 05" → "OA5"; "OAT 9" → "OAT9"; "OAT25" → "OAT25". Quita el prefijo de
 * asignatura y los ceros a la izquierda.
 */
export function codigoCorto(codigo: string): string {
  const transversal = codigo.match(/OAT\s*0*(\d+)/i);
  if (transversal !== null) return `OAT${transversal[1]}`;
  const normal = codigo.match(/OA\s*0*(\d+)/i);
  if (normal !== null) return `OA${normal[1]}`;
  return codigo.trim();
}

function indiceCategoria(cat: string): number {
  const i = ORDEN_CATEGORIA.indexOf(cat);
  return i === -1 ? ORDEN_CATEGORIA.length : i;
}

function formatearEscalar(v: string | number | undefined): string {
  if (v === undefined) return '';
  return typeof v === 'number' ? String(v) : v;
}
