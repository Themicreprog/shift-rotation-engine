import { UnidadOperativa } from '../../domain/UnidadOperativa.js';

export interface IncidenciaCobertura {
  dia: number;
  turno: 'TURNO A' | 'TURNO B';
  requeridos: number;
  disponibles: number;
}

export class ValidadorCobertura {
  public validar(
    unidadOperativa: UnidadOperativa,
    coberturaMinimaPorTurno: number,
  ): IncidenciaCobertura[] {
    const incidencias: IncidenciaCobertura[] = [];

    const primerEmpleado = unidadOperativa.empleados.at(0);

    if (!primerEmpleado) {
      return incidencias;
    }

    const totalDias = primerEmpleado.totalDias();

    for (let dia = 1; dia <= totalDias; dia++) {
      let turnoA = 0;
      let turnoB = 0;

      for (const empleado of unidadOperativa.empleados) {
        const estado = empleado.estadoDelDia(dia).valor;

        switch (estado) {
          case 'TURNO A':
            turnoA++;
            break;

          case 'TURNO B':
            turnoB++;
            break;
        }
      }

      if (turnoA < coberturaMinimaPorTurno) {
        incidencias.push({
          dia,
          turno: 'TURNO A',
          requeridos: coberturaMinimaPorTurno,
          disponibles: turnoA,
        });
      }

      if (turnoB < coberturaMinimaPorTurno) {
        incidencias.push({
          dia,
          turno: 'TURNO B',
          requeridos: coberturaMinimaPorTurno,
          disponibles: turnoB,
        });
      }
    }

    return incidencias;
  }
}