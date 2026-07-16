import { describe, expect, it } from 'vitest';

import { DistribuidorDiaLibre } from '../../../src/application/planning/DistribuidorDiaLibre.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';

describe('DistribuidorDiaLibre', () => {
  it('reparte los descansos durante la semana de forma determinista', () => {
    const empleados = Array.from({ length: 7 }, (_, indice) =>
      Empleado.create({
        nombre: `Empleado ${indice + 1}`,
        estadosPorDia: [EstadoTurno.create('TURNO A')],
      }),
    );

    const distribucion = new DistribuidorDiaLibre().distribuir(empleados);

    expect([...distribucion.values()].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it('escalona caja para que el turno A descanse antes que el turno B', () => {
    const cajeroA = Empleado.create({
      nombre: 'Norlan',
      estadosPorDia: [EstadoTurno.create('TURNO A')],
    });
    const cajeroB = Empleado.create({
      nombre: 'Derlin',
      estadosPorDia: [EstadoTurno.create('TURNO B')],
    });
    const distribucion = new DistribuidorDiaLibre().distribuirConContinuidad(
      [cajeroB, cajeroA],
      new Map([
        ['Norlan', 6],
        ['Derlin', 5],
      ]),
      new Map([
        ['Norlan', EstadoTurno.create('TURNO A')],
        ['Derlin', EstadoTurno.create('TURNO B')],
      ]),
    );

    expect(distribucion.get('Norlan')).toBeLessThan(
      distribucion.get('Derlin')!,
    );
  });
});