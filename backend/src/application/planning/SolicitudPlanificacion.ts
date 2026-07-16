import { Calendario } from '../../domain/Calendario.js';
import { AlcanceOperativo } from '../../domain/planning/AlcanceOperativo.js';
import { ComodinesPlanificacion } from '../../domain/planning/ComodinesPlanificacion.js';
import { EventosPlanificacion } from '../../domain/planning/EventosPlanificacion.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';

export class SolicitudPlanificacion {
  public constructor(
    public readonly calendarioOrigen: Calendario,
    public readonly periodoDestino: PeriodoPlanificacion,
    public readonly alcanceOperativo: AlcanceOperativo,
    public readonly eventos: EventosPlanificacion = EventosPlanificacion.vacio(),
    public readonly comodines: ComodinesPlanificacion = ComodinesPlanificacion.vacio(),
  ) {}
}
