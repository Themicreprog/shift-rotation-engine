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
import { ComodinesPlanificacion } from '../../../src/domain/planning/ComodinesPlanificacion.js';
import { EventoPlanificacion } from '../../../src/domain/planning/EventoPlanificacion.js';
import { EventosPlanificacion } from '../../../src/domain/planning/EventosPlanificacion.js';
import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
import { TipoEventoPlanificacion } from '../../../src/domain/planning/TipoEventoPlanificacion.js';
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
    expect(resultado.calendario.nombre).toBe('PLANIFICACION-2026-07-COMPLETO');
    expect(resultado.calendario.unidadesOperativas).toHaveLength(2);

    const truckStop = resultado.calendario.buscarUnidadOperativa('TRUCK STOP');
    const cajeros = resultado.calendario.buscarUnidadOperativa('CAJEROS');

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

  it('transfiere al flexible de pista a caja sin asignarlo dos veces y repara pista', () => {
    const calendario = new Calendario('JUNIO 2026');
    const empleadosPista = [
      ['Jose', 'TURNO A'],
      ['Mario', 'TURNO A'],
      ['Edwin', 'TURNO A'],
      ['Rene', 'TURNO B'],
      ['Luis D', 'TURNO B'],
      ['Julio', 'TURNO B'],
      ['Joel', 'TURNO B'],
      ['Lester', 'TURNO B'],
    ] as const;

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO PISTA',
        empleados: empleadosPista.map(([nombre, estado]) =>
          Empleado.create({
            nombre,
            estadosPorDia: [EstadoTurno.create(estado)],
          }),
        ),
      }),
    );
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO CAJA',
        empleados: [
          Empleado.create({
            nombre: 'Natanael',
            estadosPorDia: [EstadoTurno.create('TURNO A')],
          }),
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('TURNO B')],
          }),
        ],
      }),
    );
    const fecha = new Date('2026-07-01T00:00:00.000Z');
    const solicitud = new SolicitudPlanificacion(
      calendario,
      PeriodoPlanificacion.create({ fechaInicio: fecha, fechaFin: fecha }),
      AlcanceOperativo.create({
        unidadesOperativas: ['CACAO PISTA', 'CACAO CAJA'],
      }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Natanael',
          unidadOperativa: 'CACAO CAJA',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: fecha,
          fechaFin: fecha,
        }),
      ]),
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO PISTA', empleado: 'Lester' },
      ]),
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
    const pista = resultado.calendario.buscarUnidadOperativa('CACAO PISTA')!;
    const caja = resultado.calendario.buscarUnidadOperativa('CACAO CAJA')!;
    const edwinPista = pista.empleados.find(
      (empleado) => empleado.nombre === 'Edwin',
    )!;
    const edwinCaja = caja.empleados.find(
      (empleado) => empleado.nombre === 'Edwin',
    )!;
    const lester = pista.empleados.find(
      (empleado) => empleado.nombre === 'Lester',
    )!;

    expect(edwinPista.estadoDelDia(1).valor).toBe('OTRO');
    expect(edwinCaja.estadoDelDia(1).valor).toBe('TURNO A');
    expect(lester.estadoDelDia(1).valor).toBe('TURNO A');
    expect(resultado.cambios).toContain(
      'Flexible Edwin reasignado a TURNO A el día 1 en CACAO CAJA.',
    );
    expect(resultado.cambios).toContain(
      'Flexible Edwin transferido de CACAO PISTA a CACAO CAJA el día 1.',
    );
    expect(resultado.advertencias).not.toContainEqual(
      expect.stringContaining('CACAO PISTA: día 1, TURNO A'),
    );
    expect(resultado.reemplazos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unidadOperativa: 'CACAO CAJA',
          dia: 1,
          empleadoTitular: 'Natanael',
          empleadoReemplazo: 'Edwin',
        }),
        expect.objectContaining({
          unidadOperativa: 'CACAO PISTA',
          dia: 1,
          empleadoTitular: 'Edwin',
          empleadoReemplazo: 'Lester',
        }),
      ]),
    );
  });

  it('cancela la cobertura de caja durante el descanso de pista y usa el comodín', () => {
    const calendario = new Calendario('JUNIO 2026');
    const empleadosPista = [
      ['Jose', 'TURNO A'],
      ['Mario', 'TURNO A'],
      ['Edwin', 'TURNO A'],
      ['Rene', 'TURNO A'],
      ['Luis D', 'TURNO B'],
      ['Julio', 'TURNO B'],
      ['Joel', 'TURNO B'],
    ] as const;

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO PISTA',
        empleados: empleadosPista.map(([nombre, estado]) =>
          Empleado.create({
            nombre,
            estadosPorDia: [EstadoTurno.create(estado)],
          }),
        ),
      }),
    );
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO CAJA',
        empleados: [
          Empleado.create({
            nombre: 'Natanael',
            estadosPorDia: [EstadoTurno.create('TURNO A')],
          }),
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('TURNO B')],
          }),
          Empleado.create({
            nombre: 'Celio',
            estadosPorDia: [EstadoTurno.create('LIBRE')],
          }),
        ],
      }),
    );
    const fechaInicio = new Date('2026-07-01T00:00:00.000Z');
    const fechaDescanso = new Date('2026-07-05T00:00:00.000Z');
    const solicitud = new SolicitudPlanificacion(
      calendario,
      PeriodoPlanificacion.create({
        fechaInicio,
        fechaFin: fechaDescanso,
      }),
      AlcanceOperativo.create({
        unidadesOperativas: ['CACAO PISTA', 'CACAO CAJA'],
      }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Natanael',
          unidadOperativa: 'CACAO CAJA',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: fechaDescanso,
          fechaFin: fechaDescanso,
        }),
      ]),
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Celio' },
      ]),
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
    const pista = resultado.calendario.buscarUnidadOperativa('CACAO PISTA')!;
    const caja = resultado.calendario.buscarUnidadOperativa('CACAO CAJA')!;
    const edwinPista = pista.empleados.find(
      (empleado) => empleado.nombre === 'Edwin',
    )!;
    const edwinCaja = caja.empleados.find(
      (empleado) => empleado.nombre === 'Edwin',
    )!;
    const celio = caja.empleados.find(
      (empleado) => empleado.nombre === 'Celio',
    )!;

    expect(edwinPista.estadoDelDia(5).valor).toBe('LIBRE');
    expect(edwinCaja.estadoDelDia(5).valor).toBe('OTRO');
    expect(celio.estadoDelDia(5).valor).toBe('TURNO A');
    expect(resultado.cambios).toContain(
      'Cobertura de Edwin cancelada en CACAO CAJA el día 5 para respetar su descanso o evento en CACAO PISTA.',
    );
    expect(resultado.cambios).not.toContain(
      'Flexible Edwin reasignado a TURNO A el día 5 en CACAO CAJA.',
    );
    expect(resultado.cambios).toContain(
      'Comodín Celio reasignado a TURNO A el día 5 en CACAO CAJA.',
    );
    expect(resultado.reemplazos).not.toContainEqual(
      expect.objectContaining({
        unidadOperativa: 'CACAO CAJA',
        dia: 5,
        empleadoReemplazo: 'Edwin',
      }),
    );
    expect(resultado.reemplazos).toContainEqual(
      expect.objectContaining({
        unidadOperativa: 'CACAO CAJA',
        dia: 5,
        empleadoTitular: 'Natanael',
        empleadoReemplazo: 'Celio',
        motivo: 'VACACIONES',
      }),
    );
  });

  it('advierte cobertura insegura en dias heredados sin sobrescribirlos', () => {
    const calendario = new Calendario('JULIO 2026', {
      mes: 7,
      anio: 2026,
      fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
      fechaFin: new Date('2026-08-02T00:00:00.000Z'),
    });
    const estadosFinales = [
      ['Jose', 'TURNO A'],
      ['Mario', 'TURNO A'],
      ['Rene', 'TURNO B'],
      ['Julio', 'TURNO B'],
      ['Luis D', 'LIBRE'],
      ['Joel', 'LIBRE'],
    ] as const;

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO PISTA',
        empleados: estadosFinales.map(([nombre, estadoFinal]) =>
          Empleado.create({
            nombre,
            estadosPorDia: Array.from(
              { length: 33 },
              (_, indice) =>
                EstadoTurno.create(indice === 32 ? estadoFinal : 'TURNO A'),
            ),
          }),
        ),
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
        fechaFin: new Date('2026-08-31T00:00:00.000Z'),
      }),
      AlcanceOperativo.create({
        unidadesOperativas: ['CACAO PISTA'],
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

    expect(resultado.conflictos).toEqual([]);
    expect(resultado.advertencias).toContain(
      'Cobertura insuficiente en CACAO PISTA: día 2, TURNO A (2/3).',
    );
    expect(resultado.advertencias).toContain(
      'Cobertura insuficiente en CACAO PISTA: día 2, TURNO B (2/3).',
    );
    expect(
      resultado.calendario
        .buscarUnidadOperativa('CACAO PISTA')
        ?.empleados.find((empleado) => empleado.nombre === 'Jose')
        ?.estadoDelDia(2).valor,
    ).toBe('TURNO A');
  });
});
