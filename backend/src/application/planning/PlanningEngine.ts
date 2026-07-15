import { AnalizadorEstadoFinalCalendario } from './AnalizadorEstadoFinalCalendario.js';
import { PlanificacionInputValidator } from './PlanificacionInputValidator.js';
import { ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa } from './ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa.js';
import { SolicitudPlanificacion } from './SolicitudPlanificacion.js';
import { ResultadoPlanificacion } from './ResultadoPlanificacion.js';
import { Calendario } from '../../domain/Calendario.js';

export class PlanningEngine {
  constructor(
    private readonly planificacionInputValidator: PlanificacionInputValidator,
    private readonly analizadorEstadoFinalCalendario: AnalizadorEstadoFinalCalendario,
    private readonly resolverPeriodoParaUnidadOperativa: ResolverPrimerDiaSiguientePeriodoParaUnidadOperativa,
  ) {}

  execute(solicitud: SolicitudPlanificacion): ResultadoPlanificacion {
    const validacion = this.planificacionInputValidator.validate(solicitud);

    if (!validacion.esValida) {
      return ResultadoPlanificacion.conConflictos(
        solicitud.calendarioOrigen,
        validacion.errores,
      );
    }

    const calendarioDestino = new Calendario(
      `PLANIFICACION-${solicitud.periodoDestino.fechaInicio.getUTCFullYear()}-${String(
        solicitud.periodoDestino.fechaInicio.getUTCMonth() + 1,
      ).padStart(2, '0')}-COMPLETO`,
    );

    const unidadesOrigen = solicitud.alcanceOperativo.unidadesOperativas.map(
      (nombreUnidadOperativa) => {
        const unidadOperativa =
          solicitud.calendarioOrigen.buscarUnidadOperativa(nombreUnidadOperativa);

        if (!unidadOperativa) {
          throw new Error(
            `La unidad operativa "${nombreUnidadOperativa}" no existe en el calendario origen.`,
          );
        }

        return unidadOperativa;
      },
    );

    this.analizadorEstadoFinalCalendario.analyze(solicitud.calendarioOrigen);

    for (const unidadOrigen of unidadesOrigen) {
      const unidadDestino = this.resolverPeriodoParaUnidadOperativa.resolver(
        unidadOrigen,
        solicitud.periodoDestino,
      );

      calendarioDestino.agregarUnidadOperativa(unidadDestino);
    }

    return ResultadoPlanificacion.exitoso(calendarioDestino);
  }
}