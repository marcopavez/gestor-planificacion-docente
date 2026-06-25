// Unit del export .docx de la GUÍA del alumno — banco de imágenes (PNG line-art por imagen_clave).
// Espejo del test de PruebaExportAdapter: el adapter resuelve <dirBanco>/<clave>.png e inyecta el PNG en
// el IR (vía renderItemAlumno/imagenOPlaceholder, Task 12). Sin red: descomprime el .docx leyendo el
// directorio central del zip (sin libs externas) para descubrir si embebe word/media/.

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatosInstitucionalesGuia, Guia } from '@faro/domain';
import { crearLoggerHijo } from '@faro/observability';
import { GuiaExportAdapter } from './GuiaExportAdapter.js';

const log = crearLoggerHijo('infra-export-guia-test');
const inst: DatosInstitucionalesGuia = { nombreColegio: 'Escuela X', comuna: 'Conchalí' };

const guiaBase: Guia = {
  asignatura: 'Ciencias Naturales',
  curso: '3º básico',
  oa: { codigo: 'CN03 OA 01', descripcion: 'Observar seres vivos.' },
  conocimiento: 'Los seres vivos',
  perfil_nivel: '3-4',
  titulo: 'Guía: Los seres vivos',
  explicacion: 'Los seres vivos nacen y crecen.',
  ejemplo: 'Un perro crece.',
  ejercicios: [
    { oa: 'CN03 OA 01', habilidad: 'recordar', tipo: 'pictorico', enunciado: '¿Cuántas hojas ves?', imagen: 'cuatro hojas', imagen_clave: 'beef5678' },
  ],
};

/** Lista los nombres de todas las entradas del zip (.docx) — para descubrir si embebe word/media/. */
function entradasDocx(buf: Buffer): string[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip sin EOCD');
  let off = buf.readUInt32LE(eocd + 16);
  const total = buf.readUInt16LE(eocd + 10);
  const nombres: string[] = [];
  for (let n = 0; n < total; n++) {
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    nombres.push(buf.toString('utf8', off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return nombres;
}

describe('GuiaExportAdapter.aDocx (imágenes)', () => {
  it('embebe el PNG del banco cuando un ejercicio pictórico trae imagen_clave', async () => {
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-guia-banco-'));
    await writeFile(join(dirBanco, 'beef5678.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const dirSalida = await mkdtemp(join(tmpdir(), 'faro-guia-out-'));
    const adapter = new GuiaExportAdapter(dirSalida, log, dirBanco);

    const archivo = await adapter.aDocx(guiaBase, inst);
    const media = entradasDocx(await readFile(archivo.ruta)).filter((e) => /^word\/media\/.+/.test(e));
    expect(media.length).toBeGreaterThan(0);
  });

  it('cae al placeholder cuando falta el PNG', async () => {
    const dirBanco = await mkdtemp(join(tmpdir(), 'faro-guia-banco-')); // vacío
    const dirSalida = await mkdtemp(join(tmpdir(), 'faro-guia-out-'));
    const adapter = new GuiaExportAdapter(dirSalida, log, dirBanco);

    const archivo = await adapter.aDocx(guiaBase, inst);
    const buf = await readFile(archivo.ruta);
    expect(buf.length).toBeGreaterThan(0); // sale igual, con placeholder
    expect(entradasDocx(buf).filter((e) => /^word\/media\/.+/.test(e))).toEqual([]); // sin imagen embebida
  });
});
