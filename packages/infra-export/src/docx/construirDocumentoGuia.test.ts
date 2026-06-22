// packages/infra-export/src/docx/construirDocumentoGuia.test.ts
// Safety-net de render: verifica que construirDocumentoGuia produce un Document válido y un buffer
// docx no vacío, cubriendo ejercicios de tipos no triviales (seleccion_multiple + terminos_pareados).

import { describe, expect, it } from 'vitest';
import type { DatosInstitucionalesGuia, Guia } from '@faro/domain';
import { Document, Packer } from 'docx';
import { construirDocumentoGuia } from './construirDocumentoGuia.js';
import { planoGuia } from './planoGuia.js';

const guia: Guia = {
  asignatura: 'Ciencias Naturales',
  curso: '4º básico',
  oa: { codigo: 'CN04 OA 03', descripcion: 'Describir las etapas del ciclo del agua.' },
  conocimiento: 'Ciclo del agua',
  perfil_nivel: '3-4',
  titulo: 'Guía: El ciclo del agua',
  explicacion: 'El agua recorre un ciclo que incluye evaporación, condensación y precipitación.',
  ejemplo: 'Cuando el sol calienta el mar, el agua se evapora y luego cae como lluvia.',
  ejercicios: [
    {
      oa: 'CN04 OA 03',
      habilidad: 'aplicar',
      tipo: 'seleccion_multiple',
      enunciado: '¿Qué proceso ocurre cuando el agua líquida se transforma en vapor?',
      alternativas: [
        { texto: 'Evaporación', correcta: true },
        { texto: 'Condensación', correcta: false },
        { texto: 'Precipitación', correcta: false },
      ],
      puntaje: 2,
      retroalimentacion: 'La evaporación transforma el agua líquida en vapor por el calor.',
    },
    {
      oa: 'CN04 OA 03',
      habilidad: 'comprender',
      tipo: 'terminos_pareados',
      enunciado: 'Une cada etapa del ciclo del agua con su descripción.',
      pares: [
        { columnaA: 'Evaporación', columnaB: 'El agua sube al cielo como vapor' },
        { columnaA: 'Condensación', columnaB: 'El vapor forma nubes' },
        { columnaA: 'Precipitación', columnaB: 'El agua cae como lluvia o nieve' },
      ],
      puntaje: 3,
      retroalimentacion: 'Cada etapa transforma el agua de una forma distinta.',
    },
  ],
};

const inst: DatosInstitucionalesGuia = {
  nombreColegio: 'Escuela Básica Los Arrayanes',
  comuna: 'Maipú',
};

describe('construirDocumentoGuia (render .docx)', () => {
  it('produce un Document válido y un buffer docx no vacío a partir del IR', async () => {
    const plano = planoGuia(guia, inst);
    const doc = construirDocumentoGuia(plano);
    expect(doc).toBeInstanceOf(Document);
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });
});
