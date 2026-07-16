import { TipoEventoPlanificacion } from './TipoEventoPlanificacion.js';

export class EventoPlanificacion {
  private constructor(
    public readonly empleado: string,
    public readonly tipo: TipoEventoPlanificacion,
    public readonly fechaInicio: Date,
    public readonly fechaFin: Date,
    public readonly unidadOperativa: string | null,
  ) {}

  public static create(input: {
    empleado: string;
    tipo: TipoEventoPlanificacion;
    fechaInicio: Date;
    fechaFin: Date;
    unidadOperativa?: string;
  }): EventoPlanificacion {
    const empleado = input.empleado.trim();
    const unidadOperativa = input.unidadOperativa?.trim() ?? null;

    if (empleado.length === 0) {
      throw new Error('EventoPlanificacion.empleado no puede estar vacío.');
    }

    if (unidadOperativa !== null && unidadOperativa.length === 0) {
      throw new Error('EventoPlanificacion.unidadOperativa no puede estar vacía.');
    }

    if (!Object.values(TipoEventoPlanificacion).includes(input.tipo)) {
      throw new Error('EventoPlanificacion.tipo no es válido.');
    }

    if (!this.esFechaValida(input.fechaInicio)) {
      throw new Error('EventoPlanificacion.fechaInicio debe ser una fecha válida.');
    }

    if (!this.esFechaValida(input.fechaFin)) {
      throw new Error('EventoPlanificacion.fechaFin debe ser una fecha válida.');
    }

    if (this.inicioDelDia(input.fechaFin).getTime() < this.inicioDelDia(input.fechaInicio).getTime()) {
      throw new Error('EventoPlanificacion.fechaFin no puede ser menor que fechaInicio.');
    }

    return new EventoPlanificacion(
      empleado,
      input.tipo,
      new Date(input.fechaInicio),
      new Date(input.fechaFin),
      unidadOperativa,
    );
  }

  public estaActivoEn(fecha: Date): boolean {
    if (!EventoPlanificacion.esFechaValida(fecha)) {
      throw new Error('La fecha consultada debe ser válida.');
    }

    const instante = EventoPlanificacion.inicioDelDia(fecha).getTime();

    return (
      instante >= EventoPlanificacion.inicioDelDia(this.fechaInicio).getTime() &&
      instante <= EventoPlanificacion.inicioDelDia(this.fechaFin).getTime()
    );
  }

  public seSolapaCon(otro: EventoPlanificacion): boolean {
    if (this.empleado.toUpperCase() !== otro.empleado.toUpperCase()) {
      return false;
    }

    if (
      this.unidadOperativa !== null &&
      otro.unidadOperativa !== null &&
      this.unidadOperativa.toUpperCase() !== otro.unidadOperativa.toUpperCase()
    ) {
      return false;
    }

    return (
      EventoPlanificacion.inicioDelDia(this.fechaInicio).getTime() <=
        EventoPlanificacion.inicioDelDia(otro.fechaFin).getTime() &&
      EventoPlanificacion.inicioDelDia(otro.fechaInicio).getTime() <=
        EventoPlanificacion.inicioDelDia(this.fechaFin).getTime()
    );
  }

  private static esFechaValida(fecha: Date): boolean {
    return fecha instanceof Date && !Number.isNaN(fecha.getTime());
  }

  private static inicioDelDia(fecha: Date): Date {
    return new Date(Date.UTC(
      fecha.getUTCFullYear(),
      fecha.getUTCMonth(),
      fecha.getUTCDate(),
    ));
  }
}
