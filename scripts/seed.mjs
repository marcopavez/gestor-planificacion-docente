// scripts/seed.mjs
// Onboarding de UN comando (`pnpm seed`): deja la base lista para usar la app.
//   1) compila `ingest` + sus dependencias,
//   2) aplica las migraciones (drizzle-kit migrate),
//   3) ingiere TODO el corpus de OA (1º–6º, todas las asignaturas) según corpus/curriculum/_manifest.json
//      y publica la corpus_version.
// Idempotente: re-correrlo no duplica (upsert de OA + publicar idempotente). Lee DATABASE_URL del
// entorno o de .env (parser propio, sin dependencias). NO necesita ANTHROPIC_API_KEY (la IA es del worker).

import { spawnSync } from 'node:child_process';
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
  console.error(
    '\n✗ Falta DATABASE_URL.\n' +
      '  1) Copia la plantilla:   cp .env.example .env\n' +
      '  2) Deja en .env:         DATABASE_URL=postgresql://faro:faro@localhost:5544/faro\n' +
      '     (coincide con docker-compose.yml — levántala con `docker compose up -d`)\n',
  );
  process.exit(1);
}

/** Corre un comando (string completo) heredando stdio; aborta el seed si falla. */
function paso(comando, etiqueta) {
  console.log(`\n▶ ${etiqueta}`);
  // shell:true sin args[] evita DEP0190; el comando no lleva entradas externas (sin inyección).
  const r = spawnSync(comando, { cwd: raiz, stdio: 'inherit', env: process.env, shell: true });
  if (r.status !== 0) {
    console.error(`\n✗ Falló: ${etiqueta}`);
    process.exit(r.status ?? 1);
  }
}

// 1) Compilar ingest + dependencias (domain, infra-db, observability, config).
paso('pnpm --filter "@faro/ingest..." build', 'Compilando ingest + dependencias');

// 2) Migraciones (drizzle-kit migrate lee DATABASE_URL del entorno).
paso('pnpm --filter @faro/infra-db db:migrate', 'Aplicando migraciones a la base de datos');

// 3) Ingerir todo el corpus según el manifiesto y publicar la versión UNA sola vez (al final).
const dirCorpus = join(raiz, 'corpus', 'curriculum');
const manifiesto = JSON.parse(readFileSync(join(dirCorpus, '_manifest.json'), 'utf-8'));
const version = manifiesto.version;
const bloques = manifiesto.bloques;

console.log(`\n▶ Ingiriendo ${bloques.length} bloques de OA (corpus ${version}; sin publicar todavía)…`);
let ok = 0;
let ancla = null; // primer bloque ingerido OK → lo reusamos para publicar (idempotente).
const fallidos = [];

for (const b of bloques) {
  const archivo = join(dirCorpus, b.archivo);
  // --no-publish: la versión se publica al final, ya cargada (INV-4: inmutable una vez publicada).
  const r = spawnSync(
    'node',
    ['apps/ingest/dist/main.js', '--file', archivo, '--version', version, '--no-publish'],
    { cwd: raiz, encoding: 'utf-8', env: process.env },
  );
  if (r.status === 0) {
    ok++;
    ancla ??= archivo;
    process.stdout.write('.');
  } else {
    fallidos.push(b.archivo);
    process.stdout.write('x');
  }
}
process.stdout.write('\n');

if (ancla === null) {
  console.error('\n✗ Ningún bloque se ingirió; no hay nada que publicar. Revisa los errores de arriba.');
  if (fallidos.length > 0) console.error(`  Fallidos: ${fallidos.join(', ')}`);
  process.exit(1);
}

// Publicar: re-ingiere un bloque válido SIN --no-publish (upsert idempotente + publica la versión).
console.log('\n▶ Publicando la corpus_version…');
const pub = spawnSync('node', ['apps/ingest/dist/main.js', '--file', ancla, '--version', version], {
  cwd: raiz,
  encoding: 'utf-8',
  env: process.env,
});
if (pub.status !== 0) {
  console.error('✗ Falló la publicación de la corpus_version.\n' + (pub.stdout ?? '') + (pub.stderr ?? ''));
  process.exit(1);
}

console.log(`\n✓ Corpus sembrado: ${ok}/${bloques.length} bloques, corpus_version '${version}' publicada.`);
if (fallidos.length > 0) {
  console.warn(`⚠ ${fallidos.length} bloque(s) no ingeridos: ${fallidos.join(', ')}`);
}
console.log('\nListo. Levanta la app con:  pnpm dev\n');
