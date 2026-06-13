// scripts/dev.mjs
// Levanta el stack de desarrollo con UN comando (`pnpm dev`): el WORKER (cola async de generación) y
// la WEB (Next.js) juntos, con el .env cargado para ambos. Ctrl+C apaga los dos.
//   web → http://localhost:3000/aula/planificacion
// Sin ANTHROPIC_API_KEY (ni CLAUDE_CODE_OAUTH_TOKEN) el worker corre en modo `samples` (contenido
// enlatado de UNA materia: Matemática 1º). Con la key, genera cualquier materia ya ingerida.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Carga .env al process.env (estilo dotenv: NO pisa variables ya definidas). */
function cargarEnv() {
  const ruta = join(raiz, '.env');
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf-8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf('=');
    if (i === -1) continue;
    const clave = limpia.slice(0, i).trim();
    let valor = limpia.slice(i + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}

cargarEnv();

if (!process.env['DATABASE_URL']) {
  console.error('\n✗ Falta DATABASE_URL (cp .env.example .env). ¿Corriste `pnpm seed` antes?\n');
  process.exit(1);
}

// El worker corre desde dist → asegúralo compilado (incremental: rápido tras la 1ª vez).
console.log('▶ Compilando el worker…');
// shell:true sin args[] evita DEP0190; el comando es fijo (sin entradas externas).
const build = spawnSync('pnpm --filter "@faro/worker..." build', {
  cwd: raiz,
  stdio: 'inherit',
  env: process.env,
  shell: true,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const hijos = [];

/** Mata un hijo y su árbol (en Windows next/pnpm dejan nietos colgando sin /T). */
function matar(p) {
  if (!p || p.pid === undefined || p.killed) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* ya murió */
    }
  } else {
    try {
      p.kill('SIGTERM');
    } catch {
      /* ya murió */
    }
  }
}

let apagando = false;
function apagar(code = 0) {
  if (apagando) return;
  apagando = true;
  for (const p of hijos) matar(p);
  process.exit(code);
}
process.on('SIGINT', () => apagar(0));
process.on('SIGTERM', () => apagar(0));

/** Lanza un proceso, prefija sus líneas con [nombre] y apaga todo si se cae. */
function lanzar(nombre, cmd, args, opts = {}) {
  const p = spawn(cmd, args, { cwd: raiz, env: process.env, ...opts });
  const prefijo = `[${nombre}] `;
  const tubo = (flujo, destino) => {
    let buf = '';
    flujo.on('data', (d) => {
      buf += d.toString();
      const lineas = buf.split('\n');
      buf = lineas.pop() ?? '';
      for (const l of lineas) destino.write(prefijo + l + '\n');
    });
  };
  if (p.stdout) tubo(p.stdout, process.stdout);
  if (p.stderr) tubo(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`${prefijo}terminó (code ${code ?? 0}); apagando el resto…`);
    apagar(code ?? 0);
  });
  hijos.push(p);
}

console.log(
  '\n▶ worker + web arriba (Ctrl+C para detener)\n' +
    '   web → http://localhost:3000/aula/planificacion\n',
);

// Worker: node directo (process.execPath = ruta absoluta → sin shell, multiplataforma).
lanzar('worker', process.execPath, [join('apps', 'worker', 'dist', 'main.js')]);
// Web: next dev vía pnpm (shell en Windows resuelve pnpm.cmd). Comando completo + args [] → sin DEP0190.
lanzar('web', 'pnpm --filter @faro/web dev', [], { shell: true });
