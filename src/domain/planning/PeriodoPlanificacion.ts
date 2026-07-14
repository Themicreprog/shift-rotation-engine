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
    const diferencia = this.inicioNormalizado().getTime() - this.finNormalizado().getTime();

    return Math.abs(Math.floor(diferencia / milisegundosPorDia)) + 1;
  }

  private inicioNormalizado(): Date {
    return new Date(
      this.fechaInicio.getFullYear(),
      this.fechaInicio.getMonth(),
      this.fechaInicio.getDate(),
    );
  }

  private finNormalizado(): Date {
    return new Date(
      this.fechaFin.getFullYear(),
      this.fechaFin.getMonth(),
      this.fechaFin.getDate(),
    );
  }
}