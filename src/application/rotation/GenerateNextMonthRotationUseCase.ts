import { RotationResult } from '../../domain/rotation/RotationResult.js';
import { RotationContext } from './RotationContext.js';
import { RotationEngine } from './RotationEngine.js';

/**
 * Caso de uso para solicitar la generación del siguiente mes.
 *
 * Esta clase representa la intención de negocio y delega
 * la ejecución al RotationEngine.
 *
 * No contiene reglas de turnos ni conoce Excel.
 */
export class GenerateNextMonthRotationUseCase {
  public constructor(
    private readonly rotationEngine: RotationEngine,
  ) {}

  public execute(context: RotationContext): RotationResult {
    return this.rotationEngine.execute(context);
  }
}