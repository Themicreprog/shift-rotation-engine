import { describe, expect, it } from 'vitest';

import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
import { PeriodoVisualPlanificacion } from '../../../src/domain/planning/PeriodoVisualPlanificacion.js';

describe('PeriodoVisualPlanificacion', () => {
  it('extiende agosto de 2026 hasta el domingo 6 de septiembre', () => {
    const principal = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
      fechaFin: new Date('2026-08-31T00:00:00.000Z'),
    });

    const visual = PeriodoVisualPlanificacion.desdePeriodoPrincipal(principal);

    expect(visual.totalDiasPrincipales()).toBe(31);
    expect(visual.totalDiasVisuales()).toBe(37);
    expect(visual.periodoCompleto.fechaFin.toISOString()).toBe(
      '2026-09-06T00:00:00.000Z',
    );
    expect(visual.esDiaPrincipal(31)).toBe(true);
    expect(visual.esDiaPrincipal(32)).toBe(false);
  });

  it('no agrega días cuando el mes termina domingo', () => {
    const principal = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-05-01T00:00:00.000Z'),
      fechaFin: new Date('2026-05-31T00:00:00.000Z'),
    });

    const visual = PeriodoVisualPlanificacion.desdePeriodoPrincipal(principal);

    expect(visual.totalDiasVisuales()).toBe(31);
  });
});
