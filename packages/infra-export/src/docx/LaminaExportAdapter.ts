// packages/infra-export/src/docx/LaminaExportAdapter.ts
// Renderiza la LÁMINA para colorear a .docx y .pdf. Implementa ExportLaminaPort. Espejo de
// GuiaExportAdapter: misma estructura aDocx/aPdf, mismos helpers soffice, perfil temporal aislado.
// Resuelve el PNG line-art del banco generado por lamina.imagen_clave (<dirBanco>/<clave>.png); si
// falta (sin API key / aún no generado), pasa null → el documento sale con placeholder.

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Document, Packer } from 'docx';
import type { ArchivoExportado, DatosInstitucionalesGuia, ExportLaminaPort, Lamina } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { MIME_DOCX } from './DocxExportAdapter.js';
import {
  MIME_PDF,
  MotorPdfNoDisponibleError,
  construirComandoSoffice,
  resolverSofficeBin,
  rutaPdfEsperada,
} from './PdfExportAdapter.js';
import { planoLamina, type LaminaPlano } from './planoLamina.js';
import { construirDocumentoLamina } from './construirDocumentoLamina.js';

const execFileP = promisify(execFile);

function nombreArchivoLamina(lamina: Lamina, idDocumento?: string): string {
  const sufijo = idDocumento !== undefined ? `-${idDocumento}` : '';
  // El 'concepto' es texto libre: se acota el slug para no romper MAX_PATH (260) en Windows.
  const cuerpo = `${lamina.concepto}-${lamina.curso}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `lamina-${cuerpo.length > 0 ? cuerpo : 'colorear'}${sufijo}`;
}

export class LaminaExportAdapter implements ExportLaminaPort {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    private readonly dirBanco: string,
  ) {}

  private async resolverImagen(lamina: Lamina): Promise<Buffer | null> {
    const ruta = join(this.dirBanco, `${lamina.imagen_clave}.png`);
    if (!existsSync(ruta)) return null;
    return readFile(ruta);
  }

  async aDocx(lamina: Lamina, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const plano: LaminaPlano = planoLamina(lamina, inst);
    const imagenPng = await this.resolverImagen(lamina);
    const doc: Document = construirDocumentoLamina(plano, imagenPng);
    const data = await Packer.toBuffer(doc);

    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${nombreArchivoLamina(lamina, idDocumento)}.docx`);
    await writeFile(ruta, data);

    this.log.info({ ruta, bytes: data.length, conImagen: imagenPng !== null }, 'export.lamina.docx');
    return { ruta, mime: MIME_DOCX, bytes: data.length };
  }

  async aPdf(lamina: Lamina, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const bin = resolverSofficeBin();
    if (bin === null) throw new MotorPdfNoDisponibleError();

    // El .pdf es el .docx renderizado (cero divergencia — misma decisión que GuiaExportAdapter).
    const docx = await this.aDocx(lamina, inst, idDocumento);

    // Perfil de usuario aislado por invocación → conversiones concurrentes no chocan por el lock.
    const profileDir = await mkdtemp(join(tmpdir(), 'faro-soffice-'));
    try {
      const { args } = construirComandoSoffice(bin, docx.ruta, this.dirSalida, profileDir);
      await execFileP(bin, args, { timeout: 120_000 });
      const ruta = rutaPdfEsperada(this.dirSalida, docx.ruta);
      if (!existsSync(ruta)) throw new Error(`LibreOffice no produjo el PDF esperado en ${ruta}.`);
      const { size } = await stat(ruta);
      this.log.info({ ruta, bytes: size }, 'export.lamina.pdf');
      return { ruta, mime: MIME_PDF, bytes: size };
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}
