import { AnalizadorEstadoFinalEmpleado } from './AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from './DecisorPrimerDiaContinuidadSimple.js';
import { GeneradorEstadosContinuidadSimple } from './GeneradorEstadosContinuidadSimple.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { Empleado } from '../../domain/Empleado.js';

export class ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa {
  constructor(
    private readonly analizadorEstadoFinalEmpleado: AnalizadorEstadoFinalEmpleado,
    private readonly decisorPrimerDiaContinuidadSimple: DecisorPrimerDiaContinuidadSimple,
    private readonly generadorEstadosContinuidadSimple: GeneradorEstadosContinuidadSimple,
  ) {}

  resolver(
    unidadOperativaOrigen: UnidadOperativa,
    periodoDestino: PeriodoPlanificacion,
  ): UnidadOperativa {
    const empleadosDestino = unidadOperativaOrigen.empleados.map((empleadoOrigen) =>
      this.resolverEmpleado(unidadOperativaOrigen, empleadoOrigen, periodoDestino),
    );

    return UnidadOperativa.create({
      nombre: unidadOperativaOrigen.nombre,
      empleados: empleadosDestino,
    });
  }

  private resolverEmpleado(
    unidadOperativaOrigen: UnidadOperativa,
    empleadoOrigen: Empleado,
    periodoDestino: PeriodoPlanificacion,
  ): Empleado {
    const resumenEstadoFinal = this.analizadorEstadoFinalEmpleado.analyze(
      unidadOperativaOrigen,
      empleadoOrigen,
    );

    const estadoPrimerDia =
      this.decisorPrimerDiaContinuidadSimple.decide(resumenEstadoFinal);

    const estadosPorDia = this.generadorEstadosContinuidadSimple.generar(
      estadoPrimerDia,
      periodoDestino.totalDias(),
    );

    return Empleado.create({
      nombre: empleadoOrigen.nombre,
      estadosPorDia,
    });
  }
}