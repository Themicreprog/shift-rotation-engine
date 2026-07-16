import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from '../../../src/application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from '../../../src/application/planning/DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from '../../../src/application/planning/GeneradorRotacionSemanal.js';
import { PlanificadorUnidadOperativa } from '../../../src/application/planning/PlanificadorUnidadOperativa.js';
import { ValidadorCobertura } from '../../../src/application/planning/ValidadorCobertura.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';
import { ComodinesPlanificacion } from '../../../src/domain/planning/ComodinesPlanificacion.js';
import { EventoPlanificacion } from '../../../src/domain/planning/EventoPlanificacion.js';
import { EventosPlanificacion } from '../../../src/domain/planning/EventosPlanificacion.js';
import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
import { TipoEventoPlanificacion } from '../../../src/domain/planning/TipoEventoPlanificacion.js';

function crearPlanificador(): PlanificadorUnidadOperativa {
  return new PlanificadorUnidadOperativa(
    new AnalizadorEstadoFinalEmpleado(),
    new DecisorPrimerDiaContinuidadSimple(),
    new GeneradorRotacionSemanal(),
    new DistribuidorDiaLibre(),
    new ValidadorCobertura(),
  );
}

describe('cobertura de vacaciones prolongadas', () => {
  it('no crea vacante en el descanso base y permite que el comodín descanse', () => {
    const empleados = [
      ['Jose', 'TURNO A'],
      ['Mario', 'TURNO A'],
      ['Edwin', 'TURNO A'],
      ['Rene', 'TURNO A'],
      ['Luis D', 'TURNO B'],
      ['Julio', 'TURNO B'],
      ['Joel', 'TURNO B'],
      ['Lester', 'OTRO'],
    ] as const;
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: empleados.map(([nombre, estado]) =>
        Empleado.create({
          nombre,
          estadosPorDia: [EstadoTurno.create(estado)],
        }),
      ),
    });
    const inicio = new Date('2026-08-03T00:00:00.000Z');
    const fin = new Date('2026-08-16T00:00:00.000Z');
    const resultado = crearPlanificador().planificarConCobertura(
      unidad,
      PeriodoPlanificacion.create({ fechaInicio: inicio, fechaFin: fin }),
      EventosPlanificacion.create([
        EventoPlanificacion.create({
          empleado: 'Jose',
          unidadOperativa: 'CACAO PISTA',
          tipo: TipoEventoPlanificacion.VACACIONES,
          fechaInicio: inicio,
          fechaFin: fin,
        }),
      ]),
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO PISTA', empleado: 'Lester' },
      ]),
    );

    expect(resultado.incidenciasCobertura).toEqual([]);

    const lester = resultado.unidadOperativa.empleados.find(
      (empleado) => empleado.nombre === 'Lester',
    );
    expect(lester).toBeDefined();

    let consecutivos = 0;
    let maximo = 0;
    for (let dia = 1; dia <= lester!.totalDias(); dia += 1) {
      if (lester!.estadoDelDia(dia).esAsignacionOperativa()) {
        consecutivos += 1;
        maximo = Math.max(maximo, consecutivos);
      } else {
        consecutivos = 0;
      }
    }

    expect(maximo).toBeLessThanOrEqual(6);
    expect(resultado.reemplazos.filter((r) => r.motivo === 'VACACIONES')).toHaveLength(12);
  });
});