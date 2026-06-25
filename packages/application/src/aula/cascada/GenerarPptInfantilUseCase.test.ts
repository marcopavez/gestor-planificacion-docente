// Test del PPT infantil (Fase 3) sin red ni API key: un doble de LlmPort sirve un ClaseDeck de muestra.
// Verifica que el use case ensambla un deck que valida SchemaClaseDeck, fija tema/tramo por edad y
// SOBRESCRIBE los campos que no se inventan (oa/asignatura/nivel) con los de la unidad. Nace borrador.

import type { ClaseDeck, LlmPort, PlanificacionUnidad } from '@faro/domain';
import { SchemaClaseDeck, TEMAS_DECK_INFANTIL } from '@faro/domain';
import { describe, expect, it } from 'vitest';
import { GenerarPptInfantilUseCase } from './GenerarPptInfantilUseCase.js';

/** Unidad mínima válida (Formato A) para un nivel dado; suficiente para anclar OA y propósito. */
function unidadMuestra(nivel: string): PlanificacionUnidad {
  return {
    plantilla: 'A',
    establecimiento: 'Colegio Demo',
    asignatura: 'Ciencias Naturales',
    nivel,
    unidad: 'Unidad 1: Los seres vivos',
    proposito: 'Reconocer características de los seres vivos del entorno.',
    duracion_semanas: 4,
    horas_pedagogicas: 8,
    oa: [
      {
        codigo: 'CN01 OA 01',
        categoria: 'basal',
        descripcion: 'Reconocer y observar seres vivos y no vivos del entorno.',
        detalle: [],
        habilidades: ['Observar'],
      },
    ],
    experiencias: ['Salida al patio a observar seres vivos.'],
    indicadores_evaluacion: [
      { oa: 'CN01 OA 01', texto: 'Distinguen seres vivos de objetos.', fuente: 'ia_borrador' },
    ],
    evaluacion: { tipo: ['formativa'], instrumentos: ['Lista de cotejo'] },
    extras: {},
  };
}

// ClaseDeck de muestra de la IA: incluye slides de contenido e interacción ('pregunta'). Los campos
// titulo/asignatura/nivel/oa traen valores "equivocados" a propósito → el use case debe sobreescribirlos.
const deckMuestra: ClaseDeck = {
  titulo: 'TITULO DE LA IA (debe ser reemplazado)',
  asignatura: 'IA-Asignatura',
  nivel: 'IA-Nivel',
  oa: ['IA OA 99'],
  slides: [
    {
      momento: 'inicio',
      titulo: '¿Qué seres vivos conoces?',
      contenido: ['Miremos a nuestro alrededor.'],
      notas_docente: 'Activar conocimientos previos con ejemplos del patio.',
      tipo: 'contenido',
      opciones: [],
    },
    {
      momento: 'desarrollo',
      titulo: '¿Cuál es un ser vivo?',
      contenido: ['Elige la imagen correcta.'],
      notas_docente: 'Respuesta correcta: el perro (es un ser vivo).',
      tipo: 'pregunta',
      opciones: [
        { texto: 'Una roca', correcta: false },
        { texto: 'Un perro', correcta: true },
      ],
    },
    {
      momento: 'cierre',
      titulo: 'Lo que aprendimos',
      contenido: ['Los seres vivos nacen, crecen y se alimentan.'],
      notas_docente: 'Cierre metacognitivo.',
      tipo: 'contenido',
      opciones: [],
    },
  ],
};

/** Doble de LlmPort: despacha por identidad del schema (mismo objeto que importa el use case). */
function llmDeMuestras(llamadas: string[]): LlmPort {
  // Map<unknown, unknown> evita que el genérico ZodType<T> se estreche a `never` al comparar (ver
  // CascadaAulaUseCase.test.ts): la clave es la identidad del schema, el valor su muestra.
  const porSchema = new Map<unknown, unknown>([[SchemaClaseDeck, deckMuestra]]);
  return {
    async generar(args) {
      llamadas.push(args.tarea);
      if (!porSchema.has(args.schema)) {
        throw new Error(`Sin muestra para el schema (tarea=${args.tarea}).`);
      }
      // Valida la muestra contra el schema real: el test no puede colar un deck inválido.
      const parsed = args.schema.parse(porSchema.get(args.schema));
      return {
        parsed,
        stopReason: 'end_turn',
        usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        modelo: 'muestras',
      };
    },
  };
}

