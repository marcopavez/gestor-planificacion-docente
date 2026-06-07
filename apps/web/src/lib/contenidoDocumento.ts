// apps/web/src/lib/contenidoDocumento.ts
// Unifica cómo se expone el contenido de un documento a la UI. El clase_deck persiste su payload
// como { deck: ClaseDeck, pptx }; tanto la superficie de generación como la de revisión exponen el
// ClaseDeck plano (.slides/.titulo). El resto de tipos exponen su payload tal cual.

export function contenidoParaUi(tipo: string, contenido: unknown): unknown {
  if (tipo === 'clase_deck') {
    return (contenido as { deck?: unknown } | null)?.deck ?? null;
  }
  return contenido ?? null;
}
