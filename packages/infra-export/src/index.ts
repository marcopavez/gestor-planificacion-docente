// packages/infra-export/src/index.ts
// Paquete @faro/infra-export: adapters de exportación de documentos (.pptx, luego .docx).
// INV-5/INV-6: implementa ExportPort de @faro/domain; la composition root (DI) vive en apps/*.

export { PptxExportAdapter } from './pptx/PptxExportAdapter.js';

// --- Export de la Planificación de Unidad a .docx (H-2.5) ---
export { DocxExportAdapter, construirDocumento, MIME_DOCX } from './docx/DocxExportAdapter.js';
export { planoDocumento } from './docx/plano.js';
export type { DocumentoPlano, SeccionPlano, BloquePlano, OpcionCheck } from './docx/plano.js';
