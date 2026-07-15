import { EstadoTurno } from './EstadoTurno.js';

export class Empleado {
  private constructor(
    public readonly nombre: string,
    private readonly estadosPorDia: ReadonlyArray<EstadoTurno>,
  ) {}

  public static create(input: {
    nombre: string;
    estadosPorDia: ReadonlyArray<EstadoTurno>;
  }): Empleado {
    const nombre = input.nombre.trim();

    if (nombre.length === 0) {
      throw new Error('Empleado.nombre no puede estar vacío.');
    }

    return new Empleado(nombre, [...input.estadosPorDia]);
  }

  public estadoDelDia(dia: number): EstadoTurno {
    const estado = this.estadosPorDia[dia - 1];

    if (!estado) {
      throw new Error(`No existe estado para el día ${dia} de ${this.nombre}.`);
    }

    return estado;
  }

  public totalDias(): number {
    return this.estadosPorDia.length;
  }
}