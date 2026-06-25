// Schema ClaseDeck + tema infantil (Fase 3 — PPT infantil por clase).
// Verifica: backward-compat (defaults de tipo/opciones), tema infantil opcional, los temas
// placeholder por tramo y el helper tramoDeNivel.
import { describe, expect, it } from 'vitest';
import {
  acentoAsignatura5y6,
  SchemaClaseDeck,
  SlideDeck,
  TEMAS_DECK_INFANTIL,
  temaDeckInfantil,
  tramoDeNivel,
  type TemaDeckInfantilType,
} from './claseDeck.js';

// Las 10 asignaturas de las Bases Curriculares (nombres tal cual el corpus); Inglés es 5º-6º.
const ASIGNATURAS_BASES = [
  'Matemática',
  'Lenguaje y Comunicación',
  'Ciencias Naturales',
  'Historia, Geografía y Ciencias Sociales',
  'Artes Visuales',
  'Música',
  'Educación Física y Salud',
  'Tecnología',
  'Orientación',
  'Idioma Extranjero Inglés',
] as const;

// Deck mínimo "viejo": sin tipo/opciones en la slide ni tramo_edad/tema → debe seguir parseando.
const deckPrevio = {
  titulo: 'Clase 1',
  asignatura: 'Matemática',
  nivel: '1º básico',
  oa: ['MA01 OA 03'],
  slides: [{ momento: 'inicio', titulo: 'Inicio', contenido: ['Contemos'], notas_docente: 'Rutina.' }],
};

describe('SchemaClaseDeck (Fase 3 — aditivo, backward-compatible)', () => {
  it('parsea un deck previo sin los campos nuevos y aplica los defaults de slide', () => {
    const deck = SchemaClaseDeck.parse(deckPrevio);
    expect(deck.tramo_edad).toBeUndefined();
    expect(deck.tema).toBeUndefined();
    // Defaults: la slide vieja queda como 'contenido' con opciones vacías.
    expect(deck.slides[0]?.tipo).toBe('contenido');
    expect(deck.slides[0]?.opciones).toEqual([]);
  });

  it('acepta una slide de pregunta con opciones y la marca de correcta', () => {
    const deck = SchemaClaseDeck.parse({
      ...deckPrevio,
      tramo_edad: '1-2',
      tema: TEMAS_DECK_INFANTIL['1-2'],
      slides: [
        {
          momento: 'desarrollo',
          titulo: '¿Cuántos hay?',
          contenido: [],
          notas_docente: 'La correcta es 3.',
          tipo: 'pregunta',
          opciones: [
            { texto: '2', correcta: false },
            { texto: '3', correcta: true },
          ],
        },
      ],
    });
    expect(deck.tramo_edad).toBe('1-2');
    expect(deck.tema?.estilo).toBe('pastel');
    expect(deck.slides[0]?.opciones).toHaveLength(2);
    expect(deck.slides[0]?.opciones.filter((o) => o.correcta)).toHaveLength(1);
  });

  it('rechaza un tipo de slide desconocido', () => {
    const malo = { ...deckPrevio, slides: [{ ...deckPrevio.slides[0], tipo: 'juego' }] };
    expect(() => SchemaClaseDeck.parse(malo)).toThrow();
  });

  it('rechaza un color de paleta inválido en el tema', () => {
    const temaMalo = {
      ...TEMAS_DECK_INFANTIL['3-4'],
      paleta: { ...TEMAS_DECK_INFANTIL['3-4'].paleta, primario: '#2E86DE' }, // con '#' → inválido
    };
    expect(() => SchemaClaseDeck.parse({ ...deckPrevio, tema: temaMalo })).toThrow();
  });
});

describe('TEMAS_DECK_INFANTIL (calibrado 1-2/3-4 colegio; 5-6 contra refs MINEDUC)', () => {
  it('define los 3 tramos con el estilo correcto', () => {
    // 1-2 y 3-4 calibrados contra los PPT/guías reales (ambos 'pastel'-cálido); 5-6 sobrio ('naturaleza').
    expect(TEMAS_DECK_INFANTIL['1-2'].estilo).toBe('pastel');
    expect(TEMAS_DECK_INFANTIL['3-4'].estilo).toBe('pastel');
    expect(TEMAS_DECK_INFANTIL['5-6'].estilo).toBe('naturaleza');
  });

  it('todos los tramos definen el color de consigna (rojo de enunciado de los PPT reales)', () => {
    (Object.values(TEMAS_DECK_INFANTIL) as TemaDeckInfantilType[]).forEach((tema) => {
      expect(tema.paleta.consigna).toBe('E2231A');
    });
  });

  it('usa fuentes del sistema (no Google Fonts)', () => {
    expect(TEMAS_DECK_INFANTIL['1-2'].fuente.titulo).toBe('Comic Sans MS');
    expect(TEMAS_DECK_INFANTIL['3-4'].fuente.titulo).toBe('Verdana');
    expect(TEMAS_DECK_INFANTIL['5-6'].fuente.titulo).toBe('Calibri');
  });

  it('cada tema valida contra el schema (colores hex de 6 dígitos sin #, tamaños positivos)', () => {
    (Object.values(TEMAS_DECK_INFANTIL) as TemaDeckInfantilType[]).forEach((tema) => {
      // Reusa el deck mínimo como portador del tema para validar vía el schema público.
      expect(() => SchemaClaseDeck.parse({ ...deckPrevio, tema })).not.toThrow();
      expect(tema.tamano.titulo).toBeGreaterThan(0);
      expect(tema.tamano.cuerpo).toBeGreaterThan(0);
    });
  });
});

