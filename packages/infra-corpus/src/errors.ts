// packages/infra-corpus/src/errors.ts
// Errores tipados del adapter de corpus file-based.

/** El par (asignatura, nivel) no existe en el manifiesto del corpus (RF-1.4, CA-1.2). */
export class BloqueCorpusNoEncontradoError extends Error {
  constructor(
    public readonly asignatura: string,
    public readonly nivel: string,
  ) {
    super(
      `No existe un bloque de corpus para (asignatura='${asignatura}', nivel='${nivel}') en el manifiesto. ` +
        `Verifica que la combinación esté curada en corpus/curriculum/_manifest.json.`,
    );
    this.name = 'BloqueCorpusNoEncontradoError';
  }
}

/**
 * Se pidió a `porAsignaturaCurso` una corpus_version que el corpus file-based no puede servir:
 * el adapter expone una sola versión (la del manifiesto) y no guarda histórico (INV-4).
 */
export class CorpusVersionDesconocidaError extends Error {
  constructor(
    public readonly solicitada: string,
    public readonly disponible: string,
  ) {
    super(
      `El corpus file-based solo expone la versión '${disponible}', pero se solicitó '${solicitada}'. ` +
        `Usa porAsignaturaNivel (no exige versión) o la versión vigente.`,
    );
    this.name = 'CorpusVersionDesconocidaError';
  }
}

/** El archivo referenciado por el manifiesto no parsea contra el schema del corpus (RF-1.6). */
export class ArchivoCorpusInvalidoError extends Error {
  constructor(
    public readonly archivo: string,
    public readonly detalle: string,
  ) {
    super(`El archivo de corpus '${archivo}' no es válido: ${detalle}`);
    this.name = 'ArchivoCorpusInvalidoError';
  }
}
