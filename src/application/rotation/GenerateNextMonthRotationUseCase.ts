import { RotationContext } from './RotationContext.js';
import { RotationEngine } from './RotationEngine.js';
import { RotationResult } from '../../domain/rotation/RotationResult.js';

export class GenerateNextMonthRotationUseCase {
  public constructor(
    private readonly rotationEngine: RotationEngine,
  ) {}

  public execute(context: RotationContext): RotationResult {
    return this.rotationEngine.execute(context);
  }
}