import { AnalizadorEstadoFinalEmpleado } from './AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from './DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from './DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from './GeneradorRotacionSemanal.js';

import { Empleado } from '../../domain/Empleado.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';

export class PlanificadorUnidadOperativa {
  constructor(
    private readonly analizadorEstadoFinalEmpleado: AnalizadorEstadoFinalEmpleado,
    private readonly decisorPrimerDiaContinuidadSimple: DecisorPrimerDiaContinuidadSimple,
    private readonly generadorRotacionSemanal: GeneradorRotacionSemanal,
    private readonly distribuidorDiaLibre: DistribuidorDiaLibre,
  ) {}

  public planificar(
    unidadOperativaOrigen: UnidadOperativa,
    periodoDestino: PeriodoPlanificacion,
  ): UnidadOperativa {
    const distribucionDiasLibres =
      this.distribuidorDiaLibre.distribuir(
        unidadOperativaOrigen.empleados,
      );

    const empleadosDestino = unidadOperativaOrigen.empleados.map(
      (empleado) =>
        this.planificarEmpleado(
          unidadOperativaOrigen,
          empleado,
          periodoDestino,
          distribucionDiasLibres,
        ),
    );

    return UnidadOperativa.create({
      nombre: unidadOperativaOrigen.nombre,
      empleados: empleadosDestino,
    });
  }

  private planificarEmpleado(
    unidadOperativaOrigen: UnidadOperativa,
    empleadoOrigen: Empleado,
    periodoDestino: PeriodoPlanificacion,
    distribucionDiasLibres: ReadonlyMap<string, number>,
  ): Empleado {
    const resumen =
      this.analizadorEstadoFinalEmpleado.analyze(
        unidadOperativaOrigen,
        empleadoOrigen,
      );

    const estadoInicial =
      this.decisorPrimerDiaContinuidadSimple.decide(
        resumen,
      );

    const posicionLibre =
      this.distribuidorDiaLibre.obtenerDiaLibre(
        empleadoOrigen.nombre,
        distribucionDiasLibres,
      );

    const estados =
      this.generadorRotacionSemanal.generar(
        estadoInicial,
        periodoDestino.totalDias(),
        posicionLibre,
      );

    return Empleado.create({
      nombre: empleadoOrigen.nombre,
      estadosPorDia: estados,
    });
  }
}