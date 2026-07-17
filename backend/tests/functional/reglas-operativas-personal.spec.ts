import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { SolicitudPlanificacion } from '../../src/application/planning/SolicitudPlanificacion.js';
import type { Calendario } from '../../src/domain/Calendario.js';
import { AlcanceOperativo } from '../../src/domain/planning/AlcanceOperativo.js';
import { ComodinesPlanificacion } from '../../src/domain/planning/ComodinesPlanificacion.js';
import { EventoPlanificacion } from '../../src/domain/planning/EventoPlanificacion.js';
import { EventosPlanificacion } from '../../src/domain/planning/EventosPlanificacion.js';
import { PeriodoPlanificacion } from '../../src/domain/planning/PeriodoPlanificacion.js';
import { TipoEventoPlanificacion } from '../../src/domain/planning/TipoEventoPlanificacion.js';
import { ExcelCalendarioReader } from '../../src/infrastructure/excel/ExcelCalendarioReader.js';
import { crearCasoDeUsoPlanificacion } from '../../src/infrastructure/http/PlanningApiService.js';

const rutaJulio = path.resolve(
  __dirname,
  '../fixtures/turnos-de-julio-pero-limpios-3.xlsx',
);
const periodo = PeriodoPlanificacion.create({
  fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
  fechaFin: new Date('2026-08-31T00:00:00.000Z'),
});

function vacaciones(
  empleado: string,
  unidadOperativa: string,
  fecha: string,
): EventoPlanificacion {
  const dia = new Date(`${fecha}T00:00:00.000Z`);
  return EventoPlanificacion.create({
    empleado,
    unidadOperativa,
    tipo: TipoEventoPlanificacion.VACACIONES,
    fechaInicio: dia,
    fechaFin: dia,
  });
}

describe('reglas operativas confirmadas de reservas y cobertura', () => {
  let calendario: Calendario;

  beforeAll(async () => {
    calendario = await new ExcelCalendarioReader().leerCalendario(rutaJulio);
  });

  function generar(eventos: ReadonlyArray<EventoPlanificacion>) {
    return crearCasoDeUsoPlanificacion().execute(
      new SolicitudPlanificacion(
        calendario,
        periodo,
        AlcanceOperativo.create({
          unidadesOperativas: calendario.unidadesOperativas.map(
            (unidad) => unidad.nombre,
          ),
        }),
        EventosPlanificacion.create(eventos),
        ComodinesPlanificacion.vacio(),
      ),
    );
  }

  it('usa a Lester y Celio para dos vacaciones simultáneas de pista', () => {
    const resultado = generar([
      vacaciones('Jose', 'CACAO PISTA', '2026-08-07'),
      vacaciones('Milton', 'TRUCK STOP PISTA', '2026-08-07'),
    ]);
    const coberturas = resultado.reemplazos.filter(
      (reemplazo) =>
        reemplazo.dia === 7 && reemplazo.motivo === 'VACACIONES',
    );

    expect(coberturas).toHaveLength(2);
    expect(new Set(coberturas.map((reemplazo) => reemplazo.empleadoReemplazo))).toEqual(
      new Set(['Lester', 'Celio']),
    );
    expect(
      resultado.advertencias.filter((advertencia) =>
        advertencia.includes('día 7'),
      ),
    ).toEqual([]);
  });

  it('mantiene a Celio en OTRO los martes aunque existan vacaciones', () => {
    const resultado = generar([
      vacaciones('Jose', 'CACAO PISTA', '2026-08-04'),
      vacaciones('Milton', 'TRUCK STOP PISTA', '2026-08-04'),
    ]);

    for (const unidad of resultado.calendario.unidadesOperativas) {
      const celio = unidad.empleados.find(
        (empleado) => empleado.nombre.toUpperCase() === 'CELIO',
      );
      if (celio) expect(celio.estadoDelDia(4).valor).toBe('OTRO');
    }

    expect(
      resultado.reemplazos.filter(
        (reemplazo) =>
          reemplazo.dia === 4 && reemplazo.empleadoReemplazo === 'Lester',
      ),
    ).toHaveLength(1);
    expect(
      resultado.advertencias.some(
        (advertencia) =>
          advertencia.includes('día 4') &&
          (advertencia.includes('CACAO PISTA') ||
            advertencia.includes('TRUCK STOP PISTA')),
      ),
    ).toBe(true);
  });

  it('usa Edwin y Jeferson para vacaciones de caja y protege sus puestos de pista', () => {
    const resultado = generar([
      vacaciones('Natanael', 'CACAO CAJA', '2026-08-06'),
      vacaciones('Norlan', 'TRUCK STOP CAJA', '2026-08-06'),
    ]);
    const reemplazosDia = resultado.reemplazos.filter(
      (reemplazo) => reemplazo.dia === 6,
    );

    expect(reemplazosDia).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unidadOperativa: 'CACAO CAJA',
          empleadoTitular: 'Natanael',
          empleadoReemplazo: 'Edwin',
          motivo: 'VACACIONES',
        }),
        expect.objectContaining({
          unidadOperativa: 'TRUCK STOP CAJA',
          empleadoTitular: 'Norlan',
          empleadoReemplazo: 'Jeferson',
          motivo: 'VACACIONES',
        }),
        expect.objectContaining({
          unidadOperativa: 'CACAO PISTA',
          empleadoReemplazo: 'Celio',
        }),
        expect.objectContaining({
          unidadOperativa: 'TRUCK STOP PISTA',
          empleadoTitular: 'Jeferson',
          empleadoReemplazo: 'Lester',
          motivo: 'TRANSFERENCIA_FLEXIBLE',
        }),
      ]),
    );
    expect(
      new Set(
        reemplazosDia
          .filter((reemplazo) =>
            reemplazo.unidadOperativa.endsWith('PISTA'),
          )
          .map((reemplazo) => reemplazo.empleadoReemplazo),
      ),
    ).toEqual(new Set(['Lester', 'Celio']));
    expect(
      resultado.advertencias.filter((advertencia) =>
        advertencia.includes('día 6'),
      ),
    ).toEqual([]);
  });

  it('nunca usa a Lester en caja', () => {
    const resultado = generar([
      vacaciones('Natanael', 'CACAO CAJA', '2026-08-07'),
      vacaciones('Norlan', 'TRUCK STOP CAJA', '2026-08-07'),
    ]);

    expect(
      resultado.reemplazos.some(
        (reemplazo) =>
          reemplazo.empleadoReemplazo === 'Lester' &&
          reemplazo.unidadOperativa.includes('CAJA'),
      ),
    ).toBe(false);
  });
});
