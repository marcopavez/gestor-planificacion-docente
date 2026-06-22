// packages/infra-export/src/imagenes/BancoImagenesFsAdapter.ts
// Cache file-backed del banco de imágenes generadas (BancoImagenesGeneradasPort). El dibujo se genera
// una vez por clave y se reusa: <dirBanco>/<clave>.png (bytes) + <dirBanco>/<clave>.json (MetaDibujo).
// El worker (escribe) y la web (lee al exportar) comparten dirBanco (mismo disco, como /generated).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BancoImagenesGeneradasPort, DibujoCacheado, MetaDibujo } from '@faro/domain';

export class BancoImagenesFsAdapter implements BancoImagenesGeneradasPort {
  constructor(private readonly dirBanco: string) {}

  private rutaPng(clave: string): string {
    return join(this.dirBanco, `${clave}.png`);
  }
  private rutaMeta(clave: string): string {
    return join(this.dirBanco, `${clave}.json`);
  }

  async buscar(clave: string): Promise<DibujoCacheado | null> {
    const png = this.rutaPng(clave);
    if (!existsSync(png)) return null;
    const bytes = await readFile(png);
    // Si el PNG existe pero el sidecar no (caso raro), degrada con descripción/concepto vacíos.
    let descripcion = '';
    let concepto = '';
    if (existsSync(this.rutaMeta(clave))) {
      const meta = JSON.parse(await readFile(this.rutaMeta(clave), 'utf8')) as MetaDibujo;
      descripcion = meta.descripcion;
      concepto = meta.concepto;
    }
    return { png: bytes, descripcion, concepto };
  }

  async guardar(clave: string, png: Buffer, meta: MetaDibujo): Promise<void> {
    await mkdir(this.dirBanco, { recursive: true });
    await writeFile(this.rutaPng(clave), png);
    await writeFile(this.rutaMeta(clave), JSON.stringify(meta, null, 2), 'utf8');
  }
}
