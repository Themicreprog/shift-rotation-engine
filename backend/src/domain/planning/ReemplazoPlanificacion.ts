export type TipoCoberturaPlanificacion =
  | 'BASE'
  | 'FLEXIBLE'
  | 'COMODIN'
  | 'MANUAL';

export type MotivoReemplazoPlanificacion =
  | 'VACACIONES'
  | 'FERIADO'
  | 'DESCANSO'
  | 'FALTANTE'
  | 'TRANSFERENCIA_FLEXIBLE'
  | 'AJUSTE_MANUAL';

export type TurnoOperativoPlanificacion = 'TURNO A' | 'TURNO B';

export interface VacantePlanificacion {
  readonly unidadOperativa: string;
  readonly dia: number;
  readonly turno: TurnoOperativoPlanificacion;
  readonly empleadoTitular: string | null;
  readonly motivo: MotivoReemplazoPlanificacion;
}

export class ReemplazoPlanificacion {
  private constructor(
    public readonly unidadOperativa: string,
    public readonly dia: number,
    public readonly turno: TurnoOperativoPlanificacion,
    public readonly empleadoTitular: string | null,
    public readonly empleadoReemplazo: string,
    public readonly tipoCobertura: TipoCoberturaPlanificacion,
    public readonly motivo: MotivoReemplazoPlanificacion,
  ) {}

  public static create(input: {
    unidadOperativa: string;
    dia: number;
    turno: TurnoOperativoPlanificacion;
    empleadoTitular?: string | null;
    empleadoReemplazo: string;
    tipoCobertura: TipoCoberturaPlanificacion;
    motivo: MotivoReemplazoPlanificacion;
  }): ReemplazoPlanificacion {
    const unidadOperativa = input.unidadOperativa.trim();
    const empleadoTitular = input.empleadoTitular?.trim() || null;
    const empleadoReemplazo = input.empleadoReemplazo.trim();

    if (unidadOperativa.length === 0) {
      throw new Error('ReemplazoPlanificacion.unidadOperativa no puede estar vacía.');
    }

    if (!Number.isInteger(input.dia) || input.dia < 1) {
      throw new Error('ReemplazoPlanificacion.dia debe ser un entero mayor que cero.');
    }

    if (input.turno !== 'TURNO A' && input.turno !== 'TURNO B') {
      throw new Error('ReemplazoPlanificacion.turno no es válido.');
    }

    if (empleadoReemplazo.length === 0) {
      throw new Error('ReemplazoPlanificacion.empleadoReemplazo no puede estar vacío.');
    }

    if (
      empleadoTitular !== null &&
      empleadoTitular.toUpperCase() === empleadoReemplazo.toUpperCase()
    ) {
      throw new Error('El titular y su reemplazo deben ser empleados distintos.');
    }

    return new ReemplazoPlanificacion(
      unidadOperativa,
      input.dia,
      input.turno,
      empleadoTitular,
      empleadoReemplazo,
      input.tipoCobertura,
      input.motivo,
    );
  }
}
