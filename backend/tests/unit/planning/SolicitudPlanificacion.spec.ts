import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalCalendario } from '../../../src/application/planning/AnalizadorEstadoFinalCalendario.js';
import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from '../../../src/application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from '../../../src/application/planning/DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from '../../../src/application/planning/GeneradorRotacionSemanal.js';
import { PlanificacionInputValidator } from '../../../src/application/planning/PlanificacionInputValidator.js';
import { PlanificadorUnidadOperativa } from '../../../src/application/planning/PlanificadorUnidadOperativa.js';
import { PlanningEngine } from '../../../src/application/planning/PlanningEngine.js';
import { SolicitudPlanificacion } from '../../../src/application/planning/SolicitudPlanificacion.js';
import { ValidadorCobertura } from '../../../src/application/planning/ValidadorCobertura.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { AlcanceOperativo } from '../../../src/domain/planning/AlcanceOperativo.js';
import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('PlanningEngine', () => {
  it('devuelve conflictos cuando la solicitud no es válida', () => {
    const calendario = new Calendario('JUNIO 2026');

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'TRUCK STOP',
        empleados: [],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-07-31'),
      }),
      AlcanceOperativo.create({
        unidadesOperativas: ['CAJEROS'],
      }),
    );

    const engine = new PlanningEngine(
      new PlanificacionInputValidator(),
      new AnalizadorEstadoFinalCalendario(
        new AnalizadorEstadoFinalEmpleado(),
      ),
      new PlanificadorUnidadOperativa(
        new AnalizadorEstadoFinalEmpleado(),
        new DecisorPrimerDiaContinuidadSimple(),
        new GeneradorRotacionSemanal(),
        new DistribuidorDiaLibre(),
        new ValidadorCobertura(),
      ),
    );

    const resultado = engine.execute(solicitud);

    expect(resultado.calendario).toBe(calendario);
    expect(resultado.cambios).toEqual([]);
    expect(resultado.advertencias).toEqual([]);
    expect(resultado.conflictos).toEqual([
      'El alcance operativo contiene unidades inexistentes en el calendario origen: CAJEROS.',
    ]);
  });

  it('construye un calendario destino completo para todas las unidades del alcance', () => {
    const calendario = new Calendario('JUNIO 2026');

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'TRUCK STOP',
        empleados: [
          Empleado.create({
            nombre: 'Joel',
            estadosPorDia: [EstadoTurno.create('Libre')],
          }),
          Empleado.create({
            nombre: 'Julio',
            estadosPorDia: [EstadoTurno.create('Turno B')],
          }),
        ],
      }),
    );

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CAJEROS',
        empleados: [
          Empleado.create({
            nombre: 'Mario',
            estadosPorDia: [EstadoTurno.create('Vacaciones')],
          }),
        ],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-07-31'),
      }),
      AlcanceOperativo.create({
        unidadesOperativas: ['TRUCK STOP', 'CAJEROS'],
      }),
    );

    const engine = new PlanningEngine(
      new PlanificacionInputValidator(),
      new AnalizadorEstadoFinalCalendario(
        new AnalizadorEstadoFinalEmpleado(),
      ),
      new PlanificadorUnidadOperativa(
        new AnalizadorEstadoFinalEmpleado(),
        new DecisorPrimerDiaContinuidadSimple(),
        new GeneradorRotacionSemanal(),
        new DistribuidorDiaLibre(),
        new ValidadorCobertura(),
      ),
    );

    const resultado = engine.execute(solicitud);

    expect(resultado.cambios).toEqual([]);
    expect(resultado.advertencias).not.toEqual([]);
    expect(resultado.conflictos).toEqual([]);

    expect(resultado.calendario).not.toBe(calendario);
    expect(resultado.calendario.nombre).toBe(
      'PLANIFICACION-2026-07-COMPLETO',
    );
    expect(resultado.calendario.unidadesOperativas).toHaveLength(2);

    const truckStop =
      resultado.calendario.buscarUnidadOperativa('TRUCK STOP');
    const cajeros =
      resultado.calendario.buscarUnidadOperativa('CAJEROS');

    expect(truckStop).toBeDefined();
    expect(cajeros).toBeDefined();

    expect(truckStop!.empleados).toHaveLength(2);

    const joel = truckStop!.empleados.find(
      (empleado: Empleado) => empleado.nombre === 'Joel',
    );
    const julio = truckStop!.empleados.find(
      (empleado: Empleado) => empleado.nombre === 'Julio',
    );
    const mario = cajeros!.empleados.find(
      (empleado: Empleado) => empleado.nombre === 'Mario',
    );

    expect(joel).toBeDefined();
    expect(joel!.nombre).toBe('Joel');
    expect(joel!.totalDias()).toBe(31);
    expect(joel!.estadoDelDia(1).valor).toBe('LIBRE');
    expect(joel!.estadoDelDia(31).valor).toBe('LIBRE');

    expect(julio).toBeDefined();
    expect(julio!.nombre).toBe('Julio');
    expect(julio!.totalDias()).toBe(31);
    expect(julio!.estadoDelDia(1).valor).toBe('TURNO B');
    expect(julio!.estadoDelDia(31).valor).toBe('TURNO B');

    expect(cajeros!.empleados).toHaveLength(1);
    expect(mario).toBeDefined();
    expect(mario!.nombre).toBe('Mario');
    expect(mario!.totalDias()).toBe(31);
    expect(mario!.estadoDelDia(1).valor).toBe('VACACIONES');
    expect(mario!.estadoDelDia(31).valor).toBe('VACACIONES');
  });

  it('solo construye unidades incluidas en el alcance solicitado', () => {
    const calendario = new Calendario('JUNIO 2026');

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'TRUCK STOP',
        empleados: [
          Empleado.create({
            nombre: 'Joel',
            estadosPorDia: [EstadoTurno.create('Libre')],
          }),
        ],
      }),
    );

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CAJEROS',
        empleados: [
          Empleado.create({
            nombre: 'Mario',
            estadosPorDia: [EstadoTurno.create('Vacaciones')],
          }),
        ],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-07-31'),
      }),
      AlcanceOperativo.create({
        unidadesOperativas: ['CAJEROS'],
      }),
    );

    const engine = new PlanningEngine(
      new PlanificacionInputValidator(),
      new AnalizadorEstadoFinalCalendario(
        new AnalizadorEstadoFinalEmpleado(),
      ),
      new PlanificadorUnidadOperativa(
        new AnalizadorEstadoFinalEmpleado(),
        new DecisorPrimerDiaContinuidadSimple(),
        new GeneradorRotacionSemanal(),
        new DistribuidorDiaLibre(),
        new ValidadorCobertura(),
      ),
    );

    const resultado = engine.execute(solicitud);

    expect(resultado.calendario.unidadesOperativas).toHaveLength(1);
    expect(
      resultado.calendario.buscarUnidadOperativa('CAJEROS'),
    ).toBeDefined();
    expect(
      resultado.calendario.buscarUnidadOperativa('TRUCK STOP'),
    ).toBeUndefined();
  });
});
