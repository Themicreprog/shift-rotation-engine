import { RotationResult } from '../../domain/rotation/RotationResult.js';
import { Calendario } from '../../domain/Calendario.js';

export class ResultadoPlanificacion extends RotationResult {
  private constructor(
    calendario: Calendario,
    cambios: string[],
    advertencias: string[],
    conflictos: string[],
  ) {
    super(calendario, cambios, advertencias, conflictos);
  }

  public static exitoso(calendario: Calendario): ResultadoPlanificacion {
    return new ResultadoPlanificacion(calendario, [], [], []);
  }

  public static conConflictos(
    calendario: Calendario,
    conflictos: ReadonlyArray<string>,
  ): ResultadoPlanificacion {
    return new ResultadoPlanificacion(calendario, [], [], [...conflictos]);
  }
}