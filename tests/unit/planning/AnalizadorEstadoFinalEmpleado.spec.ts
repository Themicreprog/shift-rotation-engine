import { describe, expect, it } from 'vitest';

import { AnalizadorEstadoFinalEmpleado } from '../../../src/application/planning/AnalizadorEstadoFinalEmpleado.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('AnalizadorEstadoFinalEmpleado', () => {
  const analizador = new AnalizadorEstadoFinalEmpleado();
  const unidad = UnidadOperativa.create({
    nombre: 'TRUCK STOP',
    empleados: [],
  });

  it('calcula la última asignación operativa válida cuando el cierre es LIBRE', () => {
    const empleado = Empleado.create({
      nombre: 'Joel',
      estadosPorDia: [
        EstadoTurno.create('Turno A'),
        EstadoTurno.create('Libre'),
      ],
    });

    const resumen = analizador.analyze(unidad, empleado);

    expect(resumen.ultimoEstadoRegistrado.valor).toBe('LIBRE');
    expect(resumen.ultimaAsignacionValida.valor).toBe('LIBRE');
    expect(resumen.ultimaAsignacionOperativaValida?.valor).toBe('TURNO A');
  });

  it('deja null cuando no existe asignación operativa previa', () => {
    const empleado = Empleado.create({
      nombre: 'Joel',
      estadosPorDia: [
        EstadoTurno.create('Libre'),
        EstadoTurno.create('Libre'),
      ],
    });

    const resumen = analizador.analyze(unidad, empleado);

    expect(resumen.ultimoEstadoRegistrado.valor).toBe('LIBRE');
    expect(resumen.ultimaAsignacionOperativaValida).toBeNull();
  });
});