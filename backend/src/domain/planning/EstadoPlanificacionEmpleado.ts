import { EstadoTurno } from '../EstadoTurno.js';

export class EstadoPlanificacionEmpleado {
  private constructor(public readonly estadoInicial: EstadoTurno) {}

  public static create(input: {
    estadoInicial: EstadoTurno;
  }): EstadoPlanificacionEmpleado {
    return new EstadoPlanificacionEmpleado(input.estadoInicial);
  }
}