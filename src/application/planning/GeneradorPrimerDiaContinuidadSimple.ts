import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { ResumenEstadoFinalEmpleado } from '../../domain/planning/ResumenEstadoFinalEmpleado.js';

export class GeneradorPrimerDiaContinuidadSimple {
  public generate(
    resumen: ResumenEstadoFinalEmpleado,
  ): EstadoTurno {
    return resumen.ultimoEstadoRegistrado;
  }
}