import { describe, expect, it } from 'vitest';

import { Calendario } from '../../src/domain/Calendario.js';
import { UnidadOperativa } from '../../src/domain/UnidadOperativa.js';

describe('Calendario', () => {
  it('rechaza unidades operativas duplicadas sin distinguir mayúsculas', () => {
    const calendario = new Calendario('Julio 2026');

    calendario.agregarUnidadOperativa(
      UnidadOperativa.create({ nombre: 'CACAO PISTA', empleados: [] }),
    );

    expect(() =>
      calendario.agregarUnidadOperativa(
        UnidadOperativa.create({ nombre: 'cacao pista', empleados: [] }),
      ),
    ).toThrow(
      'El calendario ya contiene la unidad operativa "cacao pista".',
    );
  });
});
