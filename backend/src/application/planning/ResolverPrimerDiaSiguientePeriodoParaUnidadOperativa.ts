import { AnalizadorEstadoFinalEmpleado } from './AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from './DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from './DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from './GeneradorRotacionSemanal.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { Empleado } from '../../domain/Empleado.js';

export class ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa {
  constructor(
    private readonly analizadorEstadoFinalEmpleado: AnalizadorEstadoFinalEmpleado,
    private readonly decisorPrimerDiaContinuidadSimple: DecisorPrimerDiaContinuidadSimple,
private readonly generadorRotacionSemanal: GeneradorRotacionSemanal,
    private readonly distribuidorDiaLibre: DistribuidorDiaLibre,
  ) {}

  public resolver(
    unidadOperativaOrigen: UnidadOperativa,
    periodoDestino: PeriodoPlanificacion,
  ): UnidadOperativa {
    const distribucionDiasLibres =
      this.distribuidorDiaLibre.distribuir(
        unidadOperativaOrigen.empleados,
      );

    const empleadosDestino = unidadOperativaOrigen.empleados.map(
      (empleadoOrigen) =>
        this.resolverEmpleado(
          unidadOperativaOrigen,
          empleadoOrigen,
          periodoDestino,
          distribucionDiasLibres,
        ),
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
    distribucionDiasLibres: ReadonlyMap<string, number>,
  ): Empleado {
    const resumenEstadoFinal =
      this.analizadorEstadoFinalEmpleado.analyze(
        unidadOperativaOrigen,
        empleadoOrigen,
      );

    const estadoPrimerDia =
      this.decisorPrimerDiaContinuidadSimple.decide(
        resumenEstadoFinal,
      );

    const posicionLibre =
      this.distribuidorDiaLibre.obtenerDiaLibre(
        empleadoOrigen.nombre,
        distribucionDiasLibres,
      );

    const estadosPorDia =
      this.generadorRotacionSemanal.generar(
        estadoPrimerDia,
        periodoDestino.totalDias(),
        posicionLibre,
      );

    return Empleado.create({
      nombre: empleadoOrigen.nombre,
      estadosPorDia,
    });
  }
}