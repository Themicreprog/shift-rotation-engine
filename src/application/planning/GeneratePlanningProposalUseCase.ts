import { RotationResult } from '../../domain/rotation/RotationResult.js';
import { PlanningEngine } from './PlanningEngine.js';
import { SolicitudPlanificacion } from './SolicitudPlanificacion.js';

export class GeneratePlanningProposalUseCase {
  public constructor(
    private readonly planningEngine: PlanningEngine,
  ) {}

  public execute(solicitud: SolicitudPlanificacion): RotationResult {
    return this.planningEngine.execute(solicitud);
  }
}