import { describe, expect, it } from 'vitest';

import { AlcanceOperativo } from '../../../src/domain/planning/AlcanceOperativo.js';

describe('AlcanceOperativo', () => {
  it('rechaza unidades duplicadas aunque cambien mayúsculas o espacios', () => {
    expect(() =>
      AlcanceOperativo.create({
        unidadesOperativas: ['CACAO  PISTA', ' cacao pista '],
      }),
    ).toThrow(
      'AlcanceOperativo contiene unidades operativas repetidas: cacao pista.',
    );
  });
});
