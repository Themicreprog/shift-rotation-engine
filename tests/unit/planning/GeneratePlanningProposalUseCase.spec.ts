import { describe, expect, it } from 'vitest';

import { GeneratePlanningProposalUseCase } from '../../../src/application/planning/GeneratePlanningProposalUseCase.js';
import { PlanningEngine } from '../../../src/application/planning/PlanningEngine.js';
import { PlanificacionInputValidator } from '../../../src/application/planning/PlanificacionInputValidator.js';
import { SolicitudPlanificacion } from '../../../src/application/planning/SolicitudPlanificacion.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { AlcanceOperativo } from '../../../src/domain/planning/AlcanceOperativo.js';
import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
import { RotationResult } from '../../../src/domain/rotation/RotationResult.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('GeneratePlanningProposalUseCase', () => {
  it('devuelve un RotationResult compatible sin ejecutar todavía el algoritmo de planificación', () => {
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
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-31T00:00:00.000Z'),
      }),
      AlcanceOperativo.create({ unidadesOperativas: ['CACAO'] }),
    );

    const useCase = new GeneratePlanningProposalUseCase(
      new PlanningEngine(new PlanificacionInputValidator()),
    );

    const result = useCase.execute(solicitud);

    expect(result).toBeInstanceOf(RotationResult);
    expect(result.calendario).toBe(calendario);
    expect(result.cambios).toEqual([]);
    expect(result.advertencias).toEqual([]);
    expect(result.conflictos).toEqual([]);
  });
});