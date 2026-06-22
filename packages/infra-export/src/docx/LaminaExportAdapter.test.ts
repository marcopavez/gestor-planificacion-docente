import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Lamina } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { LaminaExportAdapter } from './LaminaExportAdapter.js';
import { construirDocumentoLamina } from './construirDocumentoLamina.js';
import { planoLamina } from './planoLamina.js';
import { Packer } from 'docx';

const LAMINA: Lamina = {
  asignatura: 'Matemática',
  curso: '1° básico',
  oa: { codigo: 'MA01 OA 01', descripcion: 'Contar…' },
  concepto: 'conteo',
  titulo: 'Para colorear: conteo',
  consigna: 'Pinta el dibujo.',
  descripcion_dibujo: 'ten apples',
  imagen_clave: 'clave1',
};

// 1x1 PNG transparente (válido para ImageRun).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('construirDocumentoLamina', () => {
  it('produce un Document no vacío con imagen', async () => {
    const doc = construirDocumentoLamina(planoLamina(LAMINA, { nombreColegio: 'C', comuna: 'S' }), PNG_1x1);
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });
  it('produce un Document no vacío con placeholder (sin imagen)', async () => {
    const doc = construirDocumentoLamina(planoLamina(LAMINA, { nombreColegio: 'C', comuna: 'S' }), null);
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });
});

describe('LaminaExportAdapter.aDocx', () => {
  let dirSalida: string;
  let dirBanco: string;
  beforeEach(async () => {
    dirSalida = await mkdtemp(join(tmpdir(), 'faro-lam-out-'));
    dirBanco = await mkdtemp(join(tmpdir(), 'faro-lam-banco-'));
  });
  afterEach(async () => {
    await rm(dirSalida, { recursive: true, force: true });
    await rm(dirBanco, { recursive: true, force: true });
  });

  it('escribe un .docx usando el PNG del banco cuando existe', async () => {
    await mkdir(dirBanco, { recursive: true });
    await writeFile(join(dirBanco, 'clave1.png'), PNG_1x1);
    const adapter = new LaminaExportAdapter(dirSalida, crearLoggerHijo('test'), dirBanco);
    const archivo = await adapter.aDocx(LAMINA, { nombreColegio: 'C', comuna: 'S' }, 'doc-1');
    expect(archivo.ruta.endsWith('.docx')).toBe(true);
    expect(archivo.bytes).toBeGreaterThan(0);
  });

  it('escribe un .docx con placeholder cuando el PNG no está en el banco', async () => {
    const adapter = new LaminaExportAdapter(dirSalida, crearLoggerHijo('test'), dirBanco);
    const archivo = await adapter.aDocx(LAMINA, { nombreColegio: 'C', comuna: 'S' }, 'doc-2');
    expect(archivo.bytes).toBeGreaterThan(0);
  });
});
