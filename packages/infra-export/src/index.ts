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

// --- Cache file-backed del banco de imágenes generadas (material para colorear, Fase 5) ---
export { BancoImagenesFsAdapter } from './imagenes/BancoImagenesFsAdapter.js';

// --- Export de la Lámina para colorear a .docx/.pdf (Plan 1, Fase 5) ---
export { planoLamina } from './docx/planoLamina.js';
export type { LaminaPlano } from './docx/planoLamina.js';
export { construirDocumentoLamina } from './docx/construirDocumentoLamina.js';
export { LaminaExportAdapter } from './docx/LaminaExportAdapter.js';

// --- Export de la Ficha educativa para colorear a .docx/.pdf (Plan 2, Fase 5) ---
export { planoFicha } from './docx/planoFicha.js';
export type { FichaPlano } from './docx/planoFicha.js';
export { construirDocumentoFicha } from './docx/construirDocumentoFicha.js';
export { FichaExportAdapter } from './docx/FichaExportAdapter.js';
