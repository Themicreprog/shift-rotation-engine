import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { Calendario } from '../../domain/Calendario.js';
import { AnalizadorEstadoFinalCalendario } from './AnalizadorEstadoFinalCalendario.js';
import { DecisorPrimerDiaContinuidadSimple } from './DecisorPrimerDiaContinuidadSimple.js';

export class ResolverPrimerDiaSiguientePeriodoParaEmpleado {
  public constructor(
    private readonly analizadorEstadoFinalCalendario: AnalizadorEstadoFinalCalendario,
    private readonly decisorPrimerDiaContinuidadSimple: DecisorPrimerDiaContinuidadSimple,
  ) {}

  public resolve(
    calendarioOrigen: Calendario,
    nombreUnidadOperativa: string,
    nombreEmpleado: string,
  ): EstadoTurno {
    const resumenes = this.analizadorEstadoFinalCalendario.analyze(calendarioOrigen);

    const resumenEmpleado = resumenes.find(
      (resumen) =>
        resumen.nombreUnidadOperativa === nombreUnidadOperativa &&
        resumen.nombreEmpleado === nombreEmpleado,
    );

    if (!resumenEmpleado) {
      throw new Error(
        `No existe resumen final para el empleado ${nombreEmpleado} en la unidad ${nombreUnidadOperativa}.`,
      );
    }

    return this.decisorPrimerDiaContinuidadSimple.decide(resumenEmpleado);
  }
}