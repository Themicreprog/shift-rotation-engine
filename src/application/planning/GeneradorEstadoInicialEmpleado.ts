import { Empleado } from '../../domain/Empleado.js';
import { EstadoPlanificacionEmpleado } from '../../domain/planning/EstadoPlanificacionEmpleado.js';

export class GeneradorEstadoInicialEmpleado {
  public execute(empleado: Empleado): EstadoPlanificacionEmpleado {
    const ultimoDia = empleado.totalDias();
    const estadoFinal = empleado.estadoDelDia(ultimoDia);

    return EstadoPlanificacionEmpleado.create({
      estadoInicial: estadoFinal,
    });
  }
}