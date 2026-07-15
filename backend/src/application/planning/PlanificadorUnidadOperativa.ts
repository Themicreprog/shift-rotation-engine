import { AnalizadorEstadoFinalEmpleado } from './AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from './DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from './DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from './GeneradorRotacionSemanal.js';
import { ValidadorCobertura } from './ValidadorCobertura.js';

import { Empleado } from '../../domain/Empleado.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';

export class PlanificadorUnidadOperativa {
  constructor(
    private readonly analizadorEstadoFinalEmpleado: AnalizadorEstadoFinalEmpleado,
    private readonly decisorPrimerDiaContinuidadSimple: DecisorPrimerDiaContinuidadSimple,
    private readonly generadorRotacionSemanal: GeneradorRotacionSemanal,
    private readonly distribuidorDiaLibre: DistribuidorDiaLibre,
    private readonly validadorCobertura: ValidadorCobertura,
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

    const unidadPlanificada = UnidadOperativa.create({
      nombre: unidadOperativaOrigen.nombre,
      empleados: empleadosDestino,
    });

    // Temporal.
    // Más adelante la cobertura mínima vendrá desde UnidadOperativa.
    const coberturaMinima =
      unidadOperativaOrigen.nombre.toUpperCase().includes('CAJA')
        ? 1
        : 3;

    const incidencias =
      this.validadorCobertura.validar(
        unidadPlanificada,
        coberturaMinima,
      );

    if (incidencias.length > 0) {
      console.warn(
        `Cobertura insuficiente en ${unidadOperativaOrigen.nombre}`,
        incidencias,
      );
    }

    return unidadPlanificada;
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