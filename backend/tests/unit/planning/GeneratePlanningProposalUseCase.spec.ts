import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalCalendario } from '../../../src/application/planning/AnalizadorEstadoFinalCalendario.js';
import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from '../../../src/application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from '../../../src/application/planning/DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from '../../../src/application/planning/GeneradorRotacionSemanal.js';
import { GeneratePlanningProposalUseCase } from '../../../src/application/planning/GeneratePlanningProposalUseCase.js';
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
import { RotationResult } from '../../../src/domain/rotation/RotationResult.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('GeneratePlanningProposalUseCase', () => {
  it('devuelve un RotationResult con un calendario destino completo', () => {
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
      AlcanceOperativo.create({
        unidadesOperativas: ['CACAO'],
      }),
    );

    const useCase = new GeneratePlanningProposalUseCase(
      new PlanningEngine(
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
      ),
    );

    const result = useCase.execute(solicitud);

    expect(result).toBeInstanceOf(RotationResult);
    expect(result.cambios).toEqual([]);
    expect(result.advertencias).not.toEqual([]);
    expect(result.conflictos).toEqual([]);
    expect(result.calendario.nombre).toBe(
      'PLANIFICACION-2026-07-COMPLETO',
    );
    expect(result.calendario.unidadesOperativas).toHaveLength(1);

    const unidad = result.calendario.buscarUnidadOperativa('CACAO');

    expect(unidad).toBeDefined();
    expect(unidad!.empleados).toHaveLength(1);

    const empleado = unidad!.empleados.find(
      (item: Empleado) => item.nombre === 'Rony',
    );

    expect(empleado).toBeDefined();
    expect(empleado!.nombre).toBe('Rony');
    expect(empleado!.totalDias()).toBe(33);

    // Estas expectativas cambiarán cuando el motor semanal sea el comportamiento oficial.
    expect(empleado!.estadoDelDia(1).valor).toBe('TURNO A');
    expect(empleado!.estadoDelDia(31).valor).toBe('TURNO A');
  });
});