describe('tramoDeNivel', () => {
  it('agrupa 1-2 / 3-4 / 5-6 a partir del dígito del nivel', () => {
    expect(tramoDeNivel('1º básico')).toBe('1-2');
    expect(tramoDeNivel('2º básico')).toBe('1-2');
    expect(tramoDeNivel('3º básico')).toBe('3-4');
    expect(tramoDeNivel('4º básico')).toBe('3-4');
    expect(tramoDeNivel('5º básico')).toBe('5-6');
    expect(tramoDeNivel('6º básico')).toBe('5-6');
  });

  it('cae al tramo 3-4 cuando no reconoce un dígito 1-6', () => {
    expect(tramoDeNivel('básico')).toBe('3-4');
    expect(tramoDeNivel('')).toBe('3-4');
    // 7º no es de básica (v2 = 1-6); cae al default 3-4.
    expect(tramoDeNivel('7º básico')).toBe('3-4');
  });
});

describe('temaDeckInfantil (acento por asignatura en 5-6 — refs MINEDUC)', () => {
  it('en 5-6 tiñe acento Y marco (borde) por asignatura troncal, con los hex reales muestreados', () => {
    const mate = temaDeckInfantil('5º básico', 'Matemática');
    expect(mate.paleta.acento).toBe('E92B91');
    expect(mate.paleta.borde).toBe('E92B91');
    expect(temaDeckInfantil('6º básico', 'Ciencias Naturales').paleta.acento).toBe('93C953');
    expect(temaDeckInfantil('5º básico', 'Lenguaje y Comunicación').paleta.acento).toBe('F7963B');
    // Nombre largo del corpus: el match por palabra clave debe reconocer "Historia, Geografía y …".
    expect(temaDeckInfantil('6º básico', 'Historia, Geografía y Ciencias Sociales').paleta.acento).toBe('06ABD8');
  });

  it('en 5-6, las asignaturas no-troncales tienen su propio color (decisión de producto, ligado al contenido)', () => {
    expect(temaDeckInfantil('5º básico', 'Artes Visuales').paleta.acento).toBe('8E44AD');
    expect(temaDeckInfantil('6º básico', 'Música').paleta.acento).toBe('5E35B1');
    expect(temaDeckInfantil('5º básico', 'Educación Física y Salud').paleta.acento).toBe('0FA36B');
    expect(temaDeckInfantil('6º básico', 'Tecnología').paleta.acento).toBe('1E6FD9');
    expect(temaDeckInfantil('5º básico', 'Orientación').paleta.acento).toBe('E8A33D');
    expect(temaDeckInfantil('6º básico', 'Idioma Extranjero Inglés').paleta.acento).toBe('00897B');
  });

  it('toda asignatura de las Bases (5-6) tiene un color propio asignado (mapa completo, sin huecos)', () => {
    for (const a of ASIGNATURAS_BASES) {
      expect(acentoAsignatura5y6(a)).toBeDefined();
      // el marco se tiñe con ese mismo color
      expect(temaDeckInfantil('5º básico', a).paleta.borde).toBe(acentoAsignatura5y6(a));
    }
  });

  it('en 5-6, una asignatura no reconocida cae al acento neutro por defecto del tramo (fallback)', () => {
    const x = temaDeckInfantil('5º básico', 'Asignatura Inexistente XYZ');
    expect(acentoAsignatura5y6('Asignatura Inexistente XYZ')).toBeUndefined();
    expect(x.paleta.acento).toBe(TEMAS_DECK_INFANTIL['5-6'].paleta.acento); // 06ABD8 neutro
  });

  it('"Ciencias Sociales" (en Historia) NO se confunde con "Ciencias Naturales"', () => {
    expect(temaDeckInfantil('5º básico', 'Historia, Geografía y Ciencias Sociales').paleta.acento).toBe('06ABD8');
  });

  it('1-2 y 3-4 NO llevan marco (borde) y conservan el tema base por tramo (no por asignatura)', () => {
    expect(temaDeckInfantil('1º básico', 'Matemática').paleta.borde).toBeUndefined();
    const tres = temaDeckInfantil('3º básico', 'Matemática');
    expect(tres.paleta.borde).toBeUndefined();
    expect(tres.paleta.acento).toBe(TEMAS_DECK_INFANTIL['3-4'].paleta.acento);
  });

  it('el tema resultante valida contra el schema público', () => {
    expect(() =>
      SchemaClaseDeck.parse({ ...deckPrevio, tema: temaDeckInfantil('5º básico', 'Matemática') }),
    ).not.toThrow();
  });
});

describe('SlideDeck imagen anclada (Plan 2)', () => {
  const base = {
    momento: 'inicio' as const,
    titulo: 'Contemos estrellas',
    contenido: ['¿Cuántas ves?'],
    notas_docente: 'La respuesta se lee de la imagen.',
  };

  it('parsea un slide con imagen (descripción) + imagen_clave (PNG resuelto)', () => {
    const r = SlideDeck.parse({ ...base, imagen: 'siete estrellas grandes', imagen_clave: 'a1b2c3d4' });
    expect(r.imagen).toBe('siete estrellas grandes');
    expect(r.imagen_clave).toBe('a1b2c3d4');
  });

  it('un slide viejo con topico_imagen/sugerencia_imagen sigue parseando (las claves extra se ignoran)', () => {
    const r = SlideDeck.parse({ ...base, topico_imagen: 'estrella', sugerencia_imagen: 'una recta numérica' });
    expect(r.titulo).toBe('Contemos estrellas');
    // Las claves viejas YA NO están en el tipo (Zod las descarta).
    expect((r as Record<string, unknown>)['sugerencia_imagen']).toBeUndefined();
    expect((r as Record<string, unknown>)['topico_imagen']).toBeUndefined();
  });
});
