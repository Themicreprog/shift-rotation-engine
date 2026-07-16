import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from '../../../src/application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from '../../../src/application/planning/DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from '../../../src/application/planning/GeneradorRotacionSemanal.js';
import { PlanificadorUnidadOperativa } from '../../../src/application/planning/PlanificadorUnidadOperativa.js';
import { ValidadorCobertura } from '../../../src/application/planning/ValidadorCobertura.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { EventoPlanificacion } from '../../../src/domain/planning/EventoPlanificacion.js';
import { EventosPlanificacion } from '../../../src/domain/planning/EventosPlanificacion.js';
import { ComodinesPlanificacion } from '../../../src/domain/planning/ComodinesPlanificacion.js';
import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
import { TipoEventoPlanificacion } from '../../../src/domain/planning/TipoEventoPlanificacion.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('PlanificadorUnidadOperativa', () => {
  it('aplica vacaciones y feriados individuales sin alterar a otros empleados', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CAJA',
      empleados: [
        Empleado.create({
          nombre: 'Rony',
          estadosPorDia: [EstadoTurno.create('TURNO A')],
        }),
        Empleado.create({
          nombre: 'Joel',
          estadosPorDia: [EstadoTurno.create('TURNO B')],
        }),
      ],
    });
    const eventos = EventosPlanificacion.create([
      EventoPlanificacion.create({
        empleado: 'Rony',
        tipo: TipoEventoPlanificacion.VACACIONES,
        fechaInicio: new Date('2026-07-02T00:00:00.000Z'),
        fechaFin: new Date('2026-07-03T00:00:00.000Z'),
      }),
      EventoPlanificacion.create({
        empleado: 'Rony',
        tipo: TipoEventoPlanificacion.FERIADO,
        fechaInicio: new Date('2026-07-06T00:00:00.000Z'),
        fechaFin: new Date('2026-07-06T00:00:00.000Z'),
      }),
    ]);

    const resultado = planificador.planificar(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-07T00:00:00.000Z'),
      }),
      eventos,
    );

    const rony = resultado.empleados[0]!;
    const joel = resultado.empleados[1]!;

    expect(rony.estadoDelDia(2).valor).toBe('VACACIONES');
    expect(rony.estadoDelDia(3).valor).toBe('VACACIONES');
    expect(rony.estadoDelDia(6).valor).toBe('FERIADO');
    expect(joel.estadoDelDia(2).valor).not.toBe('VACACIONES');
    expect(joel.estadoDelDia(6).valor).not.toBe('FERIADO');
  });

  it('usa vacaciones o feriado como pausa semanal sin duplicar LIBRE', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        Empleado.create({
          nombre: 'Mario',
          estadosPorDia: [EstadoTurno.create('TURNO A')],
        }),
      ],
    });
    const periodo = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
      fechaFin: new Date('2026-07-07T00:00:00.000Z'),
    });
    const resultado = planificador.planificar(
      unidad,
      periodo,
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Mario',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: new Date('2026-07-02T00:00:00.000Z'),
          fechaFin: new Date('2026-07-02T00:00:00.000Z'),
        }),
      ]),
    );
    const estados = Array.from(
      { length: 7 },
      (_, indice) => resultado.empleados[0]?.estadoDelDia(indice + 1).valor,
    );

    expect(estados[1]).toBe('VACACIONES');
    expect(estados.filter((estado) => estado === 'LIBRE')).toHaveLength(0);
  });

  it('mantiene el turno real del cajero fijo antes y despues de su descanso', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        Empleado.create({
          nombre: 'Natanael',
          estadosPorDia: [
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('TURNO B'),
            EstadoTurno.create('LIBRE'),
          ],
        }),
      ],
    });
    const resultado = planificador.planificar(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-08T00:00:00.000Z'),
        fechaFin: new Date('2026-07-14T00:00:00.000Z'),
      }),
    );
    const estados = Array.from(
      { length: 7 },
      (_, indice) => resultado.empleados[0]?.estadoDelDia(indice + 1).valor,
    );

    expect(estados.filter((estado) => estado === 'LIBRE')).toHaveLength(1);
    expect(
      estados.filter((estado) => estado !== 'LIBRE'),
    ).toEqual(Array.from({ length: 6 }, () => 'TURNO B'));
  });

  it('aplica un evento con unidad solo en la unidad operativa indicada', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        Empleado.create({
          nombre: 'Carlos',
          estadosPorDia: [EstadoTurno.create('TURNO A')],
        }),
      ],
    });
    const eventos = EventosPlanificacion.create([
      EventoPlanificacion.create({
        empleado: 'Carlos',
        unidadOperativa: 'TRUCK STOP PISTA',
        tipo: TipoEventoPlanificacion.FERIADO,
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
      EventoPlanificacion.create({
        empleado: 'Carlos',
        unidadOperativa: 'CACAO PISTA',
        tipo: TipoEventoPlanificacion.VACACIONES,
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ]);

    const resultado = planificador.planificar(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
      eventos,
    );

    expect(resultado.empleados[0]?.estadoDelDia(1).valor).toBe('VACACIONES');
  });

  it('preserva el equipo base y no activa cobertura sin una vacante identificada', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        ['Jose', 'TURNO A'],
        ['Mario', 'TURNO A'],
        ['Rene', 'TURNO B'],
        ['Luis D', 'TURNO B'],
        ['Julio', 'TURNO B'],
        ['Joel', 'TURNO B'],
        ['Celio', 'LIBRE'],
      ].map(([nombre, estado]) =>
        Empleado.create({
          nombre: nombre!,
          estadosPorDia: [EstadoTurno.create(estado!)],
        }),
      ),
    });
    const resultado = planificador.repararCobertura(
      unidad,
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO PISTA', empleado: 'Celio' },
      ]),
    );

    expect(resultado.cambios).toEqual([]);
    expect(resultado.reemplazos).toEqual([]);
    expect(
      resultado.unidadOperativa.empleados.map((empleado) => [
        empleado.nombre,
        empleado.estadoDelDia(1).valor,
      ]),
    ).toEqual([
      ['Jose', 'TURNO A'],
      ['Mario', 'TURNO A'],
      ['Rene', 'TURNO B'],
      ['Luis D', 'TURNO B'],
      ['Julio', 'TURNO B'],
      ['Joel', 'TURNO B'],
      ['Celio', 'LIBRE'],
    ]);
    expect(resultado.incidenciasCobertura).toContainEqual({
      dia: 1,
      turno: 'TURNO A',
      requeridos: 3,
      disponibles: 2,
    });
  });

  it('reasigna a un flexible antes que a un comodín cuando no hay base disponible', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        Empleado.create({
          nombre: 'Natanael',
          estadosPorDia: [EstadoTurno.create('TURNO A')],
        }),
        Empleado.create({
          nombre: 'Edwin',
          estadosPorDia: [EstadoTurno.create('TURNO B')],
        }),
        Empleado.create({
          nombre: 'Rony',
          estadosPorDia: [EstadoTurno.create('TURNO B')],
        }),
        Empleado.create({
          nombre: 'Celio',
          estadosPorDia: [EstadoTurno.create('TURNO B')],
        }),
      ],
    });

    const resultado = planificador.planificarConCobertura(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Natanael',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
          fechaFin: new Date('2026-07-01T00:00:00.000Z'),
        }),
      ]),
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Celio' },
      ]),
    );

    const edwin = resultado.unidadOperativa.empleados.find(
      (empleado) => empleado.nombre === 'Edwin',
    );
    const celio = resultado.unidadOperativa.empleados.find(
      (empleado) => empleado.nombre === 'Celio',
    );

    expect(edwin?.estadoDelDia(1).valor).toBe('TURNO A');
    expect(celio?.estadoDelDia(1).valor).toBe('LIBRE');
    expect(resultado.cambios).toContain(
      'Flexible Edwin reasignado a TURNO A el día 1 en CACAO CAJA.',
    );
    expect(
      resultado.cambios.some((cambio) =>
        cambio.includes('Comodín Celio reasignado'),
      ),
    ).toBe(false);
    expect(resultado.reemplazos).toContainEqual(
      expect.objectContaining({
        empleadoTitular: 'Natanael',
        empleadoReemplazo: 'Edwin',
        tipoCobertura: 'FLEXIBLE',
        motivo: 'VACACIONES',
      }),
    );
  });

  it('usa al flexible para cubrir el descanso de un cajero fijo y registra al titular', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: ['Natanael', 'Rony', 'Edwin'].map((nombre, indice) =>
        Empleado.create({
          nombre,
          estadosPorDia: [
            EstadoTurno.create(indice === 1 ? 'TURNO B' : 'TURNO A'),
          ],
        }),
      ),
    });

    const resultado = planificador.planificarConCobertura(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-07T00:00:00.000Z'),
      }),
    );

    expect(resultado.reemplazos).toContainEqual(
      expect.objectContaining({
        empleadoTitular: 'Rony',
        empleadoReemplazo: 'Edwin',
        tipoCobertura: 'FLEXIBLE',
        motivo: 'DESCANSO',
      }),
    );
  });

  it('no usa al flexible para un feriado del cajero y pasa al comodín', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        ['Natanael', 'TURNO A'],
        ['Rony', 'TURNO B'],
        ['Edwin', 'LIBRE'],
        ['Celio', 'LIBRE'],
      ].map(([nombre, estado]) =>
        Empleado.create({
          nombre: nombre!,
          estadosPorDia: [EstadoTurno.create(estado!)],
        }),
      ),
    });

    const resultado = planificador.planificarConCobertura(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Natanael',
          tipo: TipoEventoPlanificacion.FERIADO,
          fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
          fechaFin: new Date('2026-07-01T00:00:00.000Z'),
        }),
      ]),
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Celio' },
      ]),
    );

    expect(
      resultado.unidadOperativa.empleados
        .find((empleado) => empleado.nombre === 'Edwin')
        ?.estadoDelDia(1).valor,
    ).toBe('LIBRE');
    expect(resultado.reemplazos).toContainEqual(
      expect.objectContaining({
        empleadoTitular: 'Natanael',
        empleadoReemplazo: 'Celio',
        tipoCobertura: 'COMODIN',
        motivo: 'FERIADO',
      }),
    );
  });

  it('sustituye únicamente al ausente con un comodín sin mover al equipo base', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        ['Jose', 'VACACIONES'],
        ['Mario', 'TURNO A'],
        ['Edwin', 'TURNO A'],
        ['Rene', 'TURNO B'],
        ['Luis D', 'TURNO B'],
        ['Julio', 'TURNO B'],
        ['Joel', 'TURNO B'],
        ['Celio', 'LIBRE'],
      ].map(([nombre, estado]) =>
        Empleado.create({
          nombre: nombre!,
          estadosPorDia: [EstadoTurno.create(estado!)],
        }),
      ),
    });

    const resultado = planificador.repararCobertura(
      unidad,
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO PISTA', empleado: 'Celio' },
      ]),
      new Map(),
      [
        {
          unidadOperativa: 'CACAO PISTA',
          dia: 1,
          turno: 'TURNO A',
          empleadoTitular: 'Jose',
          motivo: 'VACACIONES',
        },
      ],
    );
    const estadoDe = (nombre: string) =>
      resultado.unidadOperativa.empleados
        .find((empleado) => empleado.nombre === nombre)
        ?.estadoDelDia(1).valor;

    expect(estadoDe('Jose')).toBe('VACACIONES');
    expect(estadoDe('Mario')).toBe('TURNO A');
    expect(estadoDe('Edwin')).toBe('TURNO A');
    expect(estadoDe('Rene')).toBe('TURNO B');
    expect(estadoDe('Luis D')).toBe('TURNO B');
    expect(estadoDe('Julio')).toBe('TURNO B');
    expect(estadoDe('Joel')).toBe('TURNO B');
    expect(estadoDe('Celio')).toBe('TURNO A');
    expect(resultado.cambios).toEqual([
      'Comodín Celio reasignado a TURNO A el día 1 en CACAO PISTA.',
    ]);
    expect(resultado.reemplazos).toEqual([
      expect.objectContaining({
        empleadoTitular: 'Jose',
        empleadoReemplazo: 'Celio',
        tipoCobertura: 'COMODIN',
        motivo: 'VACACIONES',
      }),
    ]);
    expect(resultado.incidenciasCobertura).toEqual([]);
  });

  it('conserva los estados y advierte cuando una ausencia no tiene relevo', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        ['Jose', 'VACACIONES'],
        ['Mario', 'TURNO A'],
        ['Edwin', 'TURNO A'],
        ['Rene', 'TURNO B'],
        ['Luis D', 'TURNO B'],
        ['Julio', 'TURNO B'],
        ['Joel', 'TURNO B'],
      ].map(([nombre, estado]) =>
        Empleado.create({
          nombre: nombre!,
          estadosPorDia: [EstadoTurno.create(estado!)],
        }),
      ),
    });

    const resultado = planificador.repararCobertura(
      unidad,
      ComodinesPlanificacion.vacio(),
      new Map(),
      [
        {
          unidadOperativa: 'CACAO PISTA',
          dia: 1,
          turno: 'TURNO A',
          empleadoTitular: 'Jose',
          motivo: 'VACACIONES',
        },
      ],
    );

    expect(resultado.cambios).toEqual([]);
    expect(resultado.reemplazos).toEqual([]);
    expect(resultado.vacantesPendientes).toEqual([
      expect.objectContaining({
        empleadoTitular: 'Jose',
        turno: 'TURNO A',
        motivo: 'VACACIONES',
      }),
    ]);
    expect(
      resultado.unidadOperativa.empleados.map((empleado) => [
        empleado.nombre,
        empleado.estadoDelDia(1).valor,
      ]),
    ).toEqual([
      ['Jose', 'VACACIONES'],
      ['Mario', 'TURNO A'],
      ['Edwin', 'TURNO A'],
      ['Rene', 'TURNO B'],
      ['Luis D', 'TURNO B'],
      ['Julio', 'TURNO B'],
      ['Joel', 'TURNO B'],
    ]);
    expect(resultado.incidenciasCobertura).toContainEqual({
      dia: 1,
      turno: 'TURNO A',
      requeridos: 3,
      disponibles: 2,
    });
  });

  it('mantiene al flexible de caja como reserva cuando no hay faltantes', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
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
          nombre: 'Edwin',
          estadosPorDia: [EstadoTurno.create('TURNO A')],
        }),
      ],
    });

    const resultado = planificador.planificarConCobertura(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
    );
    const edwin = resultado.unidadOperativa.empleados.find(
      (empleado) => empleado.nombre === 'Edwin',
    );

    expect(edwin?.estadoDelDia(1).valor).toBe('LIBRE');
    expect(resultado.cambios).toEqual([]);
  });

  it('activa un comodín válido solo cuando existe un faltante', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
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
          nombre: 'Lester',
          estadosPorDia: [EstadoTurno.create('TURNO B')],
        }),
      ],
    });

    const resultado = planificador.planificarConCobertura(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Natanael',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
          fechaFin: new Date('2026-07-01T00:00:00.000Z'),
        }),
      ]),
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Lester' },
      ]),
    );

    const lester = resultado.unidadOperativa.empleados.find(
      (empleado) => empleado.nombre === 'Lester',
    );

    expect(lester?.estadoDelDia(1).valor).toBe('TURNO A');
    expect(resultado.incidenciasCobertura).toHaveLength(0);
  });

  it('conserva una sustitucion manual de la rotacion de CACAO', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        Empleado.create({
          nombre: 'Jose',
          estadosPorDia: [EstadoTurno.create('TURNO A')],
        }),
        Empleado.create({
          nombre: 'Sustituto manual',
          estadosPorDia: [EstadoTurno.create('TURNO B')],
        }),
        Empleado.create({
          nombre: 'Natanael',
          estadosPorDia: [EstadoTurno.create('TURNO A')],
        }),
        Empleado.create({
          nombre: 'Rony',
          estadosPorDia: [EstadoTurno.create('TURNO B')],
        }),
      ],
    });

    const resultado = planificador.planificar(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
    );

    expect(resultado.empleados.map((empleado) => empleado.nombre)).toEqual([
      'Jose',
      'Sustituto manual',
      'Natanael',
      'Rony',
    ]);
  });

  it('valida CACAO PISTA con cobertura de pista y no como caja', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: ['Jose', 'Mario', 'Rene', 'Joel'].map((nombre, indice) =>
        Empleado.create({
          nombre,
          estadosPorDia: [
            EstadoTurno.create(indice < 2 ? 'TURNO A' : 'TURNO B'),
          ],
        }),
      ),
    });

    const resultado = planificador.planificarConCobertura(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
    );

    expect(resultado.incidenciasCobertura).toEqual([
      { dia: 1, turno: 'TURNO A', requeridos: 3, disponibles: 2 },
      { dia: 1, turno: 'TURNO B', requeridos: 3, disponibles: 2 },
    ]);
  });

  it('reparte descansos de CACAO PISTA siguiendo el orden base real', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: ['Joel', 'Rene', 'Jose', 'Julio', 'Edwin', 'Mario', 'Luis D'].map(
        (nombre) =>
          Empleado.create({
            nombre,
            estadosPorDia: [EstadoTurno.create('TURNO A')],
          }),
      ),
    });

    const resultado = planificador.planificar(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-07T00:00:00.000Z'),
      }),
    );
    const diaLibrePorEmpleado = Object.fromEntries(
      resultado.empleados.map((empleado) => [
        empleado.nombre,
        Array.from(
          { length: 7 },
          (_, indice) => empleado.estadoDelDia(indice + 1).valor,
        ).findIndex((estado) => estado === 'LIBRE') + 1,
      ]),
    );

    expect(diaLibrePorEmpleado).toEqual({
      Joel: 1,
      Rene: 4,
      Jose: 7,
      Julio: 2,
      Edwin: 5,
      Mario: 6,
      'Luis D': 3,
    });
  });

  it('garantiza descanso al comodín aunque persista el faltante', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
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
          nombre: 'Lester',
          estadosPorDia: [EstadoTurno.create('LIBRE')],
        }),
      ],
    });
    const periodo = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
      fechaFin: new Date('2026-07-07T00:00:00.000Z'),
    });

    const resultado = planificador.planificarConCobertura(
      unidad,
      periodo,
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Natanael',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: periodo.fechaInicio,
          fechaFin: periodo.fechaFin,
        }),
      ]),
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Lester' },
      ]),
    );
    const lester = resultado.unidadOperativa.empleados.find(
      (empleado) => empleado.nombre === 'Lester',
    );

    expect(
      Array.from(
        { length: 7 },
        (_, indice) => lester?.estadoDelDia(indice + 1).valor,
      ),
    ).toEqual([
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'TURNO A',
      'LIBRE',
    ]);
    expect(resultado.incidenciasDescanso).toEqual([]);
    expect(resultado.incidenciasCobertura).toContainEqual({
      dia: 7,
      turno: 'TURNO A',
      requeridos: 1,
      disponibles: 0,
    });
  });

  it('no usa un comodin configurado para otra unidad', () => {
    const planificador = new PlanificadorUnidadOperativa(
      new AnalizadorEstadoFinalEmpleado(),
      new DecisorPrimerDiaContinuidadSimple(),
      new GeneradorRotacionSemanal(),
      new DistribuidorDiaLibre(),
      new ValidadorCobertura(),
    );
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        Empleado.create({
          nombre: 'Natanael',
          estadosPorDia: [EstadoTurno.create('TURNO A')],
        }),
        Empleado.create({
          nombre: 'Celio',
          estadosPorDia: [EstadoTurno.create('TURNO B')],
        }),
      ],
    });

    const resultado = planificador.planificarConCobertura(
      unidad,
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Natanael',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
          fechaFin: new Date('2026-07-01T00:00:00.000Z'),
        }),
      ]),
      ComodinesPlanificacion.create([
        { unidadOperativa: 'TRUCK STOP CAJA', empleado: 'Celio' },
      ]),
    );

    expect(resultado.cambios).toEqual([]);
    expect(
      resultado.unidadOperativa.empleados
        .find((empleado) => empleado.nombre === 'Celio')
        ?.estadoDelDia(1).valor,
    ).toBe('LIBRE');
    expect(resultado.incidenciasCobertura).toHaveLength(2);
  });
});
