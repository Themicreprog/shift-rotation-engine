import { PlanningEngine } from './PlanningEngine.js';
import { ResultadoPlanificacion } from './ResultadoPlanificacion.js';
import { SolicitudPlanificacion } from './SolicitudPlanificacion.js';

export class GeneratePlanningProposalUseCase {
  public constructor(
    private readonly planningEngine: PlanningEngine,
  ) {}

  public execute(solicitud: SolicitudPlanificacion): ResultadoPlanificacion {
    return this.planningEngine.execute(solicitud);
  }
}