describe('GenerarPptInfantilUseCase (Fase 3, PPT infantil sin API key)', () => {
  it('ensambla un ClaseDeck válido con tema y tramo (1º básico → tramo 1-2)', async () => {
    const llamadas: string[] = [];
    const uc = new GenerarPptInfantilUseCase(llmDeMuestras(llamadas));

    const deck = await uc.ejecutar(unidadMuestra('1º básico'));

    // Valida contra el contrato del dominio (no romper backward-compat del schema).
    expect(() => SchemaClaseDeck.parse(deck)).not.toThrow();

    // Tramo derivado del nivel → tema placeholder correspondiente (data-driven).
    expect(deck.tramo_edad).toBe('1-2');
    expect(deck.tema).toEqual(TEMAS_DECK_INFANTIL['1-2']);

    // Campos fijos SOBRESCRITOS con los de la unidad (la IA no los decide).
    expect(deck.oa).toEqual(['CN01 OA 01']);
    expect(deck.asignatura).toBe('Ciencias Naturales');
    expect(deck.nivel).toBe('1º básico');
    expect(deck.titulo).toContain('Unidad 1: Los seres vivos');

    // Trae los slides de la IA, incluida una slide de interacción con su correcta marcada.
    expect(deck.slides).toHaveLength(3);
    const pregunta = deck.slides.find((s) => s.tipo === 'pregunta');
    expect(pregunta?.opciones.filter((o) => o.correcta)).toHaveLength(1);

    // Una sola llamada al LLM, de redacción.
    expect(llamadas).toEqual(['redaccion']);
  });

  it('elige el tema por tramo y, en 5-6, lo tiñe por asignatura (Ciencias Naturales → acento/marco verde)', async () => {
    const uc = new GenerarPptInfantilUseCase(llmDeMuestras([]));

    const deck = await uc.ejecutar(unidadMuestra('5º básico')); // unidad de Ciencias Naturales

    expect(deck.tramo_edad).toBe('5-6');
    // El sistema MINEDUC 5-6 es color-por-asignatura: Ciencias Naturales → verde lima 93C953
    // (acento + marco a sangre), NO el acento neutro por defecto del tramo (06ABD8).
    expect(deck.tema?.paleta.acento).toBe('93C953');
    expect(deck.tema?.paleta.borde).toBe('93C953');
    // El resto del tema 5-6 (fondo/título/fuente/tamaños) se conserva de la base.
    expect(deck.tema?.paleta.fondo).toBe(TEMAS_DECK_INFANTIL['5-6'].paleta.fondo);
    expect(deck.tema?.fuente.titulo).toBe('Calibri');
  });

  it('ejecutarConMeta expone los metadatos de la llamada (traza_ia)', async () => {
    const uc = new GenerarPptInfantilUseCase(llmDeMuestras([]));

    const { valor, meta } = await uc.ejecutarConMeta(unidadMuestra('3º básico'));

    expect(valor.tramo_edad).toBe('3-4');
    expect(meta.modelo).toBe('muestras');
    expect(meta.stopReason).toBe('end_turn');
    expect(meta.usage).toEqual({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
  });

  it('ya NO inyecta el catálogo de tópicos en la entrada del LLM (Task 8, Plan 2)', async () => {
    // Antes (Plan 1): se pasaba topicosDisponiblesPara(asignatura, tramo, 'color') a entradaDeckInfantil.
    // Ahora: la IA describe la imagen por escena concreta; el catálogo Noto queda inerte.
    let entradaCapturada = '';
    const llm: LlmPort = {
      async generar(args) {
        entradaCapturada = args.entradaUsuario;
        return {
          parsed: args.schema.parse(deckMuestra),
          stopReason: 'end_turn',
          usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
          modelo: 'muestras',
        };
      },
    };
    const unidadMate: PlanificacionUnidad = { ...unidadMuestra('1º básico'), asignatura: 'Matemática' };

    await new GenerarPptInfantilUseCase(llm).ejecutar(unidadMate);

    // El catálogo de tópicos ya no se inyecta en la entrada del LLM.
    expect(entradaCapturada).not.toContain('Tópicos de imagen');
    expect(entradaCapturada.toLowerCase()).not.toContain('topico_imagen');
  });
});
