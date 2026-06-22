import { describe, expect, it } from 'vitest';
import type { DatosInstitucionalesGuia, Ficha } from '@faro/domain';
import { planoFicha } from './planoFicha.js';

const inst: DatosInstitucionalesGuia = { nombreColegio: 'Escuela X', comuna: 'Conchalí', docente: 'María' };
const ficha: Ficha = {
  asignatura: 'Matemática',
  curso: '1º básico',
  oa: { codigo: 'MA01 OA 01', descripcion: 'Contar del 0 al 100.' },
  concepto: 'conteo de frutas',
  perfil_nivel: '1-2',
  titulo: 'Ficha para colorear: conteo de frutas',
  consigna_dibujo: 'Colorea el dibujo.',
  ejercicios: [
    { oa: 'MA01 OA 01', habilidad: 'recordar', tipo: 'completacion', enunciado: 'Cuenta: 1, 2, ____.' },
  ],
  descripcion_dibujo: 'Three apples',
  imagen_clave: 'abcd1234',
};

describe('planoFicha', () => {
  it('arma el encabezado, los ejercicios (variante alumno) y los datos del dibujo', () => {
    const p = planoFicha(ficha, inst);
    expect(p.encabezado.lineaColegio).toBe('Escuela X · Conchalí');
    expect(p.encabezado.docente).toBe('María');
    expect(p.encabezado.titulo).toBe(ficha.titulo);
    expect(p.encabezado.identificacion).toEqual([['Nombre:', 'Curso:', 'Fecha:']]);
    expect(p.ejercicios).toHaveLength(1);
    expect(p.ejercicios[0]?.numero).toBe(1);
    expect(p.consignaDibujo).toBe('Colorea el dibujo.');
    expect(p.imagenClave).toBe('abcd1234');
    expect(p.descripcionDibujo).toBe('Three apples');
  });

  it('omite docente si no viene', () => {
    const p = planoFicha(ficha, { nombreColegio: 'X', comuna: 'Y' });
    expect(p.encabezado.docente).toBeUndefined();
  });
});
