import { Calendario } from '../../domain/Calendario.js';
import { AlcanceOperativo } from '../../domain/planning/AlcanceOperativo.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';

export class SolicitudPlanificacion {
  public constructor(
    public readonly calendarioOrigen: Calendario,
    public readonly periodoDestino: PeriodoPlanificacion,
    public readonly alcanceOperativo: AlcanceOperativo,
  ) {}
}