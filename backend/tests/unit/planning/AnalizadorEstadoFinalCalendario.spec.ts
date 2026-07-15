import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalCalendario } from '../../../src/application/planning/AnalizadorEstadoFinalCalendario.js';
import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('AnalizadorEstadoFinalCalendario', () => {
  it('analiza todos los empleados de todas las unidades operativas', () => {
    const calendario = new Calendario('Junio 2026');

    const empleadoCacao = Empleado.create({
      nombre: 'Rony',
      estadosPorDia: [
        EstadoTurno.create('Turno A'),
        EstadoTurno.create('Libre'),
      ],
    });

    const empleadoTruck = Empleado.create({
      nombre: 'Joel',
      estadosPorDia: [
        EstadoTurno.create('Turno B'),
        EstadoTurno.create('Turno B'),
      ],
    });

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO',
        empleados: [empleadoCacao],
      }),
    );

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'TRUCK STOP',
        empleados: [empleadoTruck],
      }),
    );

    const analizador = new AnalizadorEstadoFinalCalendario(
      new AnalizadorEstadoFinalEmpleado(),
    );

    const resumenes = analizador.analyze(calendario);

    expect(resumenes).toHaveLength(2);

    expect(resumenes[0]?.nombreUnidadOperativa).toBe('CACAO');
    expect(resumenes[0]?.nombreEmpleado).toBe('Rony');
    expect(resumenes[0]?.ultimoTurno).toBe('LIBRE');

    expect(resumenes[1]?.nombreUnidadOperativa).toBe('TRUCK STOP');
    expect(resumenes[1]?.nombreEmpleado).toBe('Joel');
    expect(resumenes[1]?.ultimoTurno).toBe('TURNO B');
  });

  it('devuelve una lista vacía cuando el calendario no tiene unidades operativas', () => {
    const calendario = new Calendario('Junio 2026');

    const analizador = new AnalizadorEstadoFinalCalendario(
      new AnalizadorEstadoFinalEmpleado(),
    );

    const resumenes = analizador.analyze(calendario);

    expect(resumenes).toEqual([]);
  });
});