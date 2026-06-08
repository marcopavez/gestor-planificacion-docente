// packages/infra-export/src/docx/PdfExportAdapter.ts
// H-2.6 · Export a .pdf de la Planificación de Unidad (RF-2.10, INV-6). El .pdf es el .docx RENDERIZADO
// por LibreOffice headless (cero divergencia con el .docx — decisión del dueño 2026-06-07): primero
// genera el .docx (DocxExportAdapter) y luego `soffice --headless --convert-to pdf`.
//
// El binario se resuelve desde SOFFICE_PATH o el PATH. Si no está disponible, lanza
// MotorPdfNoDisponibleError (typed): la web puede seguir entregando el .docx; el worker NO depende de
// esto (el export es bajo demanda en la web, no en la generación).

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type {
  ArchivoExportado,
  CatalogosPlanificacion,
  PlanificacionUnidad,
  PlantillaPlanificacion,
} from '@faro/domain';
import type { Logger } from '@faro/observability';
import { DocxExportAdapter } from './DocxExportAdapter.js';

const execFileP = promisify(execFile);

export const MIME_PDF = 'application/pdf';

/** No hay un binario de LibreOffice (soffice) disponible para convertir .docx → .pdf. */
export class MotorPdfNoDisponibleError extends Error {
  constructor() {
    super(
      'No se encontró LibreOffice (soffice) para convertir a PDF. Instálalo o define SOFFICE_PATH; ' +
        'el documento .docx sigue disponible.',
    );
    this.name = 'MotorPdfNoDisponibleError';
  }
}

// Candidatos de nombre del binario (Windows usa soffice.com/.exe; *nix soffice/libreoffice).
const CANDIDATOS = ['soffice', 'soffice.exe', 'soffice.com', 'libreoffice', 'libreoffice.exe'];

/** Resuelve el binario de soffice desde SOFFICE_PATH o el PATH; null si no existe. */
export function resolverSofficeBin(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicito = env['SOFFICE_PATH'];
  if (explicito !== undefined && explicito.length > 0 && existsSync(explicito)) return explicito;

  const dirs = (env['PATH'] ?? '').split(delimiter).filter((d) => d.length > 0);
  for (const dir of dirs) {
    for (const nombre of CANDIDATOS) {
      const ruta = join(dir, nombre);
      if (existsSync(ruta)) return ruta;
    }
  }
  return null;
}

/**
 * Comando + args para convertir un .docx a .pdf con LibreOffice headless. Testeable sin ejecutar.
 * `profileDir` (opcional) aísla el perfil de usuario de LibreOffice por invocación: sin él, dos
 * conversiones concurrentes comparten perfil y una falla por el lock del perfil.
 */
export function construirComandoSoffice(
  bin: string,
  docxPath: string,
  outDir: string,
  profileDir?: string,
): { bin: string; args: string[] } {
  const perfil = profileDir !== undefined ? [`-env:UserInstallation=${pathToFileURL(profileDir).href}`] : [];
  return { bin, args: ['--headless', '--norestore', ...perfil, '--convert-to', 'pdf', '--outdir', outDir, docxPath] };
}

/** Ruta del .pdf que LibreOffice escribe (mismo basename del .docx, extensión .pdf, en outDir). */
export function rutaPdfEsperada(outDir: string, docxPath: string): string {
  const base = basename(docxPath).replace(/\.docx$/i, '');
  return join(outDir, `${base}.pdf`);
}

export class PdfExportAdapter {
  private readonly docx: DocxExportAdapter;

  constructor(
    private readonly dirSalida: string,
    private readonly log: Logger,
    docx?: DocxExportAdapter,
  ) {
    this.docx = docx ?? new DocxExportAdapter(dirSalida, this.log);
  }

  async aPdf(
    plan: PlanificacionUnidad,
    plantilla: PlantillaPlanificacion,
    catalogos: CatalogosPlanificacion,
    idDocumento?: string,
  ): Promise<ArchivoExportado> {
    const bin = resolverSofficeBin();
    if (bin === null) throw new MotorPdfNoDisponibleError();

    // El .pdf es el .docx renderizado: generamos el .docx primero (cero divergencia).
    const docx = await this.docx.aDocx(plan, plantilla, catalogos, idDocumento);

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
      this.log.info({ ruta, bytes: size }, 'export.pdf');
      return { ruta, mime: MIME_PDF, bytes: size };
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}
