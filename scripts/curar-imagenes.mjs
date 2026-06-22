// scripts/curar-imagenes.mjs
// Herramienta de CURACIÓN del banco de imágenes (NO corre en producción ni en CI).
//
// Qué hace: dado el MANIFIESTO de tópicos de abajo, descarga un recurso con licencia limpia por tópico
// (Openclipart CC0 para line-art B&N; Pixabay para color), lo rasteriza a PNG si vino en SVG, lo guarda
// en packages/infra-export/assets/imagenes/<materia|transversal>/<id>.png, e imprime las entradas del
// catálogo para pegarlas en packages/domain/src/imagenes/catalogo.ts.
//
// IMPORTANTE — el filtro de seguridad para material infantil es la REVISIÓN HUMANA: tras correr el
// script, ABRE cada PNG y descarta lo que no sea apropiado o, en line-art, no sea "pintable". El script
// solo descarga candidatos; la decisión de incluir es del curador (decisión de producto).
//
// Requisitos para EJECUTAR (por eso no corre en CI):
//   - Red.
//   - PIXABAY_API_KEY en el entorno (https://pixabay.com/api/docs/) para los tópicos `color`.
//   - `sharp` instalado (pnpm add -D sharp -w) para rasterizar SVG→PNG. Si falta, el script avisa y
//     salta la rasterización (los tópicos `linea_bn` de Openclipart suelen venir en SVG).
//
// Uso:  PIXABAY_API_KEY=xxxx node scripts/curar-imagenes.mjs
//
// El script NO inventa: si una fuente no devuelve resultado o falta una dependencia, lo informa y deja
// ese tópico fuera (no escribe una entrada de catálogo sin su PNG).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_ASSETS = join(RAIZ, 'packages/infra-export/assets/imagenes');

// --- Manifiesto del SET SEMILLA: Matemática 1º-2º + transversales (~20-30 tópicos) ---
// `materia: null` = transversal (sirve a cualquier asignatura). `query` orienta la búsqueda en la fuente.
const MANIFIESTO = [
  // Transversales — line-art B&N para pintar (Openclipart CC0).
  ...['numero_1', 'numero_2', 'numero_3', 'numero_4', 'numero_5'].map((t) => ({
    topico: t, materia: null, tramo: '1-2', tipo: 'linea_bn', query: `${t.replace('_', ' ')} outline coloring`, fuente: 'openclipart',
  })),
  { topico: 'manzana', materia: null, tramo: '1-2', tipo: 'linea_bn', query: 'apple outline coloring', fuente: 'openclipart' },
  { topico: 'pelota', materia: null, tramo: '1-2', tipo: 'linea_bn', query: 'ball outline coloring', fuente: 'openclipart' },
  { topico: 'lapiz', materia: null, tramo: '1-2', tipo: 'linea_bn', query: 'pencil outline coloring', fuente: 'openclipart' },
  { topico: 'circulo', materia: null, tramo: '1-2', tipo: 'linea_bn', query: 'circle shape outline', fuente: 'openclipart' },
  { topico: 'cuadrado', materia: null, tramo: '1-2', tipo: 'linea_bn', query: 'square shape outline', fuente: 'openclipart' },
  { topico: 'triangulo', materia: null, tramo: '1-2', tipo: 'linea_bn', query: 'triangle shape outline', fuente: 'openclipart' },
  // Transversales — ilustración a color para el PPT (Pixabay).
  { topico: 'conteo', materia: null, tramo: '1-2', tipo: 'color', query: 'counting numbers kids', fuente: 'pixabay' },
  { topico: 'numeros', materia: null, tramo: '1-2', tipo: 'color', query: 'colorful numbers', fuente: 'pixabay' },
  { topico: 'formas', materia: null, tramo: '1-2', tipo: 'color', query: 'geometric shapes colorful', fuente: 'pixabay' },
  { topico: 'animales', materia: null, tramo: '1-2', tipo: 'color', query: 'cartoon animals kids', fuente: 'pixabay' },
  { topico: 'frutas', materia: null, tramo: '1-2', tipo: 'color', query: 'fruits illustration kids', fuente: 'pixabay' },
  // Matemática 1º-2º — color.
  { topico: 'suma', materia: 'Matemática', tramo: '1-2', tipo: 'color', query: 'addition math kids', fuente: 'pixabay' },
  { topico: 'resta', materia: 'Matemática', tramo: '1-2', tipo: 'color', query: 'subtraction math kids', fuente: 'pixabay' },
  { topico: 'decena', materia: 'Matemática', tramo: '1-2', tipo: 'color', query: 'ten blocks counting', fuente: 'pixabay' },
  { topico: 'comparar', materia: 'Matemática', tramo: '1-2', tipo: 'color', query: 'compare more less kids', fuente: 'pixabay' },
];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Busca en Openclipart (CC0) y devuelve la URL del SVG del primer resultado, o null. */
async function buscarOpenclipart(query) {
  const r = await fetch(`https://openclipart.org/search/json/?query=${encodeURIComponent(query)}&amount=1`);
  if (!r.ok) return null;
  const j = await r.json();
  const hit = j?.payload?.[0];
  return hit?.svg?.png_full_lossy ?? hit?.svg?.url ?? null; // png si lo ofrece; si no, el SVG
}

