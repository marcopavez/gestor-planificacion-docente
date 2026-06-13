// apps/ingest/src/main.ts
// CLI de ingesta del corpus de OA (H-PA.2).
// Uso: node dist/main.js --file <ruta-json> --version <etiqueta> [--no-publish]
// Idempotente: re-correr con la misma etiqueta reusa la corpus_version existente.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { crearDb } from '@faro/infra-db';
import { OaRepositoryDrizzle, CorpusVersionRepositoryDrizzle } from '@faro/infra-db';
import { crearLoggerHijo } from '@faro/observability';

const log = crearLoggerHijo('ingest');

// ---------------------------------------------------------------------------
// Schema del entorno para ingest (solo DATABASE_URL — sin clave de IA)
// ---------------------------------------------------------------------------
const EnvIngestSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida de Postgres'),
});

// ---------------------------------------------------------------------------
// Schema del archivo de corpus (shape canónico de los JSON en corpus/curriculum/)
// ---------------------------------------------------------------------------
const SchemaOaArchivo = z.object({
  codigo: z.string(),
  // eje NULO o ausente es válido: algunas Bases no organizan por eje (p.ej. Inglés) y la columna
  // `objetivo_aprendizaje.eje` es nullable; el repo ya mapea eje → null. Antes z.string() rechazaba
  // el archivo entero (Historia/Inglés 6º quedaban sin ingerir).
  eje: z.string().nullable().optional(),
  descripcion: z.string(),
  detalle: z.array(z.string()).optional(),
  indicadores: z.array(z.string()),
});

const SchemaCorpusArchivo = z.object({
  asignatura: z.string(),
  // Nivel VERBATIM del JSON (ej. "1º básico" con ordinal masculino º).
  // Este string es canónico: la PlanificacionAnual debe usar el mismo para evitar mismatch º/°.
  nivel: z.string(),
  vigencia: z.object({
    desde: z.string().nullable(),
    hasta: z.string().nullable(),
  }),
  objetivos_aprendizaje: z.array(SchemaOaArchivo),
});

type CorpusArchivo = z.infer<typeof SchemaCorpusArchivo>;

// ---------------------------------------------------------------------------
// Parseo de argumentos CLI — evitamos dependencias externas para mantener
// el binario liviano; el CLI interno de M0 no necesita commander/yargs aún.
// ---------------------------------------------------------------------------
interface CliArgs {
  file: string;
  version: string;
  publish: boolean;
}

function parsearArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // quitar 'node' y el script
  let file: string | undefined;
  let version: string | undefined;
  let publish = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && args[i + 1]) {
      file = args[++i];
    } else if (arg === '--version' && args[i + 1]) {
      version = args[++i];
    } else if (arg === '--no-publish') {
      publish = false;
    }
  }

  if (!file || !version) {
    throw new Error('Uso: ingest --file <ruta-json> --version <etiqueta> [--no-publish]');
  }

  return { file, version, publish };
}

// ---------------------------------------------------------------------------
// Lógica principal de ingesta
// ---------------------------------------------------------------------------
async function ingestar(corpus: CorpusArchivo, args: CliArgs, db: ReturnType<typeof crearDb>['db']): Promise<void> {
  const cvRepo = new CorpusVersionRepositoryDrizzle(db);
  const oaRepo = new OaRepositoryDrizzle(db);

  // Idempotencia: reusar versión existente por etiqueta (no crear duplicada).
  let version = await cvRepo.buscarPorEtiqueta(args.version);
  if (version === null) {
    version = await cvRepo.crear(args.version);
    log.info({ etiqueta: args.version, id: version.id }, 'corpus_version creada');
  } else {
    log.info({ etiqueta: args.version, id: version.id }, 'corpus_version existente reutilizada');
  }

  // Mapear OA del archivo al input de ingestar.
  const oasInput = corpus.objetivos_aprendizaje.map((oa) => ({
    corpusVersionId: version.id,
    codigo: oa.codigo,
    asignatura: corpus.asignatura,
    // Nivel VERBATIM: preservar "1º básico" tal cual (ordinal º, no °) para evitar mismatch
    // con la PlanificacionAnual que debe usar el mismo string canónico (INV-4).
    nivel: corpus.nivel,
    eje: oa.eje ?? null, // eje nulo/ausente → null (columna nullable)
    tipo: 'basal' as const, // El corpus no distingue categoría por-OA aún; todos son basales.
    // Concatenar detalle a descripción para no perder texto citable en el corpus (sin detalles vacíos).
    descripcion: oa.detalle && oa.detalle.length > 0
      ? `${oa.descripcion} ${oa.detalle.join('; ')}`
      : oa.descripcion,
    indicadores: oa.indicadores.length > 0 ? oa.indicadores : null,
    // null/null = vigente sin fecha de término ([VERIFICAR] en el JSON de corpus).
    vigenciaDesde: corpus.vigencia.desde ?? null,
    vigenciaHasta: corpus.vigencia.hasta ?? null,
  }));

  log.info({ n: oasInput.length, asignatura: corpus.asignatura, nivel: corpus.nivel }, 'ingiriendo OA');
  await oaRepo.ingestar(oasInput);
  log.info({ n: oasInput.length }, 'OA ingeridos (upsert idempotente)');

  if (args.publish) {
    const publicada = await cvRepo.publicar(version.id);
    log.info({ id: publicada.id, publicadaAt: publicada.publicadaAt }, 'corpus_version publicada');
  } else {
    log.info({ id: version.id }, 'corpus_version en borrador (--no-publish)');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parsearArgs(process.argv);
  } catch (err) {
    log.error({ err }, 'argumentos inválidos');
    process.exit(1);
  }

  // Validar entorno mínimo (solo DATABASE_URL — sin clave de IA para el ingest).
  const envResult = EnvIngestSchema.safeParse(process.env);
  if (!envResult.success) {
    const errores = envResult.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    log.error({ errores }, 'variables de entorno inválidas');
    process.exit(1);
  }
  const env = envResult.data;

  // Leer y validar el archivo de corpus.
  let corpus: CorpusArchivo;
  try {
    const rutaAbsoluta = resolve(args.file);
    const raw: unknown = JSON.parse(readFileSync(rutaAbsoluta, 'utf-8'));
    const parseado = SchemaCorpusArchivo.safeParse(raw);
    if (!parseado.success) {
      log.error({ errores: parseado.error.issues }, 'el archivo de corpus no cumple el schema esperado');
      process.exit(1);
    }
    corpus = parseado.data;
  } catch (err) {
    log.error({ err, file: args.file }, 'error leyendo el archivo de corpus');
    process.exit(1);
  }

  // Construir conexión a DB y correr la ingesta.
  // EnvDb es el subconjunto mínimo que crearDb necesita — ingest no requiere ANTHROPIC_API_KEY.
  const { db, pool } = crearDb({ DATABASE_URL: env.DATABASE_URL });
  try {
    await ingestar(corpus, args, db);
  } catch (err) {
    log.error({ err }, 'error durante la ingesta');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  log.error({ err }, 'error no manejado en main');
  process.exit(1);
});
