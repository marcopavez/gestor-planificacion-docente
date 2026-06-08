// packages/infra-export/src/docx/plano.ts
// Layout intermedio (IR) del documento de planificación: una representación PURA y testeable que se
// deriva 1:1 de la `definicion` de la plantilla activa (calca las tablas del PDF real — RF-2.9/2.11).
// El render a .docx (DocxExportAdapter) y a .pdf (PdfExportAdapter) consumen este mismo IR; los tests
// asertan sobre el IR (secciones/orden/contenido) sin tener que descomprimir el .docx.
//
// REGLA "no inventar estructuras" (RF-2.11): las secciones del IR son EXACTAMENTE las de la plantilla
// (mismas claves, mismo orden); no se agrega ninguna sección que no esté en el preset.

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
  | {
      readonly tipo: 'checkbox_matriz';
      readonly columnas: ReadonlyArray<{ titulo: string; opciones: readonly OpcionCheck[] }>;
    }
  // Formato A: OA agrupados (Basal/Complementario/Transversal) — columnas [Categoría, Código, OA].
  | {
      readonly tipo: 'tabla_oa_a';
      readonly filas: ReadonlyArray<{ categoria: string; codigo: string; descripcion: string }>;
    }
  // Formato B: una fila por OA — columnas [OA Priorizado, Habilidades, Experiencias, Evaluación].
  | {
      readonly tipo: 'tabla_oa_b';
      readonly filas: ReadonlyArray<{
        oa: string;
        habilidades: string;
        experiencias: readonly string[];
        evaluacion: readonly string[];
      }>;
    };

export interface SeccionPlano {
  readonly clave: string;
  readonly titulo: string;
  readonly bloques: readonly BloquePlano[];
}

export interface DocumentoPlano {
  readonly titulo: string;
  readonly secciones: readonly SeccionPlano[];
}

const TIPOS_ESCALARES = new Set(['encabezado', 'texto', 'numero', 'fecha']);
// Orden de presentación de las categorías de OA en el Formato A.
const ORDEN_CATEGORIA = ['basal', 'complementario', 'transversal', 'priorizado'];

/** Construye el IR del documento a partir del plan, la plantilla activa y los catálogos. */
export function planoDocumento(
  plan: PlanificacionUnidad,
  plantilla: PlantillaPlanificacion,
  catalogos: CatalogosPlanificacion,
): DocumentoPlano {
  const secciones = [...plantilla.secciones]
    .sort((a, b) => a.orden - b.orden)
    .map((seccion) => bloquesDeSeccion(plan, seccion, catalogos));
  return { titulo: plantilla.nombre, secciones };
}

function bloquesDeSeccion(
  plan: PlanificacionUnidad,
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

    // Corre de checkbox_set consecutivos. Solo se renderiza como matriz multi-columna si la SECCIÓN
    // lo declara (layout='matriz', p. ej. la Diversificación); si no, cada set se apila por separado
    // (no se inventa una matriz por mera adyacencia — RF-2.11; la Evaluación apila sus checkbox_set).
    if (campo.tipo === 'checkbox_set') {
      const columnas: Array<{ titulo: string; opciones: OpcionCheck[] }> = [];
      while (i < campos.length && campos[i] !== undefined && campos[i]!.tipo === 'checkbox_set') {
        const c = campos[i]!;
        columnas.push({ titulo: c.etiqueta, opciones: opcionesCheck(plan, c, catalogos) });
        i++;
      }
      if (seccion.layout === 'matriz' && columnas.length > 1) {
        bloques.push({ tipo: 'checkbox_matriz', columnas });
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
      bloques.push(plan.plantilla === 'B' ? tablaOaB(plan) : tablaOaA(plan));
      i++;
      continue;
    }

    i++; // tipo no renderizable: lo saltamos sin romper el orden
  }

  return { clave: seccion.clave, titulo: seccion.titulo, bloques };
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
  const filas = [...plan.oa]
    .sort((a, b) => indiceCategoria(a.categoria) - indiceCategoria(b.categoria))
    .map((o) => ({ categoria: capitalizar(o.categoria), codigo: o.codigo, descripcion: o.descripcion }));
  return { tipo: 'tabla_oa_a', filas };
}

function tablaOaB(plan: PlanificacionUnidad): BloquePlano {
  // Las experiencias son a nivel de bloque (no por OA): se muestran en la primera fila para no
  // repetirlas; la columna existe en todas las filas (4 columnas — CA-2.2).
  const filas = plan.oa.map((o, idx) => ({
    oa: `${o.codigo}: ${o.descripcion}`,
    habilidades: o.habilidades.length > 0 ? o.habilidades.join(', ') : '—',
    experiencias: idx === 0 ? plan.experiencias : [],
    evaluacion: plan.indicadores_evaluacion.filter((ind) => ind.oa === o.codigo).map((ind) => ind.texto),
  }));
  return { tipo: 'tabla_oa_b', filas };
}

function indiceCategoria(cat: string): number {
  const i = ORDEN_CATEGORIA.indexOf(cat);
  return i === -1 ? ORDEN_CATEGORIA.length : i;
}

function capitalizar(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function formatearEscalar(v: string | number | undefined): string {
  if (v === undefined) return '';
  return typeof v === 'number' ? String(v) : v;
}
