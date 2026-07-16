import { describe, expect, it } from 'vitest';

import { ValidadorDescanso } from '../../../src/application/planning/ValidadorDescanso.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('ValidadorDescanso', () => {
  const validador = new ValidadorDescanso();

  it('acepta una semana con exactamente un día LIBRE y máximo seis días operativos', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CAJEROS',
      empleados: [
        Empleado.create({
          nombre: 'Carla',
          estadosPorDia: [
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('LIBRE'),
          ],
        }),
      ],
    });

    expect(validador.validar(unidad)).toEqual([]);
  });

  it('detecta una semana operativa que perdió su día LIBRE', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CAJEROS',
      empleados: [
        Empleado.create({
          nombre: 'Carla',
          estadosPorDia: [
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
          ],
        }),
      ],
    });

    expect(validador.validar(unidad)).toContainEqual({
      empleado: 'Carla',
      tipo: 'DIA_LIBRE_SEMANAL',
      semana: 1,
      diasLibres: 0,
    });
  });

  it('detecta dos dias LIBRE accidentales en la misma semana', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        Empleado.create({
          nombre: 'Mario',
          estadosPorDia: [
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('LIBRE'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('LIBRE'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
          ],
        }),
      ],
    });

    expect(validador.validar(unidad)).toContainEqual({
      empleado: 'Mario',
      tipo: 'DIA_LIBRE_SEMANAL',
      semana: 1,
      diasLibres: 2,
    });
  });

  it('cuenta vacaciones o feriado como la pausa semanal sin crear otro LIBRE', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        Empleado.create({
          nombre: 'Mario',
          estadosPorDia: [
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('VACACIONES'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
          ],
        }),
      ],
    });

    expect(validador.validar(unidad)).toEqual([]);
  });

  it('advierte si una semana con evento conserva ademas un LIBRE duplicado', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        Empleado.create({
          nombre: 'Mario',
          estadosPorDia: [
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('LIBRE'),
            EstadoTurno.create('VACACIONES'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
          ],
        }),
      ],
    });

    expect(validador.validar(unidad)).toContainEqual({
      empleado: 'Mario',
      tipo: 'DIA_LIBRE_SEMANAL',
      semana: 1,
      diasLibres: 1,
    });
  });

  it('acepta descansos adicionales cuando una persona no fue requerida toda la semana', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        Empleado.create({
          nombre: 'Lester',
          estadosPorDia: [
            EstadoTurno.create('TURNO A'),
            EstadoTurno.create('LIBRE'),
            EstadoTurno.create('LIBRE'),
            EstadoTurno.create('LIBRE'),
            EstadoTurno.create('LIBRE'),
            EstadoTurno.create('LIBRE'),
            EstadoTurno.create('LIBRE'),
          ],
        }),
      ],
    });

    expect(validador.validar(unidad)).toEqual([]);
  });

  it('detecta más de seis días operativos consecutivos', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'PISTA',
      empleados: [
        Empleado.create({
          nombre: 'Carlos',
          estadosPorDia: Array.from(
            { length: 7 },
            () => EstadoTurno.create('TURNO B'),
          ),
        }),
      ],
    });

    expect(validador.validar(unidad)).toEqual([
      {
        empleado: 'Carlos',
        tipo: 'DIA_LIBRE_SEMANAL',
        semana: 1,
        diasLibres: 0,
      },
      {
        empleado: 'Carlos',
        tipo: 'DIAS_CONSECUTIVOS',
        diasConsecutivos: 7,
      },
    ]);
  });
});
