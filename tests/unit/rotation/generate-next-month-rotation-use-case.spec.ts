import { describe, expect, it } from 'vitest';

import { GenerateNextMonthRotationUseCase } from '../../../src/application/rotation/GenerateNextMonthRotationUseCase.js';
import { RotationContext } from '../../../src/application/rotation/RotationContext.js';
import { RotationEngine } from '../../../src/application/rotation/RotationEngine.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { RotationResult } from '../../../src/domain/rotation/RotationResult.js';

describe('GenerateNextMonthRotationUseCase', () => {
  it('debe delegar la ejecución al RotationEngine y devolver un RotationResult', () => {
    const calendarioOrigen = new Calendario('Junio 2026');
    const context = new RotationContext(calendarioOrigen);
    const rotationEngine = new RotationEngine();
    const useCase = new GenerateNextMonthRotationUseCase(rotationEngine);

    const result = useCase.execute(context);

    expect(result).toBeInstanceOf(RotationResult);
    expect(result.calendario).toBe(calendarioOrigen);
    expect(result.cambios).toEqual([]);
    expect(result.advertencias).toEqual([]);
    expect(result.conflictos).toEqual([]);
  });
});