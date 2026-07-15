import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { ResumenEstadoFinalEmpleado } from '../../domain/planning/ResumenEstadoFinalEmpleado.js';

export class DecisorPrimerDiaContinuidadSimple {
  public decide(resumen: ResumenEstadoFinalEmpleado): EstadoTurno {
    if (
      resumen.ultimoEstadoRegistrado.valor === 'LIBRE' &&
      resumen.ultimaAsignacionOperativaValida
    ) {
      return resumen.ultimaAsignacionOperativaValida;
    }

    return resumen.ultimoEstadoRegistrado;
  }
}