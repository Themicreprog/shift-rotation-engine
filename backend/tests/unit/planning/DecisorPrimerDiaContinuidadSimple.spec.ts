import { describe, expect, it } from 'vitest';

import { DecisorPrimerDiaContinuidadSimple } from '../../../src/application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { ResumenEstadoFinalEmpleado } from '../../../src/domain/planning/ResumenEstadoFinalEmpleado.js';

describe('DecisorPrimerDiaContinuidadSimple', () => {
  const decisor = new DecisorPrimerDiaContinuidadSimple();

  it('cambia de turno cuando el período anterior termina en LIBRE', () => {
    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Joel',
      nombreUnidadOperativa: 'TRUCK STOP',
      ultimoDiaConInformacion: 2,
      ultimoEstadoRegistrado: EstadoTurno.create('Libre'),
      ultimoTurno: 'LIBRE',
      ultimaAsignacionOperativaValida: EstadoTurno.create('Turno B'),
    });

    const resultado = decisor.decide(resumen);

    expect(resultado.valor).toBe('TURNO A');
  });

  it('mantiene el comportamiento actual cuando el cierre no es LIBRE', () => {
    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Joel',
      nombreUnidadOperativa: 'TRUCK STOP',
      ultimoDiaConInformacion: 1,
      ultimoEstadoRegistrado: EstadoTurno.create('Turno A'),
      ultimoTurno: 'TURNO A',
      ultimaAsignacionOperativaValida: EstadoTurno.create('Turno A'),
    });

    const resultado = decisor.decide(resumen);

    expect(resultado.valor).toBe('TURNO A');
  });

  it('mantiene LIBRE cuando no existe asignación operativa válida', () => {
    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Joel',
      nombreUnidadOperativa: 'TRUCK STOP',
      ultimoDiaConInformacion: 2,
      ultimoEstadoRegistrado: EstadoTurno.create('Libre'),
      ultimoTurno: 'LIBRE',
      ultimaAsignacionOperativaValida: null,
    });

    const resultado = decisor.decide(resumen);

    expect(resultado.valor).toBe('LIBRE');
  });

  it.each(['Vacaciones', 'Feriado'])(
    'retoma el último turno operativo después de %s',
    (estadoFinal: string) => {
      const resumen = ResumenEstadoFinalEmpleado.create({
        nombreEmpleado: 'Joel',
        nombreUnidadOperativa: 'TRUCK STOP',
        ultimoDiaConInformacion: 2,
        ultimoEstadoRegistrado: EstadoTurno.create(estadoFinal),
        ultimoTurno: estadoFinal,
        ultimaAsignacionOperativaValida: EstadoTurno.create('Turno B'),
      });

      expect(decisor.decide(resumen).valor).toBe('TURNO B');
    },
  );
});
