// packages/application/src/aula/cascada/resolverIlustraciones.ts
// Helper compartido por los ProcesarTrabajo* (prueba/guía/PPT): resuelve la `imagen` (descripción anclada)
// de cada ítem/slide a su `imagen_clave` (PNG line-art cacheado) vía ResolverIlustracionUseCase. Va como
// PASO del job, FUERA de la transacción (la generación de imágenes hace red/IO). Degrada: si el resolver
// devuelve null (sin API key), el ítem/slide NO gana imagen_clave y el export usa el placeholder.
// INV-5: importa SOLO de @faro/domain y hermanos ./ — nunca @faro/infra-*.

import type { ItemPruebaType, SlideDeckType } from '@faro/domain';
import type { ResolverIlustracionUseCase } from './ResolverIlustracionUseCase.js';

/** Resuelve la ilustración de cada ítem PICTÓRICO con `imagen` no vacía → le añade `imagen_clave`. Resto: sin cambios. */
export async function resolverIlustracionesItems(
  items: readonly ItemPruebaType[],
  oaCodigo: string,
  ilustrador: ResolverIlustracionUseCase,
): Promise<ItemPruebaType[]> {
  return Promise.all(
    items.map(async (it) => {
      // Sólo ítems pictóricos: el export (Prueba/Guia)ExportAdapter.inyectarImagenes incrusta sólo
      // tipo==='pictorico', así que resolver otro tipo gastaría una generación cuyo PNG nunca se usa.
      if (it.tipo !== 'pictorico' || it.imagen === undefined || it.imagen.trim() === '') return it;
      const clave = await ilustrador.resolver(it.imagen, oaCodigo);
      return clave !== null ? { ...it, imagen_clave: clave } : it;
    }),
  );
}

/** Resuelve la ilustración de cada slide con `imagen` no vacía → le añade `imagen_clave`. Resto: sin cambios. */
export async function resolverIlustracionesSlides(
  slides: readonly SlideDeckType[],
  oaCodigo: string,
  ilustrador: ResolverIlustracionUseCase,
): Promise<SlideDeckType[]> {
  return Promise.all(
    slides.map(async (s) => {
      if (s.imagen === undefined || s.imagen.trim() === '') return s;
      const clave = await ilustrador.resolver(s.imagen, oaCodigo);
      return clave !== null ? { ...s, imagen_clave: clave } : s;
    }),
  );
}
