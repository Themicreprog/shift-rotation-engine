import { describe, expect, it } from 'vitest';

import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { ResumenEstadoFinalEmpleado } from '../../../src/domain/planning/ResumenEstadoFinalEmpleado.js';

describe('ResumenEstadoFinalEmpleado', () => {
  it('crea un resumen válido del estado final de un empleado', () => {
    const ultimoEstado = EstadoTurno.create('Turno B');
    const ultimaAsignacionOperativa = EstadoTurno.create('Turno B');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Rony',
      nombreUnidadOperativa: 'CACAO',
      ultimoDiaConInformacion: 31,
      ultimoEstadoRegistrado: ultimoEstado,
      ultimoTurno: 'turno b',
      ultimaAsignacionOperativaValida: ultimaAsignacionOperativa,
    });

    expect(resumen.nombreEmpleado).toBe('Rony');
    expect(resumen.nombreUnidadOperativa).toBe('CACAO');
    expect(resumen.ultimoDiaConInformacion).toBe(31);
    expect(resumen.ultimoEstadoRegistrado).toBe(ultimoEstado);
    expect(resumen.ultimoTurno).toBe('TURNO B');
    expect(resumen.ultimaAsignacionOperativaValida).toBe(
      ultimaAsignacionOperativa,
    );
  });

  it('falla si el nombre del empleado está vacío', () => {
    expect(() =>
      ResumenEstadoFinalEmpleado.create({
        nombreEmpleado: '   ',
        nombreUnidadOperativa: 'CACAO',
        ultimoDiaConInformacion: 31,
        ultimoEstadoRegistrado: EstadoTurno.create('Turno A'),
        ultimoTurno: 'TURNO A',
        ultimaAsignacionOperativaValida: EstadoTurno.create('Turno A'),
      }),
    ).toThrowError(
      'ResumenEstadoFinalEmpleado.nombreEmpleado no puede estar vacío.',
    );
  });

  it('falla si el último día con información no es válido', () => {
    expect(() =>
      ResumenEstadoFinalEmpleado.create({
        nombreEmpleado: 'Rony',
        nombreUnidadOperativa: 'CACAO',
        ultimoDiaConInformacion: 0,
        ultimoEstadoRegistrado: EstadoTurno.create('LIBRE'),
        ultimoTurno: 'LIBRE',
        ultimaAsignacionOperativaValida: null,
      }),
    ).toThrowError(
      'ResumenEstadoFinalEmpleado.ultimoDiaConInformacion debe ser un entero mayor que cero.',
    );
  });
});