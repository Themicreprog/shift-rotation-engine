import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalCalendario } from '../../../src/application/planning/AnalizadorEstadoFinalCalendario.js';
import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from '../../../src/application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { ResolverPrimerDiaSiguientePeriodoParaEmpleado } from '../../../src/application/planning/ResolverPrimerDiaSiguientePeriodoParaEmpleado.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('ResolverPrimerDiaSiguientePeriodoParaEmpleado', () => {
  it('resuelve el primer día del siguiente período usando el flujo completo', () => {
    const calendario = new Calendario('Junio 2026');

    const empleado = Empleado.create({
      nombre: 'Joel',
      estadosPorDia: [
        EstadoTurno.create('Turno A'),
        EstadoTurno.create('Turno B'),
        EstadoTurno.create('Libre'),
      ],
    });

    const unidadOperativa = UnidadOperativa.create({
      nombre: 'TRUCK STOP',
      empleados: [empleado],
    });

    calendario.agregarUnidadOperativa(unidadOperativa);

    const resolver = new ResolverPrimerDiaSiguientePeriodoParaEmpleado(
      new AnalizadorEstadoFinalCalendario(
        new AnalizadorEstadoFinalEmpleado(),
      ),
      new DecisorPrimerDiaContinuidadSimple(),
    );

    const estadoPrimerDia = resolver.resolve(
      calendario,
      'TRUCK STOP',
      'Joel',
    );

    expect(estadoPrimerDia.valor).toBe('LIBRE');
  });

  it('lanza error cuando el empleado solicitado no existe en el análisis final', () => {
    const calendario = new Calendario('Junio 2026');

    const empleado = Empleado.create({
      nombre: 'Rony',
      estadosPorDia: [
        EstadoTurno.create('Turno A'),
      ],
    });

    const unidadOperativa = UnidadOperativa.create({
      nombre: 'CACAO',
      empleados: [empleado],
    });

    calendario.agregarUnidadOperativa(unidadOperativa);

    const resolver = new ResolverPrimerDiaSiguientePeriodoParaEmpleado(
      new AnalizadorEstadoFinalCalendario(
        new AnalizadorEstadoFinalEmpleado(),
      ),
      new DecisorPrimerDiaContinuidadSimple(),
    );

    expect(() =>
      resolver.resolve(calendario, 'CACAO', 'Empleado Inexistente'),
    ).toThrow(
      'No existe resumen final para el empleado Empleado Inexistente en la unidad CACAO.',
    );
  });
});