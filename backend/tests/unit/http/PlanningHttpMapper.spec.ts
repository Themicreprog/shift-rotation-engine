import { describe, expect, it } from 'vitest';

import { ResultadoPlanificacion } from '../../../src/application/planning/ResultadoPlanificacion.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';
import { ReemplazoPlanificacion } from '../../../src/domain/planning/ReemplazoPlanificacion.js';
import { PlanningHttpMapper } from '../../../src/infrastructure/http/PlanningHttpMapper.js';

const NOMBRES_PUBLICOS = ['CACAO C1', 'CAJA CACAO', 'TRUCK STOP', 'CAJA TRUCK STOP'] as const;

const NOMBRES_INTERNOS = [
  'CACAO PISTA',
  'CACAO CAJA',
  'TRUCK STOP PISTA',
  'TRUCK STOP CAJA',
] as const;

describe('PlanningHttpMapper - nombres públicos de unidades', () => {
  it('convierte calendario, alcance, eventos y comodines públicos a IDs internos', () => {
    const mapper = new PlanningHttpMapper();
    const solicitud = mapper.parseSolicitudPlanificacion({
      calendarioOrigen: crearCalendarioDto(NOMBRES_PUBLICOS),
      mes: 8,
      anio: 2026,
      alcanceOperativo: NOMBRES_PUBLICOS,
      eventos: [
        {
          empleado: 'Mario',
          tipo: 'VACACIONES',
          fechaInicio: '2026-08-03',
          fechaFin: '2026-08-09',
          unidadOperativa: 'CACAO C1',
        },
      ],
      comodines: [
        {
          empleado: 'Celio',
          unidadOperativa: 'CAJA TRUCK STOP',
        },
      ],
    });

    expect(solicitud.calendarioOrigen.unidadesOperativas.map(({ nombre }) => nombre)).toEqual(
      NOMBRES_INTERNOS,
    );
    expect(solicitud.alcanceOperativo.unidadesOperativas).toEqual(NOMBRES_INTERNOS);
    expect(solicitud.eventos.listar()[0]?.unidadOperativa).toBe('CACAO PISTA');
    expect(solicitud.comodines.listar()[0]?.unidadOperativa).toBe('TRUCK STOP CAJA');
  });

  it('acepta nombres públicos al exportar y convierte reemplazos al ID interno', () => {
    const mapper = new PlanningHttpMapper();
    const solicitud = mapper.parseExportarCalendario({
      calendario: crearCalendarioDto(NOMBRES_PUBLICOS),
      mes: 8,
      anio: 2026,
      reemplazos: [
        {
          unidadOperativa: 'CAJA CACAO',
          dia: 3,
          turno: 'TURNO A',
          empleadoTitular: 'Natanael',
          empleadoReemplazo: 'Edwin',
          tipoCobertura: 'FLEXIBLE',
          motivo: 'DESCANSO',
        },
      ],
    });

    expect(solicitud.calendario.unidadesOperativas.map(({ nombre }) => nombre)).toEqual(
      NOMBRES_INTERNOS,
    );
    expect(solicitud.reemplazos[0]?.unidadOperativa).toBe('CACAO CAJA');
  });

  it('acepta reemplazos de los días visuales que caen en el mes siguiente', () => {
    const mapper = new PlanningHttpMapper();
    const estadosVisuales = Array.from({ length: 37 }, () => 'TURNO A');
    const calendario = crearCalendarioDto(NOMBRES_PUBLICOS);

    calendario.periodoOrigen = {
      mes: 8,
      anio: 2026,
      fechaInicio: '2026-08-01',
      fechaFin: '2026-09-06',
    };

    for (const unidad of calendario.unidadesOperativas) {
      for (const empleado of unidad.empleados) {
        empleado.estadosPorDia = [...estadosVisuales];
      }
    }

    const solicitud = mapper.parseExportarCalendario({
      calendario,
      mes: 8,
      anio: 2026,
      reemplazos: [
        {
          unidadOperativa: 'CACAO C1',
          dia: 32,
          turno: 'TURNO A',
          empleadoTitular: 'Rene',
          empleadoReemplazo: 'Mario',
          tipoCobertura: 'COMODIN',
          motivo: 'VACACIONES',
        },
      ],
    });

    expect(solicitud.reemplazos[0]?.dia).toBe(32);
    expect(solicitud.calendario.obtenerPeriodoOrigen()?.fechaFin).toEqual(
      new Date('2026-09-06T00:00:00.000Z'),
    );
  });

  it('devuelve nombres públicos en calendarios, reemplazos y mensajes', () => {
    const mapper = new PlanningHttpMapper();
    const calendario = crearCalendarioDominio(NOMBRES_INTERNOS);
    const reemplazo = ReemplazoPlanificacion.create({
      unidadOperativa: 'CACAO CAJA',
      dia: 1,
      turno: 'TURNO A',
      empleadoTitular: 'Natanael',
      empleadoReemplazo: 'Edwin',
      tipoCobertura: 'FLEXIBLE',
      motivo: 'DESCANSO',
    });
    const resultado = ResultadoPlanificacion.exitoso(
      calendario,
      ['Flexible Edwin transferido de CACAO PISTA a CACAO CAJA.'],
      ['Cobertura insuficiente en TRUCK STOP PISTA.'],
      [reemplazo],
    );
    const dto = mapper.resultadoToDto(resultado);
    const conflicto = mapper.resultadoToDto(
      ResultadoPlanificacion.conConflictos(calendario, [
        'TRUCK STOP CAJA debe planificarse con TRUCK STOP PISTA.',
      ]),
    );

    expect(dto.calendario.unidadesOperativas.map(({ nombre }) => nombre)).toEqual(NOMBRES_PUBLICOS);
    expect(dto.cambios).toEqual(['Flexible Edwin transferido de CACAO C1 a CAJA CACAO.']);
    expect(dto.advertencias).toEqual(['Cobertura insuficiente en TRUCK STOP.']);
    expect(dto.reemplazos[0]?.unidadOperativa).toBe('CAJA CACAO');
    expect(conflicto.conflictos).toEqual(['CAJA TRUCK STOP debe planificarse con TRUCK STOP.']);
    expect(JSON.stringify({ dto, conflicto })).not.toContain('PISTA');
  });
});

function crearCalendarioDto(nombres: ReadonlyArray<string>): {
  nombre: string;
  unidadesOperativas: Array<{
    nombre: string;
    empleados: Array<{ nombre: string; estadosPorDia: string[] }>;
  }>;
  periodoOrigen?: {
    mes: number;
    anio: number;
    fechaInicio: string;
    fechaFin: string;
  };
} {
  return {
    nombre: 'Calendario de prueba',
    unidadesOperativas: nombres.map((nombre, indice) => ({
      nombre,
      empleados: [
        {
          nombre: ['Mario', 'Natanael', 'Jeferson', 'Norlan'][indice]!,
          estadosPorDia: ['LIBRE'],
        },
      ],
    })),
  };
}

function crearCalendarioDominio(nombres: ReadonlyArray<string>): Calendario {
  const calendario = new Calendario('Calendario de prueba');

  for (const [indice, nombre] of nombres.entries()) {
    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({
        nombre,
        empleados: [
          Empleado.create({
            nombre: ['Mario', 'Natanael', 'Jeferson', 'Norlan'][indice]!,
            estadosPorDia: [EstadoTurno.create('LIBRE')],
          }),
        ],
      }),
    );
  }

  return calendario;
}