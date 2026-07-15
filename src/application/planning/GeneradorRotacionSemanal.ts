import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { SemanaLaboral } from '../../domain/planning/SemanaLaboral.js';

const TURNO_A = 'TURNO A';
const TURNO_B = 'TURNO B';

export class GeneradorRotacionSemanal {
  public generar(
    estadoInicial: EstadoTurno,
    cantidadDias: number,
    posicionLibre = 6,
  ): EstadoTurno[] {
    if (!Number.isInteger(cantidadDias) || cantidadDias <= 0) {
      throw new Error(
        'La cantidad de días para generar continuidad simple debe ser un entero mayor que cero.',
      );
    }

    if (!estadoInicial.esAsignacionOperativa()) {
      return Array.from(
        { length: cantidadDias },
        () => EstadoTurno.create(estadoInicial.valor),
      );
    }

    const estados: EstadoTurno[] = [];

    let turnoActual = estadoInicial;

    while (estados.length < cantidadDias) {
      const semana = SemanaLaboral.create(
        turnoActual,
        posicionLibre,
      );

      for (const estado of semana.obtenerEstados()) {
        if (estados.length >= cantidadDias) {
          break;
        }

        estados.push(estado);
      }

      turnoActual =
        turnoActual.valor === TURNO_A
          ? EstadoTurno.create(TURNO_B)
          : EstadoTurno.create(TURNO_A);
    }

    return estados;
  }
}