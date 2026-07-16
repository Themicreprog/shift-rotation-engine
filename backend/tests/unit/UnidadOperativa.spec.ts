import { describe, expect, it } from 'vitest';

import { Empleado } from '../../src/domain/Empleado.js';
import { EstadoTurno } from '../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../src/domain/UnidadOperativa.js';

function crearEmpleado(nombre: string): Empleado {
  return Empleado.create({
    nombre,
    estadosPorDia: [EstadoTurno.create('LIBRE')],
  });
}

describe('UnidadOperativa', () => {
  it('rechaza el mismo empleado aunque cambien mayúsculas o espacios', () => {
    expect(() =>
      UnidadOperativa.create({
        nombre: 'CACAO PISTA',
        empleados: [crearEmpleado('Luis D'), crearEmpleado('luis  d')],
      }),
    ).toThrow('UnidadOperativa "CACAO PISTA" contiene empleados duplicados: luis  d.');
  });
});
