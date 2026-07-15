import { EstadoTurno } from '../EstadoTurno.js';

const DIAS_POR_SEMANA = 7;

export class SemanaLaboral {
  private constructor(
    private readonly estados: EstadoTurno[],
  ) {}

  public static create(
    turnoOperativo: EstadoTurno,
    posicionLibre: number,
  ): SemanaLaboral {
    if (!turnoOperativo.esAsignacionOperativa()) {
      throw new Error(
        'SemanaLaboral solo puede construirse a partir de un turno operativo.',
      );
    }

    if (
      !Number.isInteger(posicionLibre) ||
      posicionLibre < 0 ||
      posicionLibre >= DIAS_POR_SEMANA
    ) {
      throw new Error(
        'La posición del día libre debe estar entre 0 y 6.',
      );
    }

    const estados: EstadoTurno[] = [];

    for (let dia = 0; dia < DIAS_POR_SEMANA; dia += 1) {
      if (dia === posicionLibre) {
        estados.push(EstadoTurno.create('LIBRE'));
      } else {
        estados.push(EstadoTurno.create(turnoOperativo.valor));
      }
    }

    return new SemanaLaboral(estados);
  }

  public obtenerEstados(): EstadoTurno[] {
    return [...this.estados];
  }

  public totalDias(): number {
    return this.estados.length;
  }

  public estadoDelDia(dia: number): EstadoTurno {
    if (
      !Number.isInteger(dia) ||
      dia < 1 ||
      dia > this.estados.length
    ) {
      throw new Error(
        `El día ${dia} está fuera del rango de la semana laboral.`,
      );
    }

    return this.estados[dia - 1]!;
  }
}