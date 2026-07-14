import { EstadoTurno } from '../../domain/EstadoTurno.js';

export class GeneradorEstadosContinuidadSimple {
  generar(estadoInicial: EstadoTurno, cantidadDias: number): EstadoTurno[] {
    if (!Number.isInteger(cantidadDias) || cantidadDias <= 0) {
      throw new Error(
        'La cantidad de días para generar continuidad simple debe ser un entero mayor que cero.',
      );
    }

    return Array.from(
      { length: cantidadDias },
      () => EstadoTurno.create(estadoInicial.valor),
    );
  }
}