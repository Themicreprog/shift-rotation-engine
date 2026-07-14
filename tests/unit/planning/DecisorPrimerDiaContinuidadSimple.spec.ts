import { describe, expect, it } from 'vitest';

import { DecisorPrimerDiaContinuidadSimple } from '../../../src/application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { ResumenEstadoFinalEmpleado } from '../../../src/domain/planning/ResumenEstadoFinalEmpleado.js';

describe('DecisorPrimerDiaContinuidadSimple', () => {
  it('conserva TURNO A cuando el último estado conocido es TURNO A', () => {
    const ultimoEstadoRegistrado = EstadoTurno.create('Turno A');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Rony',
      nombreUnidadOperativa: 'CACAO',
      ultimoDiaConInformacion: 30,
      ultimoEstadoRegistrado,
      ultimoTurno: 'TURNO A',
      ultimaAsignacionValida: ultimoEstadoRegistrado,
    });

    const decisor = new DecisorPrimerDiaContinuidadSimple();

    const estadoPrimerDia = decisor.decide(resumen);

    expect(estadoPrimerDia.valor).toBe('TURNO A');
  });

  it('conserva TURNO B cuando el último estado conocido es TURNO B', () => {
    const ultimoEstadoRegistrado = EstadoTurno.create('Turno B');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Joel',
      nombreUnidadOperativa: 'TRUCK STOP',
      ultimoDiaConInformacion: 30,
      ultimoEstadoRegistrado,
      ultimoTurno: 'TURNO B',
      ultimaAsignacionValida: ultimoEstadoRegistrado,
    });

    const decisor = new DecisorPrimerDiaContinuidadSimple();

    const estadoPrimerDia = decisor.decide(resumen);

    expect(estadoPrimerDia.valor).toBe('TURNO B');
  });

  it('conserva LIBRE cuando el último estado conocido es LIBRE', () => {
    const ultimoEstadoRegistrado = EstadoTurno.create('Libre');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Mario',
      nombreUnidadOperativa: 'CACAO',
      ultimoDiaConInformacion: 30,
      ultimoEstadoRegistrado,
      ultimoTurno: 'LIBRE',
      ultimaAsignacionValida: ultimoEstadoRegistrado,
    });

    const decisor = new DecisorPrimerDiaContinuidadSimple();

    const estadoPrimerDia = decisor.decide(resumen);

    expect(estadoPrimerDia.valor).toBe('LIBRE');
  });

  it('conserva FERIADO cuando el último estado conocido es FERIADO', () => {
    const ultimoEstadoRegistrado = EstadoTurno.create('Feriado');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Luis',
      nombreUnidadOperativa: 'CAJA CACAO',
      ultimoDiaConInformacion: 30,
      ultimoEstadoRegistrado,
      ultimoTurno: 'FERIADO',
      ultimaAsignacionValida: ultimoEstadoRegistrado,
    });

    const decisor = new DecisorPrimerDiaContinuidadSimple();

    const estadoPrimerDia = decisor.decide(resumen);

    expect(estadoPrimerDia.valor).toBe('FERIADO');
  });

  it('conserva VACACIONES cuando el último estado conocido es VACACIONES', () => {
    const ultimoEstadoRegistrado = EstadoTurno.create('Vacaciones');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Julio',
      nombreUnidadOperativa: 'TRUCK STOP',
      ultimoDiaConInformacion: 30,
      ultimoEstadoRegistrado,
      ultimoTurno: 'VACACIONES',
      ultimaAsignacionValida: ultimoEstadoRegistrado,
    });

    const decisor = new DecisorPrimerDiaContinuidadSimple();

    const estadoPrimerDia = decisor.decide(resumen);

    expect(estadoPrimerDia.valor).toBe('VACACIONES');
  });

  it('conserva OTRO cuando el último estado conocido es OTRO', () => {
    const ultimoEstadoRegistrado = EstadoTurno.create('Capacitacion');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Edwin',
      nombreUnidadOperativa: 'CACAO',
      ultimoDiaConInformacion: 30,
      ultimoEstadoRegistrado,
      ultimoTurno: 'CAPACITACION',
      ultimaAsignacionValida: ultimoEstadoRegistrado,
    });

    const decisor = new DecisorPrimerDiaContinuidadSimple();

    const estadoPrimerDia = decisor.decide(resumen);

    expect(estadoPrimerDia.valor).toBe('CAPACITACION');
  });
});