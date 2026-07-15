import { describe, expect, it } from 'vitest';

import { GeneradorRotacionSemanal } from '../../../src/application/planning/GeneradorRotacionSemanal.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';

describe('GeneradorRotacionSemanal', () => {
  const generador = new GeneradorRotacionSemanal();

  it('genera una secuencia semanal iniciando en TURNO A', () => {
    const resultado = generador.generar(
      EstadoTurno.create('TURNO A'),
      15,
    );

    expect(resultado).toHaveLength(15);

    expect(resultado.map((estado: EstadoTurno) => estado.valor)).toEqual([
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'LIBRE',
      'TURNO B',
      'TURNO B',
      'TURNO B',
      'TURNO B',
      'TURNO B',
      'TURNO B',
      'LIBRE',
      'TURNO A',
    ]);
  });

  it('genera una secuencia semanal iniciando en TURNO B', () => {
    const resultado = generador.generar(
      EstadoTurno.create('TURNO B'),
      15,
    );

    expect(resultado).toHaveLength(15);

    expect(resultado.map((estado: EstadoTurno) => estado.valor)).toEqual([
      'TURNO B',
      'TURNO B',
      'TURNO B',
      'TURNO B',
      'TURNO B',
      'TURNO B',
      'LIBRE',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'LIBRE',
      'TURNO B',
    ]);
  });

  it.each([
    ['VACACIONES'],
    ['FERIADO'],
    ['LIBRE'],
    ['OTRO'],
  ])(
    'mantiene el estado %s durante todo el período',
    (estado: string) => {
      const resultado = generador.generar(
        EstadoTurno.create(estado),
        31,
      );

      expect(resultado).toHaveLength(31);

      expect(
        resultado.every(
          (estadoDia: EstadoTurno) => estadoDia.valor === estado,
        ),
      ).toBe(true);
    },
  );

  it('rechaza períodos sin días válidos', () => {
    expect(() =>
      generador.generar(
        EstadoTurno.create('TURNO A'),
        0,
      ),
    ).toThrow(
      'La cantidad de días para generar continuidad simple debe ser un entero mayor que cero.',
    );
  });
});