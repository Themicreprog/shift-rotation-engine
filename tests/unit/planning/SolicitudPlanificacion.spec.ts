import { describe, expect, it } from 'vitest';

import { SolicitudPlanificacion } from '../../../src/application/planning/SolicitudPlanificacion.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { AlcanceOperativo } from '../../../src/domain/planning/AlcanceOperativo.js';
import { PeriodoPlanificacion } from '../../../src/domain/planning/PeriodoPlanificacion.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

describe('SolicitudPlanificacion', () => {
  it('agrupa el calendario origen, el período destino y el alcance operativo', () => {
    const calendario = new Calendario('Junio 2026');
    const unidad = UnidadOperativa.create({
      nombre: 'CACAO',
      empleados: [
        Empleado.create({
          nombre: 'Rony',
          estadosPorDia: [EstadoTurno.create('Turno A')],
        }),
      ],
    });
    calendario.agregarUnidadOperativa(unidad);

    const periodo = PeriodoPlanificacion.create({
      fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
      fechaFin: new Date('2026-07-31T00:00:00.000Z'),
    });

    const alcance = AlcanceOperativo.create({
      unidadesOperativas: ['CACAO'],
    });

    const solicitud = new SolicitudPlanificacion(calendario, periodo, alcance);

    expect(solicitud.calendarioOrigen).toBe(calendario);
    expect(solicitud.periodoDestino).toBe(periodo);
    expect(solicitud.alcanceOperativo).toBe(alcance);
  });
});