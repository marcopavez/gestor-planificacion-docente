// Integridad del corpus file-based (CA-1.1): todos los archivos del manifiesto parsean contra
// el schema, el conteo declarado coincide con el real, y el archivo de catálogos valida contra
// el schema del dominio. Sin red (INV-1). Es la red de seguridad de los datos curados.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaArchivoCatalogos } from '@faro/domain';
import { describe, expect, it } from 'vitest';
import { ArchivoCorpusSchema, ManifiestoSchema } from './schemas.js';

const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'corpus');

function leerJson(...segmentos: string[]): unknown {
  return JSON.parse(readFileSync(join(CORPUS_DIR, ...segmentos), 'utf8')) as unknown;
}

describe('Integridad del corpus (CA-1.1)', () => {
  const manifiesto = ManifiestoSchema.parse(leerJson('curriculum', '_manifest.json'));

  it('el manifiesto declara al menos un bloque y una versión', () => {
    expect(manifiesto.version.length).toBeGreaterThan(0);
    expect(manifiesto.bloques.length).toBeGreaterThan(0);
  });

  // Un caso por bloque: nombre del archivo como etiqueta para localizar fallos al instante.
  it.each(manifiesto.bloques.map((b) => [b.archivo, b] as const))(
    'el archivo %s parsea y su conteo de OA coincide con el manifiesto',
    (_archivo, bloque) => {
      const archivo = ArchivoCorpusSchema.parse(leerJson('curriculum', bloque.archivo));
      expect(archivo.objetivos_aprendizaje.length).toBe(bloque.oa);
    },
  );

  it('los códigos de OA son únicos dentro de cada archivo', () => {
    for (const bloque of manifiesto.bloques) {
      const archivo = ArchivoCorpusSchema.parse(leerJson('curriculum', bloque.archivo));
      const codigos = archivo.objetivos_aprendizaje.map((oa) => oa.codigo);
      expect(new Set(codigos).size, `códigos duplicados en ${bloque.archivo}`).toBe(codigos.length);
    }
  });

  it('corpus/catalogos/planificacion.json valida contra SchemaArchivoCatalogos (RF-2.6)', () => {
    const r = SchemaArchivoCatalogos.safeParse(leerJson('catalogos', 'planificacion.json'));
    expect(r.success).toBe(true);
  });
});
