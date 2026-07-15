import { RotationContext } from './RotationContext.js';
import { RotationResult } from '../../domain/rotation/RotationResult.js';

export class RotationEngine {
  public execute(context: RotationContext): RotationResult {
    return new RotationResult(
      context.calendarioOrigen,
      [],
      [],
      [],
    );
  }
}