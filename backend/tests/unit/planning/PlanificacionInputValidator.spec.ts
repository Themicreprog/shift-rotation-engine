import { describe, expect, it } from 'vitest';

import { PlanificacionInputValidator } from '../../../src/application/planning/PlanificacionInputValidator.js';
import { SolicitudPlanificacion } from '../../../src/application/planning/SolicitudPlanificacion.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { AlcanceOperativo } from '../../../src/domain/planning/AlcanceOperativo.js';
import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
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
});