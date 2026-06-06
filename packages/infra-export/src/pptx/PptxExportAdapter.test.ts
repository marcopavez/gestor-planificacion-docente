import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaClaseDeck } from '@faro/domain';
import { logger } from '@faro/observability';
import { describe, expect, it } from 'vitest';
import { PptxExportAdapter } from './PptxExportAdapter.js';

// Sample real generado por Claude (modo demo): samples/aula-matematica-1b/clase-deck.json.
const SAMPLE = fileURLToPath(new URL('../../../../samples/aula-matematica-1b/clase-deck.json', import.meta.url));

describe('PptxExportAdapter (RF-2.8, CA-2.12)', () => {
  it('renderiza un ClaseDeck válido a un .pptx abrible', async () => {
    const deck = SchemaClaseDeck.parse(JSON.parse(await readFile(SAMPLE, 'utf8')));
    const dir = join(tmpdir(), 'faro-pptx-test');
    const adapter = new PptxExportAdapter(dir, logger);

    const archivo = await adapter.exportarPptx(deck);

    expect(archivo.mime).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(archivo.bytes).toBeGreaterThan(0);
    expect(archivo.ruta.endsWith('.pptx')).toBe(true);

    const bytes = await readFile(archivo.ruta);
    expect(bytes.length).toBe(archivo.bytes);
    // Un .pptx es un contenedor ZIP (OOXML): debe comenzar con la firma 'PK'.
    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});
