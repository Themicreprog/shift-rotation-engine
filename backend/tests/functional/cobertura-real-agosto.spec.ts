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
  it('aplica cobertura variable, descansos y reservas automáticas desde el día generado', async () => {
    const calendario = await new ExcelCalendarioReader().leerCalendario(rutaJulio);
    const periodo = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
      fechaFin: new Date('2026-08-31T00:00:00.000Z'),
    });
    const resultado = crearCasoDeUsoPlanificacion().execute(
      new SolicitudPlanificacion(
        calendario,
        periodo,
        AlcanceOperativo.create({
          unidadesOperativas: calendario.unidadesOperativas.map(
            (unidad) => unidad.nombre,
          ),
        }),
        EventosPlanificacion.vacio(),
        ComodinesPlanificacion.vacio(),
      ),
    );

    for (const nombreUnidad of ['CACAO PISTA', 'TRUCK STOP PISTA']) {
      const unidad = resultado.calendario.buscarUnidadOperativa(nombreUnidad)!;

      for (let dia = 3; dia <= 31; dia += 1) {
        const fecha = periodo.fechaDelDia(dia);
        const turnoA = unidad.empleados.filter(
          (empleado) => empleado.estadoDelDia(dia).valor === 'TURNO A',
        ).length;
        const turnoB = unidad.empleados.filter(
          (empleado) => empleado.estadoDelDia(dia).valor === 'TURNO B',
        ).length;
        const libres = unidad.empleados.filter(
          (empleado) => empleado.estadoDelDia(dia).valor === 'LIBRE',
        ).length;

        if (fecha.getUTCDay() === 5 || fecha.getUTCDay() === 6) {
          expect(turnoA, `${nombreUnidad}, día ${dia}, A`).toBeGreaterThanOrEqual(3);
          expect(turnoB, `${nombreUnidad}, día ${dia}, B`).toBeGreaterThanOrEqual(4);
          expect(libres, `${nombreUnidad}, día ${dia}, LIBRE`).toBe(0);
        } else if (fecha.getUTCDay() === 0) {
          expect(turnoA, `${nombreUnidad}, día ${dia}, A`).toBeGreaterThanOrEqual(2);
          expect(turnoB, `${nombreUnidad}, día ${dia}, B`).toBeGreaterThanOrEqual(2);
        } else {
          expect(turnoA, `${nombreUnidad}, día ${dia}, A`).toBeGreaterThanOrEqual(3);
          expect(turnoB, `${nombreUnidad}, día ${dia}, B`).toBeGreaterThanOrEqual(3);
        }
      }
    }

    for (const nombreUnidad of ['CACAO CAJA', 'TRUCK STOP CAJA']) {
      const unidad = resultado.calendario.buscarUnidadOperativa(nombreUnidad)!;

      for (let dia = 3; dia <= 31; dia += 1) {
        expect(
          unidad.empleados.filter(
            (empleado) => empleado.estadoDelDia(dia).valor === 'TURNO A',
          ),
          `${nombreUnidad}, día ${dia}, A`,
        ).toHaveLength(1);
        expect(
          unidad.empleados.filter(
            (empleado) => empleado.estadoDelDia(dia).valor === 'TURNO B',
          ),
          `${nombreUnidad}, día ${dia}, B`,
        ).toHaveLength(1);
      }
    }

    for (let dia = 3; dia <= 31; dia += 1) {
      if (periodo.fechaDelDia(dia).getUTCDay() !== 2) continue;

      for (const unidad of resultado.calendario.unidadesOperativas) {
        const celio = unidad.empleados.find(
          (empleado) => empleado.nombre.toUpperCase() === 'CELIO',
        );

        if (celio) expect(celio.estadoDelDia(dia).valor).toBe('OTRO');
      }
    }

    for (const nombreUnidad of ['CACAO CAJA', 'TRUCK STOP CAJA']) {
      const lester = resultado.calendario
        .buscarUnidadOperativa(nombreUnidad)
        ?.empleados.find((empleado) => empleado.nombre === 'Lester');

      if (lester) {
        for (let dia = 1; dia <= lester.totalDias(); dia += 1) {
          expect(lester.estadoDelDia(dia).esAsignacionOperativa()).toBe(false);
        }
      }
    }

    const advertenciasGeneradas = resultado.advertencias.filter((advertencia) => {
      const coincidencia = advertencia.match(/día (\d+)/u);
      return coincidencia !== null && Number(coincidencia[1]) >= 3;
    });

    expect(advertenciasGeneradas).toEqual([]);
  });
});
