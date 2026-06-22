import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatosInstitucionalesGuia, Ficha } from '@faro/domain';
import { FichaExportAdapter } from './FichaExportAdapter.js';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as never;
const inst: DatosInstitucionalesGuia = { nombreColegio: 'Escuela X', comuna: 'Conchalí' };
const ficha: Ficha = {
  asignatura: 'Matemática',
  curso: '1º básico',
  oa: { codigo: 'MA01 OA 01', descripcion: 'Contar.' },
  concepto: 'frutas',
  perfil_nivel: '1-2',
  titulo: 'Ficha para colorear: frutas',
  consigna_dibujo: 'Colorea el dibujo.',
  ejercicios: [{ oa: 'MA01 OA 01', habilidad: 'recordar', tipo: 'completacion', enunciado: 'Cuenta: 1, 2, ____.' }],
  descripcion_dibujo: 'Three apples',
  imagen_clave: 'clave-test',
};

describe('FichaExportAdapter.aDocx', () => {
  it('escribe un .docx no vacío con placeholder cuando falta el PNG', async () => {
    const dirSalida = await mkdtemp(join(tmpdir(), 'faro-ficha-out-'));
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-ficha-banco-'));
    const adapter = new FichaExportAdapter(dirSalida, log, dirBanco);

    const archivo = await adapter.aDocx(ficha, inst);
    const bytes = await readFile(archivo.ruta);
    expect(bytes.length).toBeGreaterThan(0);
    expect(archivo.ruta).toContain('ficha-frutas');
  });

  it('resuelve el PNG del banco cuando existe (conImagen=true en el log)', async () => {
    const dirSalida = await mkdtemp(join(tmpdir(), 'faro-ficha-out-'));
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-ficha-banco-'));
    await mkdir(dirBanco, { recursive: true });
    // PNG mínimo válido (cabecera) — el adapter solo lo lee como Buffer.
    await writeFile(join(dirBanco, 'clave-test.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const adapter = new FichaExportAdapter(dirSalida, log, dirBanco);
    const archivo = await adapter.aDocx(ficha, inst);
    expect(archivo.bytes).toBeGreaterThan(0);
  });
});
