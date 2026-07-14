import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('AnalizadorEstadoFinalEmpleado', () => {
  it('construye el resumen usando el último día con información del empleado', () => {
    const empleado = Empleado.create({
      nombre: 'Rony',
      estadosPorDia: [
        EstadoTurno.create('Turno A'),
        EstadoTurno.create('Turno B'),
        EstadoTurno.create('Libre'),
      ],
    });

    const unidadOperativa = UnidadOperativa.create({
      nombre: 'CACAO',
      empleados: [empleado],
    });

    const analizador = new AnalizadorEstadoFinalEmpleado();

    const resumen = analizador.analyze(unidadOperativa, empleado);

    expect(resumen.nombreEmpleado).toBe('Rony');
    expect(resumen.nombreUnidadOperativa).toBe('CACAO');
    expect(resumen.ultimoDiaConInformacion).toBe(3);
    expect(resumen.ultimoEstadoRegistrado.valor).toBe('LIBRE');
    expect(resumen.ultimoTurno).toBe('LIBRE');
    expect(resumen.ultimaAsignacionValida.valor).toBe('LIBRE');
  });

  it('preserva el último turno cuando el último estado es un turno operativo', () => {
    const empleado = Empleado.create({
      nombre: 'Joel',
      estadosPorDia: [
        EstadoTurno.create('Libre'),
        EstadoTurno.create('Turno B'),
      ],
    });

    const unidadOperativa = UnidadOperativa.create({
      nombre: 'TRUCK STOP',
      empleados: [empleado],
    });

    const analizador = new AnalizadorEstadoFinalEmpleado();

    const resumen = analizador.analyze(unidadOperativa, empleado);

    expect(resumen.ultimoDiaConInformacion).toBe(2);
    expect(resumen.ultimoEstadoRegistrado.valor).toBe('TURNO B');
    expect(resumen.ultimoTurno).toBe('TURNO B');
    expect(resumen.ultimaAsignacionValida.valor).toBe('TURNO B');
  });
});