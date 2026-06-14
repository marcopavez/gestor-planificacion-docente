import { describe, expect, it } from 'vitest';
import { SchemaGuia, fugaDeTextoEnGuia, type Guia } from './guia.js';

const guiaMuestra: Guia = {
  asignatura: 'Ciencias Naturales',
  curso: '3º básico',
  oa: { codigo: 'CN03 OA 01', descripcion: 'Observar y describir los seres vivos.' },
  conocimiento: 'Características de los seres vivos',
  perfil_nivel: '3-4',
  titulo: 'Guía: Características de los seres vivos',
  explicacion: 'Los seres vivos nacen, crecen, se alimentan y se reproducen.',
  ejemplo: 'Ejemplo: un perro nace, crece, come y tiene crías.',
  ejercicios: [
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender',
      tipo: 'seleccion_multiple',
      enunciado: '¿Cuál es un ser vivo?',
      alternativas: [
        { texto: 'Una roca', correcta: false },
        { texto: 'Un árbol', correcta: true },
      ],
      retroalimentacion: 'Recuerda: los seres vivos crecen y se alimentan.',
    },
  ],
};

describe('SchemaGuia', () => {
  it('valida una guía bien formada', () => {
    expect(() => SchemaGuia.parse(guiaMuestra)).not.toThrow();
  });

  it('rechaza perfil_nivel de tramo 1-2 (guía 3-6 en tanda 1)', () => {
    const mala = { ...guiaMuestra, perfil_nivel: '1-2' };
    expect(SchemaGuia.safeParse(mala).success).toBe(false);
  });

  it('fugaDeTextoEnGuia devuelve null para una guía sana', () => {
    expect(fugaDeTextoEnGuia(guiaMuestra)).toBeNull();
  });

  it('fugaDeTextoEnGuia detecta fuga de razonamiento en explicacion', () => {
    const fuga = 'X '.repeat(2000); // > LIMITE_TEXTO_GUIA
    const mala: Guia = { ...guiaMuestra, explicacion: fuga };
    expect(fugaDeTextoEnGuia(mala)?.campo).toBe('explicacion');
  });

  it('fugaDeTextoEnGuia detecta fuga en un ejercicio (reusa el guard de ítems)', () => {
    const fuga = 'Y '.repeat(700); // > LIMITE_TEXTO_ITEM
    const mala: Guia = {
      ...guiaMuestra,
      ejercicios: [{ ...guiaMuestra.ejercicios[0]!, enunciado: fuga }],
    };
    expect(fugaDeTextoEnGuia(mala)).not.toBeNull();
  });
});
