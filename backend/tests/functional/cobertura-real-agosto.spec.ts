import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SolicitudPlanificacion } from '../../src/application/planning/SolicitudPlanificacion.js';
import { AlcanceOperativo } from '../../src/domain/planning/AlcanceOperativo.js';
import { ComodinesPlanificacion } from '../../src/domain/planning/ComodinesPlanificacion.js';
import { EventosPlanificacion } from '../../src/domain/planning/EventosPlanificacion.js';
import { PeriodoPlanificacion } from '../../src/domain/planning/PeriodoPlanificacion.js';
import { ExcelCalendarioReader } from '../../src/infrastructure/excel/ExcelCalendarioReader.js';
import { crearCasoDeUsoPlanificacion } from '../../src/infrastructure/http/PlanningApiService.js';

const rutaJulio = path.resolve(
  __dirname,
  '../fixtures/turnos-de-julio-pero-limpios-3.xlsx',
);

describe('planificación real de agosto', () => {
  it('mantiene 3 bomberos por turno y cubre las cajas desde el primer día generado', async () => {
    const calendario = await new ExcelCalendarioReader().leerCalendario(rutaJulio);
    const resultado = crearCasoDeUsoPlanificacion().execute(
      new SolicitudPlanificacion(
        calendario,
        PeriodoPlanificacion.create({
          fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
          fechaFin: new Date('2026-08-31T00:00:00.000Z'),
        }),
        AlcanceOperativo.create({
          unidadesOperativas: calendario.unidadesOperativas.map(
            (unidad) => unidad.nombre,
          ),
        }),
        EventosPlanificacion.vacio(),
        ComodinesPlanificacion.create([
          { unidadOperativa: 'CACAO PISTA', empleado: 'Lester' },
          { unidadOperativa: 'TRUCK STOP CAJA', empleado: 'Celio' },
        ]),
      ),
    );

    for (const nombreUnidad of ['CACAO PISTA', 'TRUCK STOP PISTA']) {
      const unidad = resultado.calendario.buscarUnidadOperativa(nombreUnidad)!;

      for (let dia = 3; dia <= 31; dia += 1) {
        const turnoA = unidad.empleados.filter(
          (empleado) => empleado.estadoDelDia(dia).valor === 'TURNO A',
        );
        const turnoB = unidad.empleados.filter(
          (empleado) => empleado.estadoDelDia(dia).valor === 'TURNO B',
        );

        expect(turnoA, `${nombreUnidad}, día ${dia}, TURNO A`).toHaveLength(3);
        expect(turnoB, `${nombreUnidad}, día ${dia}, TURNO B`).toHaveLength(3);
      }
    }

    const advertenciasGeneradas = resultado.advertencias.filter((advertencia) => {
      const coincidencia = advertencia.match(/día (\d+)/u);
      return coincidencia !== null && Number(coincidencia[1]) >= 3;
    });

    expect(advertenciasGeneradas).toEqual([]);
    expect(
      resultado.advertencias.some((advertencia) =>
        advertencia.startsWith('Jornada excesiva'),
      ),
    ).toBe(false);

    expect(
      resultado.calendario
        .buscarUnidadOperativa('TRUCK STOP CAJA')
        ?.empleados.find((empleado) => empleado.nombre === 'Celio')
        ?.estadoDelDia(3).valor,
    ).toBe('OTRO');
  });
});