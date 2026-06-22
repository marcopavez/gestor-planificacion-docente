// scripts/curar-imagenes.mjs
// Regenera el SET SEMILLA del banco de imágenes desde Noto Emoji (Apache-2.0, PNG 512px), sin API key.
// Mapea cada tópico del catálogo (packages/domain/src/imagenes/catalogo.ts) a un codepoint de emoji y
// baja su PNG a packages/infra-export/assets/imagenes/<materia|transversal>/<topico>-color.png.
//
// FILTRO DE SEGURIDAD = revisión humana: tras correr esto, abre cada PNG y descarta lo no apropiado.
// Noto Emoji es contenido estándar de Google, consistente y seguro para material infantil.
//
// Licencia: los assets PNG/SVG de Noto Emoji están bajo Apache 2.0 (uso comercial + redistribución, sin
// atribución visible en el output). Ver packages/infra-export/assets/imagenes/NOTICE.md.
//
// Uso:  node scripts/curar-imagenes.mjs   (necesita red; sin key, sin sharp)

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR = join(RAIZ, 'packages/infra-export/assets/imagenes');
const BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji/png/512';

// topico → [codepoint Unicode (sin el prefijo emoji_u), materia | null]. Transversal = null.
// El catálogo (catalogo.ts) usa estos mismos tópicos; mantenlos en sincronía.
const MAPA = {
  // Transversales (sirven a cualquier asignatura).
  numero_1: ['0031_20e3', null], numero_2: ['0032_20e3', null], numero_3: ['0033_20e3', null],
  numero_4: ['0034_20e3', null], numero_5: ['0035_20e3', null],
  manzana: ['1f34e', null], platano: ['1f34c', null], uvas: ['1f347', null],
  perro: ['1f436', null], gato: ['1f431', null], pajaro: ['1f426', null], pez: ['1f41f', null],
  estrella: ['2b50', null], pelota: ['26bd', null],
  circulo: ['1f535', null], cuadrado: ['1f7e6', null], triangulo: ['1f53a', null],
  lapiz: ['270f', null], libro: ['1f4d6', null],
  // Matemática 1º-2º.
  suma: ['2795', 'Matemática'], resta: ['2796', 'Matemática'],
  numeros: ['1f522', 'Matemática'], conteo: ['1f9ee', 'Matemática'],
};

async function main() {
  let ok = 0;
  let fallo = 0;
  for (const [topico, [code, materia]] of Object.entries(MAPA)) {
    const sub = materia ? 'matematica' : 'transversal';
    const destino = join(DIR, sub, `${topico}-color.png`);
    try {
      const res = await fetch(`${BASE}/emoji_u${code}.png`);
      if (!res.ok) throw new Error(`http ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // Sanidad: un PNG real empieza con la firma 0x89 'PNG'.
      if (buf.subarray(0, 4).toString('latin1') !== '\x89PNG') throw new Error('no es PNG');
      await mkdir(join(DIR, sub), { recursive: true });
      await writeFile(destino, buf);
      ok++;
      console.error(`[curar] OK ${sub}/${topico}-color.png (${buf.length} B)`);
    } catch (e) {
      fallo++;
      console.error(`[curar] FALLO ${topico} (${code}): ${e.message}`);
    }
  }
  console.error(`[curar] listo: ${ok} OK, ${fallo} fallo. Revisa visualmente antes de commitear.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
