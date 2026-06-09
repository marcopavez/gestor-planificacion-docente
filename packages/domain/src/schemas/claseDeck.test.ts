// Schema ClaseDeck + tema infantil (Fase 3 — PPT infantil por clase).
// Verifica: backward-compat (defaults de tipo/opciones), tema infantil opcional, los temas
// placeholder por tramo y el helper tramoDeNivel.
import { describe, expect, it } from 'vitest';
import { SchemaClaseDeck, TEMAS_DECK_INFANTIL, tramoDeNivel, type TemaDeckInfantilType } from './claseDeck.js';

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

describe('TEMAS_DECK_INFANTIL (calibrado 1-2/3-4; 5-6 provisional)', () => {
  it('define los 3 tramos con el estilo correcto', () => {
    // 1-2 y 3-4 calibrados contra los PPT/guías reales (ambos 'pastel'-cálido); 5-6 sigue 'naturaleza'.
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
    // 7º no es del MVP (1-6); cae al default 3-4.
    expect(tramoDeNivel('7º básico')).toBe('3-4');
  });
});
