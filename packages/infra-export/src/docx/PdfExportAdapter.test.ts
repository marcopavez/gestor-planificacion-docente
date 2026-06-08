// Unit del export .pdf (H-2.6) — la construcción de comando/args y la resolución del binario corren
// SIEMPRE; la conversión real se skipea si no hay LibreOffice instalado (CI Windows verde). Decisión:
// el .pdf es el .docx renderizado por `soffice --headless`; sin binario → MotorPdfNoDisponibleError.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SchemaArchivoCatalogos,
  SchemaPlantillaPlanificacion,
  type CatalogosPlanificacion,
  type PlanificacionUnidad,
  type PlantillaPlanificacion,
} from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import {
  MotorPdfNoDisponibleError,
  PdfExportAdapter,
  construirComandoSoffice,
  resolverSofficeBin,
  rutaPdfEsperada,
} from './PdfExportAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CORPUS_DIR = join(__dirname, '../../../../corpus');
const log = crearLoggerHijo('infra-export-pdf-test');

const catalogos: CatalogosPlanificacion = SchemaArchivoCatalogos.parse(
  JSON.parse(readFileSync(join(CORPUS_DIR, 'catalogos', 'planificacion.json'), 'utf8')),
).catalogos;
const plantillaA: PlantillaPlanificacion = SchemaPlantillaPlanificacion.parse(
  JSON.parse(readFileSync(join(CORPUS_DIR, 'plantillas', 'bernales-formato-a.json'), 'utf8')),
);

const plan: PlanificacionUnidad = {
  plantilla: 'A',
  establecimiento: 'Escuela General José Alejandro Bernales D-114',
  docente: 'Prof. Demo',
  asignatura: 'Matemática',
  nivel: '1º básico',
  unidad: 'Unidad 1',
  proposito: 'Propósito.',
  duracion_semanas: 6,
  horas_pedagogicas: 36,
  oa: [{ codigo: 'MA01 OA 03', categoria: 'basal', descripcion: 'Leer números del 0 al 20.', habilidades: [] }],
  experiencias: ['Cuentan objetos.'],
  indicadores_evaluacion: [{ oa: 'MA01 OA 03', texto: 'Leen números.', fuente: 'ia_borrador' }],
  evaluacion: { tipo: [], instrumentos: [] },
  extras: {},
};

const tmp = mkdtempSync(join(tmpdir(), 'faro-pdf-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('PdfExportAdapter (H-2.6)', () => {
  it('construye el comando de LibreOffice headless correctamente', () => {
    const { bin, args } = construirComandoSoffice('soffice', '/x/doc.docx', '/x/out');
    expect(bin).toBe('soffice');
    expect(args).toEqual(['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', '/x/out', '/x/doc.docx']);
  });

  it('con un perfil dedicado, aísla el UserInstallation (conversiones concurrentes no chocan)', () => {
    const { args } = construirComandoSoffice('soffice', '/x/doc.docx', '/x/out', '/tmp/perfil');
    const envFlag = args.find((a) => a.startsWith('-env:UserInstallation='));
    expect(envFlag).toBeDefined();
    expect(envFlag).toContain('file:'); // ruta como file:// URL
  });

  it('deriva la ruta del .pdf desde el .docx (mismo basename, en outDir)', () => {
    expect(rutaPdfEsperada('/x/out', '/a/b/planificacion-mate.docx')).toBe(join('/x/out', 'planificacion-mate.pdf'));
  });

  it('resolverSofficeBin: usa SOFFICE_PATH si apunta a un archivo existente; null si el PATH no lo trae', () => {
    expect(resolverSofficeBin({ SOFFICE_PATH: __filename } as NodeJS.ProcessEnv)).toBe(__filename);
    expect(resolverSofficeBin({ PATH: '' } as NodeJS.ProcessEnv)).toBeNull();
  });

  // Sin LibreOffice instalado: aPdf debe lanzar el error tipado (el .docx sigue disponible).
  it.skipIf(resolverSofficeBin() !== null)('lanza MotorPdfNoDisponibleError si no hay binario', async () => {
    const adapter = new PdfExportAdapter(tmp, log);
    await expect(adapter.aPdf(plan, plantillaA, catalogos)).rejects.toBeInstanceOf(MotorPdfNoDisponibleError);
  });

  // Con LibreOffice instalado: convierte de verdad y el .pdf pesa > 0.
  it.skipIf(resolverSofficeBin() === null)('convierte el .docx a un .pdf real (> 0 bytes)', async () => {
    const adapter = new PdfExportAdapter(tmp, log);
    const pdf = await adapter.aPdf(plan, plantillaA, catalogos);
    expect(pdf.mime).toBe('application/pdf');
    expect(pdf.bytes).toBeGreaterThan(0);
    expect(pdf.ruta.endsWith('.pdf')).toBe(true);
  }, 120_000);
});
