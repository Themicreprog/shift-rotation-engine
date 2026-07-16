import { RotationResult } from '../../domain/rotation/RotationResult.js';
import { Calendario } from '../../domain/Calendario.js';
import { ReemplazoPlanificacion } from '../../domain/planning/ReemplazoPlanificacion.js';

export class ResultadoPlanificacion extends RotationResult {
  private constructor(
    calendario: Calendario,
    cambios: string[],
    advertencias: string[],
    conflictos: string[],
    public readonly reemplazos: ReadonlyArray<ReemplazoPlanificacion>,
  ) {
    super(calendario, cambios, advertencias, conflictos);
  }

  public static exitoso(
    calendario: Calendario,
    cambios: ReadonlyArray<string> = [],
    advertencias: ReadonlyArray<string> = [],
    reemplazos: ReadonlyArray<ReemplazoPlanificacion> = [],
  ): ResultadoPlanificacion {
    return new ResultadoPlanificacion(
      calendario,
      [...cambios],
      [...advertencias],
      [],
      [...reemplazos],
    );
  }

  public static conConflictos(
    calendario: Calendario,
    conflictos: ReadonlyArray<string>,
  ): ResultadoPlanificacion {
    return new ResultadoPlanificacion(calendario, [], [], [...conflictos], []);
  }
}
