import { SolicitudPlanificacion } from './SolicitudPlanificacion.js';
import { ValidacionPlanificacion } from '../../domain/planning/ValidacionPlanificacion.js';

export class PlanificacionInputValidator {
  public validate(solicitud: SolicitudPlanificacion): ValidacionPlanificacion {
    const errores: string[] = [];

    if (solicitud.calendarioOrigen.unidadesOperativas.length === 0) {
      errores.push('El calendario origen debe contener al menos una unidad operativa.');
    }

    const unidadesCalendario = solicitud.calendarioOrigen.unidadesOperativas.map((unidad) =>
      unidad.nombre.toUpperCase(),
    );

    const unidadesFueraDeCalendario = solicitud.alcanceOperativo.unidadesOperativas.filter(
      (unidad) => !unidadesCalendario.includes(unidad.toUpperCase()),
    );

    if (unidadesFueraDeCalendario.length > 0) {
      errores.push(
        `El alcance operativo contiene unidades inexistentes en el calendario origen: ${unidadesFueraDeCalendario.join(', ')}.`,
      );
    }

    if (errores.length > 0) {
      return ValidacionPlanificacion.failure(errores);
    }

    return ValidacionPlanificacion.success();
  }
}