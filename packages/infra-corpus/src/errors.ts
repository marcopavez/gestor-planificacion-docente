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
