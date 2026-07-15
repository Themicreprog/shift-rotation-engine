import { describe, expect, it } from 'vitest';

import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';

describe('PeriodoPlanificacion', () => {
  it('crea un período válido y calcula sus días de forma inclusiva', () => {
    const periodo = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
      fechaFin: new Date('2026-07-31T00:00:00.000Z'),
    });

    expect(periodo.totalDias()).toBe(31);
  });

  it('rechaza un período cuya fecha fin es anterior a la fecha inicio', () => {
    expect(() =>
      PeriodoPlanificacion.create({
        fechaInicio: new Date('2026-07-31T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).toThrow('PeriodoPlanificacion.fechaFin no puede ser menor que fechaInicio.');
  });
});