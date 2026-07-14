import { Calendario } from '../../domain/Calendario.js';
import { ResumenEstadoFinalEmpleado } from '../../domain/planning/ResumenEstadoFinalEmpleado.js';
import { AnalizadorEstadoFinalEmpleado } from './AnalizadorEstadoFinalEmpleado.js';

export class AnalizadorEstadoFinalCalendario {
  public constructor(
    private readonly analizadorEstadoFinalEmpleado: AnalizadorEstadoFinalEmpleado,
  ) {}

  public analyze(calendario: Calendario): ReadonlyArray<ResumenEstadoFinalEmpleado> {
    const resumenes: ResumenEstadoFinalEmpleado[] = [];

    for (const unidadOperativa of calendario.unidadesOperativas) {
      for (const empleado of unidadOperativa.empleados) {
        resumenes.push(
          this.analizadorEstadoFinalEmpleado.analyze(unidadOperativa, empleado),
        );
      }
    }

    return resumenes;
  }
}