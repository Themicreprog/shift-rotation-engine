import { describe, expect, it } from 'vitest';

import { ComodinesPlanificacion } from '../../../src/domain/planning/ComodinesPlanificacion.js';

describe('ComodinesPlanificacion', () => {
  it('consulta los comodines por unidad sin exponer la colección interna', () => {
    const comodines = ComodinesPlanificacion.create([
      { unidadOperativa: 'Caja', empleado: 'Celio' },
      { unidadOperativa: 'Pista', empleado: 'Lester' },
    ]);

    expect(comodines.empleadosDeUnidad('CAJA')).toEqual(['Celio']);
    expect(comodines.esComodin('pista', 'lester')).toBe(true);
    expect(comodines.listar()).toEqual([
      { unidadOperativa: 'Caja', empleado: 'Celio' },
      { unidadOperativa: 'Pista', empleado: 'Lester' },
    ]);
  });

  it('rechaza registrar el mismo comodín dos veces en la unidad', () => {
    expect(() =>
      ComodinesPlanificacion.create([
        { unidadOperativa: 'Caja', empleado: 'Celio' },
        { unidadOperativa: 'CAJA', empleado: 'celio' },
      ]),
    ).toThrow('Un empleado no puede registrarse dos veces como comodín.');
  });

  it('rechaza empleados que no son comodines reales', () => {
    expect(() =>
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Rony' },
      ]),
    ).toThrow('El empleado Rony no está autorizado como comodín.');
  });

  it('rechaza asignar el mismo comodín a dos unidades distintas', () => {
    expect(() =>
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Celio' },
        { unidadOperativa: 'TRUCK STOP CAJA', empleado: ' celio ' },
      ]),
    ).toThrow('Un empleado no puede registrarse dos veces como comodín.');
  });
});
