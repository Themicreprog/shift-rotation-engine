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

function empleado(nombre: string, estado: string): Empleado {
  return Empleado.create({
    nombre,
    estadosPorDia: [EstadoTurno.create(estado)],
  });
}

function empleadoConEstados(
  nombre: string,
  estados: ReadonlyArray<string>,
): Empleado {
  return Empleado.create({
    nombre,
    estadosPorDia: estados.map((estado) => EstadoTurno.create(estado)),
  });
}

const periodo = PeriodoPlanificacion.create({
  fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
  fechaFin: new Date('2026-08-01T00:00:00.000Z'),
});

describe('trazabilidad estructurada de cobertura', () => {
  it('conserva al titular y el motivo cuando un comodín cubre vacaciones', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        empleado('Natanael', 'TURNO A'),
        empleado('Rony', 'TURNO B'),
        empleado('Lester', 'OTRO'),
      ],
    });
    const eventos = EventosPlanificacion.create([
      EventoPlanificacion.create({
        empleado: 'Natanael',
        unidadOperativa: 'CACAO CAJA',
        tipo: TipoEventoPlanificacion.VACACIONES,
        fechaInicio: periodo.fechaInicio,
        fechaFin: periodo.fechaFin,
      }),
    ]);

    const resultado = crearPlanificador().planificarConCobertura(
      unidad,
      periodo,
      eventos,
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Lester' },
      ]),
    );

    expect(resultado.reemplazos).toHaveLength(1);
    expect(resultado.reemplazos[0]).toMatchObject({
      unidadOperativa: 'CACAO CAJA',
      dia: 1,
      turno: 'TURNO A',
      empleadoTitular: 'Natanael',
      empleadoReemplazo: 'Lester',
      tipoCobertura: 'COMODIN',
      motivo: 'VACACIONES',
    });
    expect(resultado.vacantesPendientes).toEqual([]);
  });

  it('no inventa reemplazo cuando el faltante no tiene ausencia identificable', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        empleado('Jose', 'TURNO A'),
        empleado('Mario', 'TURNO A'),
        empleado('Edwin', 'TURNO B'),
        empleado('Rene', 'TURNO B'),
        empleado('Luis D', 'TURNO B'),
        empleado('Julio', 'TURNO B'),
      ],
    });

    const resultado = crearPlanificador().repararCobertura(unidad);

    expect(resultado.reemplazos).toEqual([]);
    expect(resultado.incidenciasCobertura).toContainEqual({
      dia: 1,
      turno: 'TURNO A',
      requeridos: 3,
      disponibles: 2,
    });
  });

  it('usa el feriado como descanso cuando coincide con el LIBRE programado', () => {
    const periodoSemanal = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
      fechaFin: new Date('2026-08-07T00:00:00.000Z'),
    });
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        empleado('Natanael', 'TURNO A'),
        empleado('Rony', 'TURNO B'),
      ],
    });
    const eventos = EventosPlanificacion.create([
      EventoPlanificacion.create({
        empleado: 'Natanael',
        unidadOperativa: 'CACAO CAJA',
        tipo: TipoEventoPlanificacion.FERIADO,
        fechaInicio: periodoSemanal.fechaFin,
        fechaFin: periodoSemanal.fechaFin,
      }),
    ]);

    const resultado = crearPlanificador().planificarConCobertura(
      unidad,
      periodoSemanal,
      eventos,
    );
    const natanael = resultado.unidadOperativa.empleados.find(
      (candidato) => candidato.nombre === 'Natanael',
    );

    const estadosNatanael = Array.from(
      { length: 7 },
      (_, indice) => natanael?.estadoDelDia(indice + 1).valor,
    );

    expect(estadosNatanael[6]).toBe('FERIADO');
    expect(estadosNatanael.filter((estado) => estado === 'LIBRE')).toHaveLength(0);
    expect(
      resultado.incidenciasDescanso.filter(
        (incidencia) => incidencia.empleado === 'Natanael',
      ),
    ).toEqual([]);
  });

  it('no cubre un faltante creando una transición directa de B hacia A', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        empleadoConEstados('Jose', ['TURNO A', 'TURNO A']),
        empleadoConEstados('Mario', ['TURNO A', 'TURNO A']),
        empleadoConEstados('Edwin', ['TURNO A', 'VACACIONES']),
        empleadoConEstados('Rene', ['TURNO B', 'TURNO B']),
        empleadoConEstados('Luis D', ['TURNO B', 'TURNO B']),
        empleadoConEstados('Julio', ['TURNO B', 'TURNO B']),
        empleadoConEstados('Joel', ['TURNO B', 'TURNO B']),
      ],
    });

    const resultado = crearPlanificador().repararCobertura(unidad);

    expect(
      resultado.reemplazos.some(
        (reemplazo) => reemplazo.dia === 2 && reemplazo.turno === 'TURNO A',
      ),
    ).toBe(false);
    expect(resultado.incidenciasCobertura).toContainEqual({
      dia: 2,
      turno: 'TURNO A',
      requeridos: 3,
      disponibles: 2,
    });
  });

  it('adelanta el descanso si el período anterior termina con seis días trabajados', () => {
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        empleadoConEstados(
          'Natanael',
          Array.from({ length: 7 }, () => 'TURNO B'),
        ),
      ],
    });
    const periodoSemanal = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
      fechaFin: new Date('2026-08-07T00:00:00.000Z'),
    });

    const resultado = crearPlanificador().planificar(
      unidad,
      periodoSemanal,
    );
    const natanael = resultado.empleados[0];

    expect(natanael?.estadoDelDia(1).valor).toBe('LIBRE');
    expect(natanael?.estadoDelDia(2).valor).toBe('TURNO B');
  });
});
