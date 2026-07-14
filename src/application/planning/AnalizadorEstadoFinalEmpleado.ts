import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { ResumenEstadoFinalEmpleado } from '../../domain/planning/ResumenEstadoFinalEmpleado.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';

export class AnalizadorEstadoFinalEmpleado {
  public analyze(
    unidadOperativa: UnidadOperativa,
    empleado: Empleado,
  ): ResumenEstadoFinalEmpleado {
    const ultimoDiaConInformacion = empleado.totalDias();
    const ultimoEstadoRegistrado = empleado.estadoDelDia(ultimoDiaConInformacion);
    const ultimaAsignacionValida = ultimoEstadoRegistrado;
    const ultimoTurno = this.normalizarTurno(ultimoEstadoRegistrado);

    return ResumenEstadoFinalEmpleado.create({
      nombreEmpleado: empleado.nombre,
      nombreUnidadOperativa: unidadOperativa.nombre,
      ultimoDiaConInformacion,
      ultimoEstadoRegistrado,
      ultimoTurno,
      ultimaAsignacionValida,
    });
  }

  private normalizarTurno(estado: EstadoTurno): string {
    return estado.valor.trim().toUpperCase();
  }
}