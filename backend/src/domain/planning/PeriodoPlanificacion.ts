export class PeriodoPlanificacion {
  private constructor(
    public readonly fechaInicio: Date,
    public readonly fechaFin: Date,
  ) {}

  public static create(input: {
    fechaInicio: Date;
    fechaFin: Date;
  }): PeriodoPlanificacion {
    const { fechaInicio, fechaFin } = input;

    if (!(fechaInicio instanceof Date) || Number.isNaN(fechaInicio.getTime())) {
      throw new Error('PeriodoPlanificacion.fechaInicio debe ser una fecha válida.');
    }

    if (!(fechaFin instanceof Date) || Number.isNaN(fechaFin.getTime())) {
      throw new Error('PeriodoPlanificacion.fechaFin debe ser una fecha válida.');
    }

    if (fechaFin.getTime() < fechaInicio.getTime()) {
      throw new Error('PeriodoPlanificacion.fechaFin no puede ser menor que fechaInicio.');
    }

    return new PeriodoPlanificacion(new Date(fechaInicio), new Date(fechaFin));
  }

  public totalDias(): number {
    const milisegundosPorDia = 24 * 60 * 60 * 1000;
    const diferencia = this.finNormalizado().getTime() - this.inicioNormalizado().getTime();

    return Math.floor(diferencia / milisegundosPorDia) + 1;
  }

  public fechaDelDia(dia: number): Date {
    if (!Number.isInteger(dia) || dia < 1 || dia > this.totalDias()) {
      throw new Error('El día solicitado está fuera del período de planificación.');
    }

    const fecha = this.inicioNormalizado();
    fecha.setUTCDate(fecha.getUTCDate() + dia - 1);

    return fecha;
  }

  private inicioNormalizado(): Date {
    return new Date(Date.UTC(
      this.fechaInicio.getUTCFullYear(),
      this.fechaInicio.getUTCMonth(),
      this.fechaInicio.getUTCDate(),
    ));
  }

  private finNormalizado(): Date {
    return new Date(Date.UTC(
      this.fechaFin.getUTCFullYear(),
      this.fechaFin.getUTCMonth(),
      this.fechaFin.getUTCDate(),
    ));
  }
}
