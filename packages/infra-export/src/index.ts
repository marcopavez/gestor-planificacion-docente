// packages/infra-export/src/index.ts
// Paquete @faro/infra-export: adapters de exportación de documentos (.pptx, luego .docx).
// INV-5/INV-6: implementa ExportPort de @faro/domain; la composition root (DI) vive en apps/*.

export { PptxExportAdapter, MIME_PPTX } from './pptx/PptxExportAdapter.js';

// --- Export de la Planificación de Unidad a .docx (H-2.5) ---
export { DocxExportAdapter, construirDocumento, MIME_DOCX } from './docx/DocxExportAdapter.js';
export { planoDocumento } from './docx/plano.js';
export type { DocumentoPlano, SeccionPlano, BloquePlano, OpcionCheck } from './docx/plano.js';

// --- Export a .pdf (H-2.6): .docx → PDF vía LibreOffice headless ---
export {
  PdfExportAdapter,
  MotorPdfNoDisponibleError,
  MIME_PDF,
  resolverSofficeBin,
  construirComandoSoffice,
  rutaPdfEsperada,
} from './docx/PdfExportAdapter.js';

// --- Export de la Prueba formativa a .docx/.pdf (Fase 4): variante alumno o pauta ---
export { PruebaExportAdapter, construirDocumentoPrueba } from './docx/PruebaExportAdapter.js';
export { planoPrueba } from './docx/planoPrueba.js';
export type { PruebaPlano, SeccionPruebaPlano, ItemPlano, EncabezadoPlano } from './docx/planoPrueba.js';

// --- Export de la Guía del alumno a .docx/.pdf (Tanda 1, INV-6) ---
export { GuiaExportAdapter } from './docx/GuiaExportAdapter.js';
export { planoGuia } from './docx/planoGuia.js';
export type { GuiaPlano, EncabezadoGuiaPlano } from './docx/planoGuia.js';
