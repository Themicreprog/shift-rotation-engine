import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from '../../../src/application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from '../../../src/application/planning/DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from '../../../src/application/planning/GeneradorRotacionSemanal.js';
import { ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa } from '../../../src/application/planning/ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa', () => {
  it('resuelve el siguiente período completo para todos los empleados de la unidad', () => {
    const unidadOperativa = UnidadOperativa.create({
      nombre: 'TRUCK STOP',
      empleados: [
        Empleado.create({
          nombre: 'Joel',
          estadosPorDia: [
            EstadoTurno.create('Turno A'),
            EstadoTurno.create('Libre'),
          ],
        }),
        Empleado.create({
          nombre: 'Julio',
          estadosPorDia: [
            EstadoTurno.create('Turno B'),
            EstadoTurno.create('Turno B'),
          ],
        }),
        Empleado.create({
          nombre: 'Mario',
          estadosPorDia: [
            EstadoTurno.create('Vacaciones'),
          ],
        }),
      ],
    });

    const periodoDestino = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-07-01'),
      fechaFin: new Date('2026-07-31'),
    });

    const resolver = new ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
    );

    const resultado = resolver.resolver(unidadOperativa, periodoDestino);

    expect(resultado.nombre).toBe('TRUCK STOP');
    expect(resultado.empleados).toHaveLength(3);

    const joel = resultado.empleados.find(
      (empleado: Empleado) => empleado.nombre === 'Joel',
    );
    const julio = resultado.empleados.find(
      (empleado: Empleado) => empleado.nombre === 'Julio',
    );
    const mario = resultado.empleados.find(
      (empleado: Empleado) => empleado.nombre === 'Mario',
    );

    expect(joel).toBeDefined();
    expect(joel!.totalDias()).toBe(31);

    // C-02
    expect(joel!.estadoDelDia(1).valor).toBe('TURNO A');
    expect(joel!.estadoDelDia(31).valor).toBe('TURNO A');

    expect(julio).toBeDefined();
    expect(julio!.totalDias()).toBe(31);
    expect(julio!.estadoDelDia(1).valor).toBe('TURNO B');
    expect(julio!.estadoDelDia(31).valor).toBe('TURNO B');

    expect(mario).toBeDefined();
    expect(mario!.totalDias()).toBe(31);
    expect(mario!.estadoDelDia(1).valor).toBe('VACACIONES');
    expect(mario!.estadoDelDia(31).valor).toBe('VACACIONES');
  });

  it('devuelve una unidad operativa sin empleados cuando la unidad operativa origen no tiene empleados', () => {
    const unidadOperativa = UnidadOperativa.create({
      nombre: 'CAJEROS',
      empleados: [],
    });

    const periodoDestino = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-07-01'),
      fechaFin: new Date('2026-07-31'),
    });

    const resolver = new ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
    );

    const resultado = resolver.resolver(unidadOperativa, periodoDestino);

    expect(resultado.nombre).toBe('CAJEROS');
    expect(resultado.empleados).toEqual([]);
  });
});