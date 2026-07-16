import { describe, expect, it } from 'vitest';

import { PlanificacionInputValidator } from '../../../src/application/planning/PlanificacionInputValidator.js';
import { SolicitudPlanificacion } from '../../../src/application/planning/SolicitudPlanificacion.js';
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

function createPeriodo(): PeriodoPlanificacion {
  return PeriodoPlanificacion.create({
    fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
    fechaFin: new Date('2026-07-31T00:00:00.000Z'),
  });
}

describe('PlanificacionInputValidator', () => {
  it('devuelve una validación exitosa cuando el alcance existe dentro del calendario origen', () => {
    const calendario = new Calendario('Junio 2026');
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO',
        empleados: [
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('Turno A')],
          }),
        ],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: ['CACAO'] }),
    );

    const validator = new PlanificacionInputValidator();
    const result = validator.validate(solicitud);

    expect(result.esValida).toBe(true);
    expect(result.errores).toEqual([]);
  });

  it('devuelve errores cuando el alcance contiene unidades inexistentes', () => {
    const calendario = new Calendario('Junio 2026');
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO',
        empleados: [
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('Turno A')],
          }),
        ],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: ['TRUCK STOP'] }),
    );

    const validator = new PlanificacionInputValidator();
    const result = validator.validate(solicitud);

    expect(result.esValida).toBe(false);
    expect(result.errores).toEqual([
      'El alcance operativo contiene unidades inexistentes en el calendario origen: TRUCK STOP.',
    ]);
  });

  it('rechaza comodines inexistentes o fuera del alcance operativo', () => {
    const calendario = new Calendario('Junio 2026');
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO',
        empleados: [
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('Turno A')],
          }),
        ],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: ['CACAO'] }),
      undefined,
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO', empleado: 'Celio' },
      ]),
    );

    const result = new PlanificacionInputValidator().validate(solicitud);

    expect(result.esValida).toBe(false);
    expect(result.errores).toEqual([
      'El comodín Celio no existe dentro de la unidad operativa CACAO incluida en el alcance.',
    ]);
  });

  it('rechaza cajeros fijos ubicados en pista o en otra estación', () => {
    const calendario = new Calendario('Junio 2026');
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO PISTA',
        empleados: [
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('TURNO A')],
          }),
          Empleado.create({
            nombre: 'Norlan',
            estadosPorDia: [EstadoTurno.create('TURNO B')],
          }),
        ],
      }),
    );

    const resultado = new PlanificacionInputValidator().validate(
      new SolicitudPlanificacion(
        calendario,
        createPeriodo(),
        AlcanceOperativo.create({ unidadesOperativas: ['CACAO PISTA'] }),
      ),
    );

    expect(resultado.esValida).toBe(false);
    expect(resultado.errores).toEqual([
      'Rony es cajero fijo de CACAO CAJA y no puede planificarse en CACAO PISTA.',
      'Norlan es cajero fijo de TRUCK STOP CAJA y no puede planificarse en CACAO PISTA.',
    ]);
  });

  it('rechaza eventos totalmente anteriores o posteriores al periodo destino', () => {
    const calendario = new Calendario('Junio 2026');
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO',
        empleados: [
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('Turno A')],
          }),
          Empleado.create({
            nombre: 'Natanael',
            estadosPorDia: [EstadoTurno.create('Turno B')],
          }),
        ],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: ['CACAO'] }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Rony',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: new Date('2026-06-01T00:00:00.000Z'),
          fechaFin: new Date('2026-06-30T00:00:00.000Z'),
        }),
        EventoPlanificacion.create({
          empleado: 'Natanael',
          tipo: TipoEventoPlanificacion.FERIADO,
          fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
          fechaFin: new Date('2026-08-01T00:00:00.000Z'),
        }),
      ]),
    );

    const result = new PlanificacionInputValidator().validate(solicitud);

    expect(result.esValida).toBe(false);
    expect(result.errores).toEqual([
      'El evento VACACIONES de Rony (2026-06-01 a 2026-06-30) está totalmente fuera del período de planificación 2026-07-01 a 2026-07-31.',
      'El evento FERIADO de Natanael (2026-08-01 a 2026-08-01) está totalmente fuera del período de planificación 2026-07-01 a 2026-07-31.',
    ]);
  });

  it('permite un evento que coincide parcialmente con el periodo destino', () => {
    const calendario = new Calendario('Junio 2026');
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO',
        empleados: [
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('Turno A')],
          }),
        ],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: ['CACAO'] }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Rony',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: new Date('2026-06-25T00:00:00.000Z'),
          fechaFin: new Date('2026-07-02T00:00:00.000Z'),
        }),
      ]),
    );

    const result = new PlanificacionInputValidator().validate(solicitud);

    expect(result.esValida).toBe(true);
    expect(result.errores).toEqual([]);
  });

  it('rechaza un evento ambiguo cuando el empleado existe en varias unidades del alcance', () => {
    const calendario = new Calendario('Junio 2026');

    for (const nombreUnidad of ['CACAO', 'TRUCK STOP']) {
      calendario.agregarUnidadOperativa(
        UnidadOperativa.create({
          nombre: nombreUnidad,
          empleados: [
            Empleado.create({
              nombre: 'Carlos',
              estadosPorDia: [EstadoTurno.create('Turno A')],
            }),
          ],
        }),
      );
    }

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: ['CACAO', 'TRUCK STOP'] }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Carlos',
          tipo: TipoEventoPlanificacion.FERIADO,
          fechaInicio: new Date('2026-07-15T00:00:00.000Z'),
          fechaFin: new Date('2026-07-15T00:00:00.000Z'),
        }),
      ]),
    );

    const result = new PlanificacionInputValidator().validate(solicitud);

    expect(result.esValida).toBe(false);
    expect(result.errores).toEqual([
      'El evento de Carlos es ambiguo porque el empleado existe en varias unidades del alcance operativo: CACAO, TRUCK STOP.',
    ]);
  });

  it('permite un evento global si el flexible aparece en varios roles de la misma estación', () => {
    const calendario = new Calendario('Junio 2026');
    const unidadesCacao = [
      'CACAO PISTA',
      'CACAO CAJA',
      'CACAO CAJEROS',
      'CACAO E/S',
      'CACAO ROD',
    ];

    for (const nombreUnidad of unidadesCacao) {
      calendario.agregarUnidadOperativa(
        UnidadOperativa.create({
          nombre: nombreUnidad,
          empleados: [
            Empleado.create({
              nombre: 'Edwin',
              estadosPorDia: [EstadoTurno.create('Turno A')],
            }),
          ],
        }),
      );
    }

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: unidadesCacao }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Edwin',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: new Date('2026-07-15T00:00:00.000Z'),
          fechaFin: new Date('2026-07-20T00:00:00.000Z'),
        }),
      ]),
    );

    const result = new PlanificacionInputValidator().validate(solicitud);

    expect(result.esValida).toBe(true);
    expect(result.errores).toEqual([]);
  });

  it('mantiene ambiguo un evento global si el mismo nombre aparece en estaciones distintas', () => {
    const calendario = new Calendario('Junio 2026');

    for (const nombreUnidad of ['CACAO PISTA', 'TRUCK STOP CAJA']) {
      calendario.agregarUnidadOperativa(
        UnidadOperativa.create({
          nombre: nombreUnidad,
          empleados: [
            Empleado.create({
              nombre: 'Jeferson',
              estadosPorDia: [EstadoTurno.create('Turno A')],
            }),
          ],
        }),
      );
    }

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({
        unidadesOperativas: ['CACAO PISTA', 'TRUCK STOP CAJA'],
      }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Jeferson',
          tipo: TipoEventoPlanificacion.FERIADO,
          fechaInicio: new Date('2026-07-15T00:00:00.000Z'),
          fechaFin: new Date('2026-07-15T00:00:00.000Z'),
        }),
      ]),
    );

    const result = new PlanificacionInputValidator().validate(solicitud);

    expect(result.esValida).toBe(false);
    expect(result.errores).toEqual([
      'Jeferson es flexible de TRUCK STOP y no puede planificarse en CACAO PISTA.',
      'TRUCK STOP CAJA debe planificarse junto con TRUCK STOP PISTA para usar a Jeferson sin asignarlo simultáneamente en pista y caja.',
      'El evento de Jeferson es ambiguo porque el empleado existe en varias unidades del alcance operativo: CACAO PISTA, TRUCK STOP CAJA.',
    ]);
  });

  it('rechaza planificar caja sola cuando el flexible requiere coordinación con pista', () => {
    const calendario = new Calendario('Junio 2026');

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO CAJA',
        empleados: [
          Empleado.create({
            nombre: 'Edwin',
            estadosPorDia: [EstadoTurno.create('LIBRE')],
          }),
        ],
      }),
    );

    const resultado = new PlanificacionInputValidator().validate(
      new SolicitudPlanificacion(
        calendario,
        createPeriodo(),
        AlcanceOperativo.create({ unidadesOperativas: ['CACAO CAJA'] }),
      ),
    );

    expect(resultado.esValida).toBe(false);
    expect(resultado.errores).toContain(
      'CACAO CAJA debe planificarse junto con CACAO PISTA para usar a Edwin sin asignarlo simultáneamente en pista y caja.',
    );
  });

  it('exige el mes inmediatamente siguiente cuando el Excel incluye continuidad fechada', () => {
    const calendario = new Calendario('Julio 2026', {
      mes: 7,
      anio: 2026,
      fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
      fechaFin: new Date('2026-08-02T00:00:00.000Z'),
    });
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO PISTA',
        empleados: [
          Empleado.create({
            nombre: 'Mario',
            estadosPorDia: Array.from({ length: 33 }, () =>
              EstadoTurno.create('TURNO A'),
            ),
          }),
        ],
      }),
    );
    const septiembre = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-09-01T00:00:00.000Z'),
      fechaFin: new Date('2026-09-30T00:00:00.000Z'),
    });

    const resultado = new PlanificacionInputValidator().validate(
      new SolicitudPlanificacion(
        calendario,
        septiembre,
        AlcanceOperativo.create({ unidadesOperativas: ['CACAO PISTA'] }),
      ),
    );

    expect(resultado.esValida).toBe(false);
    expect(resultado.errores).toContain(
      'El calendario de origen corresponde a 7/2026; el período destino debe ser 8/2026 para conservar la continuidad.',
    );
  });

  it('permite desambiguar un evento indicando la unidad operativa', () => {
    const calendario = new Calendario('Junio 2026');

    for (const nombreUnidad of ['CACAO', 'TRUCK STOP']) {
      calendario.agregarUnidadOperativa(
        UnidadOperativa.create({
          nombre: nombreUnidad,
          empleados: [
            Empleado.create({
              nombre: 'Carlos',
              estadosPorDia: [EstadoTurno.create('Turno A')],
            }),
          ],
        }),
      );
    }

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: ['CACAO', 'TRUCK STOP'] }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Carlos',
          unidadOperativa: 'cacao',
          tipo: TipoEventoPlanificacion.FERIADO,
          fechaInicio: new Date('2026-07-15T00:00:00.000Z'),
          fechaFin: new Date('2026-07-15T00:00:00.000Z'),
        }),
      ]),
    );

    const result = new PlanificacionInputValidator().validate(solicitud);

    expect(result.esValida).toBe(true);
    expect(result.errores).toEqual([]);
  });

  it('rechaza la unidad de un evento fuera del alcance o un empleado ajeno a ella', () => {
    const calendario = new Calendario('Junio 2026');
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre: 'CACAO',
        empleados: [
          Empleado.create({
            nombre: 'Rony',
            estadosPorDia: [EstadoTurno.create('Turno A')],
          }),
        ],
      }),
    );

    const solicitud = new SolicitudPlanificacion(
      calendario,
      createPeriodo(),
      AlcanceOperativo.create({ unidadesOperativas: ['CACAO'] }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Rony',
          unidadOperativa: 'TRUCK STOP',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: new Date('2026-07-10T00:00:00.000Z'),
          fechaFin: new Date('2026-07-10T00:00:00.000Z'),
        }),
        EventoPlanificacion.create({
          empleado: 'Joel',
          unidadOperativa: 'CACAO',
          tipo: TipoEventoPlanificacion.FERIADO,
          fechaInicio: new Date('2026-07-11T00:00:00.000Z'),
          fechaFin: new Date('2026-07-11T00:00:00.000Z'),
        }),
      ]),
    );

    const result = new PlanificacionInputValidator().validate(solicitud);

    expect(result.esValida).toBe(false);
    expect(result.errores).toEqual([
      'El evento de Rony referencia la unidad operativa TRUCK STOP, que no está incluida en el alcance operativo.',
      'El empleado Joel del evento no existe en la unidad operativa CACAO incluida en el alcance.',
    ]);
  });
});
