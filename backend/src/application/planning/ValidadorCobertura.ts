import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import type { RequerimientoCoberturaTurnos } from './PoliticaCoberturaOperativa.js';

export interface IncidenciaCobertura {
  dia: number;
  turno: 'TURNO A' | 'TURNO B';
  requeridos: number;
  disponibles: number;
}

export type RequerimientoCobertura =
  | number
  | ((dia: number) => RequerimientoCoberturaTurnos);

export class ValidadorCobertura {
  public validar(
    unidadOperativa: UnidadOperativa,
    requerimiento: RequerimientoCobertura,
  ): IncidenciaCobertura[] {
    const incidencias: IncidenciaCobertura[] = [];
    const primerEmpleado = unidadOperativa.empleados.at(0);

    if (!primerEmpleado) {
      return incidencias;
    }

    const totalDias = primerEmpleado.totalDias();

    for (let dia = 1; dia <= totalDias; dia += 1) {
      let turnoA = 0;
      let turnoB = 0;

      for (const empleado of unidadOperativa.empleados) {
        const estado = empleado.estadoDelDia(dia).valor;

        if (estado === 'TURNO A') {
          turnoA += 1;
        } else if (estado === 'TURNO B') {
          turnoB += 1;
        }
      }

      const requeridos =
        typeof requerimiento === 'number'
          ? { turnoA: requerimiento, turnoB: requerimiento }
          : requerimiento(dia);

      if (turnoA < requeridos.turnoA) {
        incidencias.push({
          dia,
          turno: 'TURNO A',
          requeridos: requeridos.turnoA,
          disponibles: turnoA,
        });
      }

      if (turnoB < requeridos.turnoB) {
        incidencias.push({
          dia,
          turno: 'TURNO B',
          requeridos: requeridos.turnoB,
          disponibles: turnoB,
        });
      }
    }

    return incidencias;
  }
}
