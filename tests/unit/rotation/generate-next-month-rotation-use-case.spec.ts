import { describe, expect, it } from 'vitest';

import { GenerateNextMonthRotationUseCase } from '../../../src/application/rotation/GenerateNextMonthRotationUseCase.js';
import { RotationContext } from '../../../src/application/rotation/RotationContext.js';
import { RotationEngine } from '../../../src/application/rotation/RotationEngine.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { RotationPolicy } from '../../../src/domain/rotation/RotationPolicy.js';
import { RotationResult } from '../../../src/domain/rotation/RotationResult.js';

describe('GenerateNextMonthRotationUseCase', () => {
  it('devuelve un RotationResult válido sin generar cambios todavía', () => {
    const calendarioOrigen = new Calendario('Junio 2026');

    const rotationPolicy: RotationPolicy = {};

    const rotationEngine = new RotationEngine(rotationPolicy);

    const useCase = new GenerateNextMonthRotationUseCase(rotationEngine);

    const context = new RotationContext(calendarioOrigen);

    const result = useCase.execute(context);

    expect(result).toBeInstanceOf(RotationResult);
    expect(result.calendario).toBe(calendarioOrigen);
    expect(result.cambios).toEqual([]);
    expect(result.advertencias).toEqual([]);
    expect(result.conflictos).toEqual([]);
  });
});