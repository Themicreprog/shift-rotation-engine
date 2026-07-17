import { PeriodoPlanificacion } from './PeriodoPlanificacion.js';

export class PeriodoVisualPlanificacion {
  private constructor(
    public readonly periodoPrincipal: PeriodoPlanificacion,
    public readonly periodoCompleto: PeriodoPlanificacion,
  ) {}

  public static desdePeriodoPrincipal(
    periodoPrincipal: PeriodoPlanificacion,
  ): PeriodoVisualPlanificacion {
    const fechaFinVisual = periodoPrincipal.fechaDelDia(
      periodoPrincipal.totalDias(),
    );
    const diaSemana = fechaFinVisual.getUTCDay();
    const diasHastaDomingo = (7 - diaSemana) % 7;
    fechaFinVisual.setUTCDate(fechaFinVisual.getUTCDate() + diasHastaDomingo);

    return new PeriodoVisualPlanificacion(
      periodoPrincipal,
      PeriodoPlanificacion.create({
        fechaInicio: periodoPrincipal.fechaInicio,
        fechaFin: fechaFinVisual,
      }),
    );
  }

  public totalDiasPrincipales(): number {
    return this.periodoPrincipal.totalDias();
  }

  public totalDiasVisuales(): number {
    return this.periodoCompleto.totalDias();
  }

  public esDiaPrincipal(dia: number): boolean {
    return dia >= 1 && dia <= this.totalDiasPrincipales();
  }
}