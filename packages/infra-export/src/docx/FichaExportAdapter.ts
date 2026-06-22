// packages/infra-export/src/docx/FichaExportAdapter.ts
// Renderiza la FICHA para colorear a .docx y .pdf. Implementa ExportFichaPort. Espejo de LaminaExportAdapter:
// resuelve el PNG line-art del banco generado por `ficha.imagen_clave`; si falta, pasa null → placeholder.

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Document, Packer } from 'docx';
import type { ArchivoExportado, DatosInstitucionalesGuia, ExportFichaPort, Ficha } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { MIME_DOCX } from './DocxExportAdapter.js';
import {
  MIME_PDF,
  MotorPdfNoDisponibleError,
  construirComandoSoffice,
  resolverSofficeBin,
  rutaPdfEsperada,
} from './PdfExportAdapter.js';
import { planoFicha, type FichaPlano } from './planoFicha.js';
import { construirDocumentoFicha } from './construirDocumentoFicha.js';

const execFileP = promisify(execFile);

function nombreArchivoFicha(ficha: Ficha, idDocumento?: string): string {
  const sufijo = idDocumento !== undefined ? `-${idDocumento}` : '';
  // El 'concepto' es texto libre: se acota el slug para no romper MAX_PATH (260) en Windows.
  const cuerpo = `${ficha.concepto}-${ficha.curso}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `ficha-${cuerpo.length > 0 ? cuerpo : 'colorear'}${sufijo}`;
}

export class FichaExportAdapter implements ExportFichaPort {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    private readonly dirBanco: string,
  ) {}

  private async resolverImagen(ficha: Ficha): Promise<Buffer | null> {
    const ruta = join(this.dirBanco, `${ficha.imagen_clave}.png`);
    if (!existsSync(ruta)) return null;
    return readFile(ruta);
  }

  async aDocx(ficha: Ficha, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const plano: FichaPlano = planoFicha(ficha, inst);
    const imagenPng = await this.resolverImagen(ficha);
    const doc: Document = construirDocumentoFicha(plano, imagenPng);
    const data = await Packer.toBuffer(doc);

    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${nombreArchivoFicha(ficha, idDocumento)}.docx`);
    await writeFile(ruta, data);

    this.log.info({ ruta, bytes: data.length, conImagen: imagenPng !== null }, 'export.ficha.docx');
    return { ruta, mime: MIME_DOCX, bytes: data.length };
  }

  async aPdf(ficha: Ficha, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const bin = resolverSofficeBin();
    if (bin === null) throw new MotorPdfNoDisponibleError();

    // El .pdf es el .docx renderizado (cero divergencia — misma decisión que LaminaExportAdapter).
    const docx = await this.aDocx(ficha, inst, idDocumento);

    // Perfil de usuario aislado por invocación → conversiones concurrentes no chocan por el lock.
    const profileDir = await mkdtemp(join(tmpdir(), 'faro-soffice-'));
    try {
      const { args } = construirComandoSoffice(bin, docx.ruta, this.dirSalida, profileDir);
      await execFileP(bin, args, { timeout: 120_000 });
      const ruta = rutaPdfEsperada(this.dirSalida, docx.ruta);
      if (!existsSync(ruta)) throw new Error(`LibreOffice no produjo el PDF esperado en ${ruta}.`);
      const { size } = await stat(ruta);
      this.log.info({ ruta, bytes: size }, 'export.ficha.pdf');
      return { ruta, mime: MIME_PDF, bytes: size };
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}
