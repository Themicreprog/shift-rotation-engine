import { RotationResult } from '../../domain/rotation/RotationResult.js';
import { ValidacionPlanificacion } from '../../domain/planning/ValidacionPlanificacion.js';
import { PlanificacionInputValidator } from './PlanificacionInputValidator.js';
import { SolicitudPlanificacion } from './SolicitudPlanificacion.js';

export class PlanningEngine {
  public constructor(
    private readonly inputValidator: PlanificacionInputValidator,
  ) {}

  public execute(solicitud: SolicitudPlanificacion): RotationResult {
    const validacion: ValidacionPlanificacion = this.inputValidator.validate(solicitud);

    return new RotationResult(
      solicitud.calendarioOrigen,
      [],
      [],
      validacion.esValida ? [] : validacion.errores,
    );
  }
}