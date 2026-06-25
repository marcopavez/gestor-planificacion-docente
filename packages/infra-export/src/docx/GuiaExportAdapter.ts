// packages/infra-export/src/docx/GuiaExportAdapter.ts
// Fase Tanda 1 · Renderiza la GUÍA del alumno a .docx y .pdf. Implementa ExportGuiaPort de @faro/domain.
// El layout viene del IR (planoGuia.ts). Espejo de PruebaExportAdapter: misma estructura aDocx/aPdf,
// mismos helpers soffice, mismo manejo de perfil temporal para conversiones concurrentes.

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Document, Packer } from 'docx';
import type { ArchivoExportado, DatosInstitucionalesGuia, ExportGuiaPort, Guia } from '@faro/domain';
import type { Logger } from '@faro/observability';
import { MIME_DOCX } from './DocxExportAdapter.js';
import {
  MIME_PDF,
  MotorPdfNoDisponibleError,
  construirComandoSoffice,
  resolverSofficeBin,
  rutaPdfEsperada,
} from './PdfExportAdapter.js';
import { planoGuia, type GuiaPlano } from './planoGuia.js';
import { construirDocumentoGuia } from './construirDocumentoGuia.js';

const execFileP = promisify(execFile);

/** Nombre de archivo seguro para la guía (sin tildes ni símbolos). `idDocumento` evita colisiones. */
function nombreArchivoGuia(guia: Guia, idDocumento?: string): string {
  const sufijo = idDocumento !== undefined ? `-${idDocumento}` : '';
  // El 'conocimiento' es texto libre de la IA: se acota el slug para no romper MAX_PATH (260) en Windows.
  // El sufijo (id del documento) se mantiene intacto fuera del recorte para no perder unicidad.
  const cuerpo = `${guia.conocimiento}-${guia.curso}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `guia-${cuerpo.length > 0 ? cuerpo : 'guia'}${sufijo}`;
}

export class GuiaExportAdapter implements ExportGuiaPort {
  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    // Banco de PNG generados: cada ejercicio pictórico con `imagen_clave` → <dirBanco>/<clave>.png; si
    // falta, cae al placeholder de texto. Mismo patrón que PruebaExportAdapter/FichaExportAdapter.
    private readonly dirBanco: string,
  ) {}

  /** Resuelve el PNG del banco para cada ejercicio pictórico con `imagenClave` y lo inyecta en el IR. */
  private async inyectarImagenes(plano: GuiaPlano): Promise<GuiaPlano> {
    const ejercicios = await Promise.all(
      plano.ejercicios.map(async (it) => {
        if (it.tipo !== 'pictorico' || it.imagenClave === undefined) return it;
        const ruta = join(this.dirBanco, `${it.imagenClave}.png`);
        if (!existsSync(ruta)) return it;
        return { ...it, imagenPng: await readFile(ruta) };
      }),
    );
    return { ...plano, ejercicios };
  }

  async aDocx(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const planoBase: GuiaPlano = planoGuia(guia, inst);
    const plano = await this.inyectarImagenes(planoBase);
    const doc: Document = construirDocumentoGuia(plano);
    const data = await Packer.toBuffer(doc);

    await mkdir(this.dirSalida, { recursive: true });
    const ruta = join(this.dirSalida, `${nombreArchivoGuia(guia, idDocumento)}.docx`);
    await writeFile(ruta, data);

    this.log.info({ ruta, bytes: data.length, ejercicios: plano.ejercicios.length }, 'export.guia.docx');
    return { ruta, mime: MIME_DOCX, bytes: data.length };
  }

  async aPdf(guia: Guia, inst: DatosInstitucionalesGuia, idDocumento?: string): Promise<ArchivoExportado> {
    const bin = resolverSofficeBin();
    if (bin === null) throw new MotorPdfNoDisponibleError();

    // El .pdf es el .docx renderizado (cero divergencia — misma decisión que PruebaExportAdapter).
    const docx = await this.aDocx(guia, inst, idDocumento);

    // Perfil de usuario aislado por invocación → conversiones concurrentes no chocan por el lock.
    const profileDir = await mkdtemp(join(tmpdir(), 'faro-soffice-'));
    try {
      const { args } = construirComandoSoffice(bin, docx.ruta, this.dirSalida, profileDir);
      await execFileP(bin, args, { timeout: 120_000 });

      const ruta = rutaPdfEsperada(this.dirSalida, docx.ruta);
      if (!existsSync(ruta)) {
        throw new Error(`LibreOffice no produjo el PDF esperado en ${ruta}.`);
      }
      const { size } = await stat(ruta);
      this.log.info({ ruta, bytes: size }, 'export.guia.pdf');
      return { ruta, mime: MIME_PDF, bytes: size };
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}
