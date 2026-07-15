import { EstadoTurno } from '../EstadoTurno.js';

export class ResumenEstadoFinalEmpleado {
  private constructor(
    public readonly nombreEmpleado: string,
    public readonly nombreUnidadOperativa: string,
    public readonly ultimoDiaConInformacion: number,
    public readonly ultimoEstadoRegistrado: EstadoTurno,
    public readonly ultimoTurno: string,
    public readonly ultimaAsignacionOperativaValida: EstadoTurno | null,
  ) {}

  public static create(input: {
    nombreEmpleado: string;
    nombreUnidadOperativa: string;
    ultimoDiaConInformacion: number;
    ultimoEstadoRegistrado: EstadoTurno;
    ultimoTurno: string;
    ultimaAsignacionOperativaValida: EstadoTurno | null;
  }): ResumenEstadoFinalEmpleado {
    const nombreEmpleado = input.nombreEmpleado.trim();
    const nombreUnidadOperativa = input.nombreUnidadOperativa.trim();
    const ultimoTurno = input.ultimoTurno.trim().toUpperCase();

    if (nombreEmpleado.length === 0) {
      throw new Error(
        'ResumenEstadoFinalEmpleado.nombreEmpleado no puede estar vacío.',
      );
    }

    if (nombreUnidadOperativa.length === 0) {
      throw new Error(
        'ResumenEstadoFinalEmpleado.nombreUnidadOperativa no puede estar vacío.',
      );
    }

    if (
      !Number.isInteger(input.ultimoDiaConInformacion) ||
      input.ultimoDiaConInformacion <= 0
    ) {
      throw new Error(
        'ResumenEstadoFinalEmpleado.ultimoDiaConInformacion debe ser un entero mayor que cero.',
      );
    }

    if (ultimoTurno.length === 0) {
      throw new Error(
        'ResumenEstadoFinalEmpleado.ultimoTurno no puede estar vacío.',
      );
    }

    return new ResumenEstadoFinalEmpleado(
      nombreEmpleado,
      nombreUnidadOperativa,
      input.ultimoDiaConInformacion,
      input.ultimoEstadoRegistrado,
      ultimoTurno,
      input.ultimaAsignacionOperativaValida,
    );
  }
}