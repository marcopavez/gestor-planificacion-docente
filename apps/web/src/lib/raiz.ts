// apps/web/src/lib/raiz.ts
// Resuelve la raíz del monorepo (donde vive pnpm-workspace.yaml) para leer corpus/ y samples/
// con independencia del cwd con que Next arranque. Solo lectura, server-side.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

let cache: string | null = null;

export function raizRepo(): string {
  if (cache !== null) return cache;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      cache = dir;
      return dir;
    }
    const padre = dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  cache = process.cwd();
  return cache;
}
