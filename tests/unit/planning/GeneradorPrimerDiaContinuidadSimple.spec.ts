import { describe, expect, it } from 'vitest';

import { GeneradorPrimerDiaContinuidadSimple } from '../../../src/application/planning/GeneradorPrimerDiaContinuidadSimple.js';
import { ResumenEstadoFinalEmpleado } from '../../../src/domain/planning/ResumenEstadoFinalEmpleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';

describe('GeneradorPrimerDiaContinuidadSimple', () => {
  it('conserva TURNO A cuando el último estado registrado es TURNO A', () => {
    const ultimoEstadoRegistrado = EstadoTurno.create('Turno A');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Rony',
      nombreUnidadOperativa: 'CACAO',
      ultimoDiaConInformacion: 30,
      ultimoEstadoRegistrado,
      ultimoTurno: 'TURNO A',
      ultimaAsignacionValida: ultimoEstadoRegistrado,
    });

    const generador = new GeneradorPrimerDiaContinuidadSimple();

    const estadoGenerado = generador.generate(resumen);

    expect(estadoGenerado.valor).toBe('TURNO A');
  });

  it('conserva LIBRE cuando el último estado registrado es LIBRE', () => {
    const ultimoEstadoRegistrado = EstadoTurno.create('Libre');

    const resumen = ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: 'Joel',
      nombreUnidadOperativa: 'TRUCK STOP',
      ultimoDiaConInformacion: 30,
      ultimoEstadoRegistrado,
      ultimoTurno: 'LIBRE',
      ultimaAsignacionValida: ultimoEstadoRegistrado,
    });

    const generador = new GeneradorPrimerDiaContinuidadSimple();

    const estadoGenerado = generador.generate(resumen);

    expect(estadoGenerado.valor).toBe('LIBRE');
  });
});