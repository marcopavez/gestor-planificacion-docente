// packages/infra-ai/src/gemini/promptLineArt.ts
// Template de line-art B&N para colorear (spec §3), COMPARTIDO por ambos adapters (Imagen + Flash).
// La {descripcion} debe venir EN INGLÉS (la produce Claude). La restricción legal (sin personajes con
// copyright/marca) la fija quien redacta la descripción, no este template.

/** Envuelve la descripción (en inglés) en el prompt de line-art para niños. */
export function construirPromptLineArt(descripcion: string): string {
  return `Black and white line art coloring page, thick clean outlines, simple shapes, no shading, no text, suitable for young children: ${descripcion}`;
}
