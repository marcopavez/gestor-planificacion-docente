import { describe, expect, it } from 'vitest';
import type { DatosInstitucionalesGuia, Guia } from '@faro/domain';
import { planoGuia } from './planoGuia.js';

const guia: Guia = {
  asignatura: 'Ciencias Naturales',
  curso: '3º básico',
  oa: { codigo: 'CN03 OA 01', descripcion: 'Observar y describir los seres vivos.' },
  conocimiento: 'Características de los seres vivos',
  perfil_nivel: '3-4',
  titulo: 'Guía: Características de los seres vivos',
  explicacion: 'Los seres vivos nacen, crecen y se alimentan.',
  ejemplo: 'Un perro nace, crece y come.',
  ejercicios: [
    {
      oa: 'CN03 OA 01',
      habilidad: 'comprender',
      tipo: 'verdadero_falso',
      enunciado: 'Un árbol es un ser vivo.',
      alternativas: [
        { texto: 'Verdadero', correcta: true },
        { texto: 'Falso', correcta: false },
      ],
      retroalimentacion: 'Los árboles crecen.',
    },
  ],
};

const inst: DatosInstitucionalesGuia = { nombreColegio: 'Colegio Demo', comuna: 'Conchalí' };

describe('planoGuia', () => {
  it('produce el IR con encabezado, explicación, ejemplo y ejercicios numerados', () => {
    const plano = planoGuia(guia, inst);
    expect(plano.encabezado.titulo).toBe('Guía: Características de los seres vivos');
    expect(plano.encabezado.lineaColegio).toContain('Colegio Demo');
    expect(plano.encabezado.oa.codigo).toBe('CN03 OA 01');
    expect(plano.explicacion).toContain('seres vivos');
    expect(plano.ejemplo).toContain('perro');
    expect(plano.ejercicios).toHaveLength(1);
    expect(plano.ejercicios[0]!.numero).toBe(1);
    // El alumno NO ve la solución (mostrarSolucion = false).
    expect(plano.ejercicios[0]!.solucion).toBeUndefined();
  });
});