/** Busca en Pixabay (requiere key) y devuelve la URL de la imagen del primer resultado, o null. */
async function buscarPixabay(query, key) {
  const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=illustration&safesearch=true&per_page=3`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  return j?.hits?.[0]?.largeImageURL ?? j?.hits?.[0]?.webformatURL ?? null;
}

/** Descarga `url` y, si es SVG, lo rasteriza a PNG con sharp (si está disponible). Devuelve un Buffer PNG. */
async function aPng(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`descarga falló (${res.status}) ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const esSvg = url.endsWith('.svg') || buf.subarray(0, 200).toString('utf8').includes('<svg');
  if (!esSvg) return buf; // ya es PNG/JPG
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    throw new Error('SVG requiere `sharp` para rasterizar (pnpm add -D sharp -w). Saltado.');
  }
  return sharp(buf, { density: 200 }).resize(800, 800, { fit: 'inside' }).png().toBuffer();
}

async function main() {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) console.warn('[curar] PIXABAY_API_KEY ausente: se saltan los tópicos `color`.');

  const entradas = [];
  for (const m of MANIFIESTO) {
    const id = `${slug(m.topico)}-${m.tipo === 'linea_bn' ? 'bn' : 'color'}`;
    const sub = m.materia ? slug(m.materia) : 'transversal';
    const rel = `${sub}/${id}.png`;
    try {
      let url = null;
      if (m.fuente === 'openclipart') url = await buscarOpenclipart(m.query);
      else if (m.fuente === 'pixabay' && key) url = await buscarPixabay(m.query, key);
      if (!url) {
        console.warn(`[curar] sin candidato para ${m.topico} (${m.fuente}) — omitido`);
        continue;
      }
      const png = await aPng(url);
      const destino = join(DIR_ASSETS, rel);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, png);
      const licencia = m.fuente === 'openclipart' ? 'CC0' : 'Pixabay';
      entradas.push({ id, topico: m.topico, materia: m.materia, tramo: m.tramo, tipo: m.tipo, archivo: rel, fuente: m.fuente, licencia });
      console.error(`[curar] OK ${rel}`);
    } catch (e) {
      console.warn(`[curar] ${m.topico}: ${e.message}`);
    }
  }

  // Emite el array para pegar en packages/domain/src/imagenes/catalogo.ts (CATALOGO_IMAGENES).
  // REVISA visualmente cada PNG antes de pegar: descarta lo inapropiado o no "pintable".
  console.log('\n// --- Pega esto en CATALOGO_IMAGENES (tras revisión visual) ---');
  console.log(JSON.stringify(entradas, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
