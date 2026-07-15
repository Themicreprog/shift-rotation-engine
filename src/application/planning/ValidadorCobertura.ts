import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';

export class ValidadorCobertura {
  /**
   * Verifica si una unidad cumple la cobertura mínima
   * para un día específico.
   *
   * @param empleados Empleados ya planificados.
   * @param dia Día del período (1..N).
   * @param minimoTurnoA Personal mínimo requerido en Turno A.
   * @param minimoTurnoB Personal mínimo requerido en Turno B.
   */
  public validarDia(
    empleados: ReadonlyArray<Empleado>,
    dia: number,
    minimoTurnoA: number,
    minimoTurnoB: number,
  ): boolean {
    let turnoA = 0;
    let turnoB = 0;

    for (const empleado of empleados) {
      const estado = empleado.estadoDelDia(dia);

      if (estado.equals(EstadoTurno.create('TURNO A'))) {
        turnoA += 1;
      }

      if (estado.equals(EstadoTurno.create('TURNO B'))) {
        turnoB += 1;
      }
    }

    return turnoA >= minimoTurnoA && turnoB >= minimoTurnoB;
  }

  /**
   * Devuelve cuántas personas hay por turno
   * en un día concreto.
   */
  public obtenerCobertura(
    empleados: ReadonlyArray<Empleado>,
    dia: number,
  ): {
    turnoA: number;
    turnoB: number;
  } {
    let turnoA = 0;
    let turnoB = 0;

    for (const empleado of empleados) {
      const estado = empleado.estadoDelDia(dia);

      if (estado.equals(EstadoTurno.create('TURNO A'))) {
        turnoA += 1;
      }

      if (estado.equals(EstadoTurno.create('TURNO B'))) {
        turnoB += 1;
      }
    }

    return {
      turnoA,
      turnoB,
    };
  }
}