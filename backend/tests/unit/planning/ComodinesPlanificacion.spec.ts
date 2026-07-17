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

  it('rechaza registrar el mismo comodín dos veces en la misma unidad', () => {
    expect(() =>
      ComodinesPlanificacion.create([
        { unidadOperativa: 'Caja', empleado: 'Celio' },
        { unidadOperativa: 'CAJA', empleado: 'celio' },
      ]),
    ).toThrow(
      'Un empleado no puede registrarse dos veces como comodín en la misma unidad.',
    );
  });

  it('rechaza empleados que no son comodines reales', () => {
    expect(() =>
      ComodinesPlanificacion.create([
        { unidadOperativa: 'CACAO CAJA', empleado: 'Rony' },
      ]),
    ).toThrow('El empleado Rony no está autorizado como comodín.');
  });

  it('permite que Celio esté disponible para varias unidades', () => {
    const comodines = ComodinesPlanificacion.create([
      { unidadOperativa: 'CACAO CAJA', empleado: 'Celio' },
      { unidadOperativa: 'TRUCK STOP CAJA', empleado: 'Celio' },
      { unidadOperativa: 'CACAO PISTA', empleado: 'Celio' },
    ]);

    expect(comodines.esComodin('CACAO CAJA', 'Celio')).toBe(true);
    expect(comodines.esComodin('TRUCK STOP CAJA', 'Celio')).toBe(true);
    expect(comodines.esComodin('CACAO PISTA', 'Celio')).toBe(true);
  });

  it('incluye las reglas automáticas de Celio y Lester sin selección manual', () => {
    const comodines = ComodinesPlanificacion.reglasOperativas();

    expect(comodines.esComodin('CACAO CAJA', 'Celio')).toBe(true);
    expect(comodines.esComodin('TRUCK STOP PISTA', 'Lester')).toBe(true);
  });
});
