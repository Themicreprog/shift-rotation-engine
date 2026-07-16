import { Empleado } from '../../domain/Empleado.js';

export interface IncidenciaTransicionTurno {
  readonly empleado: string;
  readonly diaTurnoB: number;
  readonly diaTurnoA: number;
}

/** Detecta el cambio sin descanso intermedio de TURNO B a TURNO A. */
export class ValidadorTransicionTurno {
  public esInsegura(estadoAnterior: string, estadoSiguiente: string): boolean {
    return estadoAnterior === 'TURNO B' && estadoSiguiente === 'TURNO A';
  }

  public validarAlrededorDelDia(empleado: Empleado, dia: number): IncidenciaTransicionTurno[] {
    if (!Number.isInteger(dia) || dia < 1 || dia > empleado.totalDias()) {
      throw new Error('El dia a validar no existe para el empleado.');
    }

    const posiblesInicios = [dia - 1, dia];
    const incidencias: IncidenciaTransicionTurno[] = [];

    for (const diaTurnoB of posiblesInicios) {
      const diaTurnoA = diaTurnoB + 1;

      if (diaTurnoB < 1 || diaTurnoA > empleado.totalDias()) {
        continue;
      }

      if (
        this.esInsegura(
          empleado.estadoDelDia(diaTurnoB).valor,
          empleado.estadoDelDia(diaTurnoA).valor,
        )
      ) {
        incidencias.push({
          empleado: empleado.nombre,
          diaTurnoB,
          diaTurnoA,
        });
      }
    }

    return incidencias;
  }
}
