import { describe, expect, it } from 'vitest';

import { GeneradorEstadosContinuidadSimple } from '../../../src/application/planning/GeneradorEstadosContinuidadSimple.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';

describe('GeneradorEstadosContinuidadSimple', () => {
  const generador = new GeneradorEstadosContinuidadSimple();

  it.each([
    ['TURNO A'],
    ['TURNO B'],
    ['LIBRE'],
    ['VACACIONES'],
    ['FERIADO'],
    ['OTRO'],
  ])(
    'repite el estado %s durante todos los días solicitados',
    (estado) => {
      const resultado = generador.generar(EstadoTurno.create(estado), 31);

      expect(resultado).toHaveLength(31);
      expect(
        resultado.every((estadoDia: EstadoTurno) => estadoDia.valor === estado),
      ).toBe(true);
    },
  );

  it('rechaza períodos sin días válidos', () => {
    expect(() =>
      generador.generar(EstadoTurno.create('TURNO A'), 0),
    ).toThrow(
      'La cantidad de días para generar continuidad simple debe ser un entero mayor que cero.',
    );
  });
});