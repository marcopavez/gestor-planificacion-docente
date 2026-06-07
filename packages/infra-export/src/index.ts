// packages/infra-export/src/index.ts
// Paquete @faro/infra-export: adapters de exportación de documentos (.pptx, luego .docx).
// INV-5/INV-6: implementa ExportPort de @faro/domain; la composition root (DI) vive en apps/*.

export { PptxExportAdapter } from './pptx/PptxExportAdapter.js';

// TODO RF-2.17 (H-2.10): DocxExportAdapter (prueba/planificación) + plantillas configurables.
