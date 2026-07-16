import { describe, expect, it } from 'vitest';

import { EventoPlanificacion } from '../../../src/domain/planning/EventoPlanificacion.js';
import { EventosPlanificacion } from '../../../src/domain/planning/EventosPlanificacion.js';
import { TipoEventoPlanificacion } from '../../../src/domain/planning/TipoEventoPlanificacion.js';

describe('EventosPlanificacion', () => {
  const vacaciones = EventoPlanificacion.create({
    empleado: '  Rony  ',
    tipo: TipoEventoPlanificacion.VACACIONES,
    fechaInicio: new Date('2026-07-03T00:00:00.000Z'),
    fechaFin: new Date('2026-07-05T00:00:00.000Z'),
  });

  const feriado = EventoPlanificacion.create({
    empleado: 'Joel',
    tipo: TipoEventoPlanificacion.FERIADO,
    fechaInicio: new Date('2026-07-04T00:00:00.000Z'),
    fechaFin: new Date('2026-07-04T00:00:00.000Z'),
  });

  it('encapsula, busca y consulta eventos activos', () => {
    const eventos = EventosPlanificacion.create([vacaciones, feriado]);

    expect(vacaciones.unidadOperativa).toBeNull();
    expect(eventos.listar()).toEqual([vacaciones, feriado]);
    expect(eventos.buscarPorEmpleado('rony')).toEqual([vacaciones]);
    expect(eventos.activosEn(new Date('2026-07-04T12:00:00.000Z'))).toEqual([
      vacaciones,
      feriado,
    ]);
    expect(
      eventos.activosParaEmpleadoEn('RONY', new Date('2026-07-04T00:00:00.000Z')),
    ).toEqual([vacaciones]);
  });

  it('conserva la unidad y filtra sin dejar de aplicar eventos sin unidad', () => {
    const vacacionesCacao = EventoPlanificacion.create({
      empleado: 'Rony',
      unidadOperativa: '  CACAO CAJA  ',
      tipo: TipoEventoPlanificacion.VACACIONES,
      fechaInicio: new Date('2026-07-04T00:00:00.000Z'),
      fechaFin: new Date('2026-07-04T00:00:00.000Z'),
    });
    const vacacionesTruckStop = EventoPlanificacion.create({
      empleado: 'Rony',
      unidadOperativa: 'TRUCK STOP CAJA',
      tipo: TipoEventoPlanificacion.VACACIONES,
      fechaInicio: new Date('2026-07-04T00:00:00.000Z'),
      fechaFin: new Date('2026-07-04T00:00:00.000Z'),
    });
    const eventos = EventosPlanificacion.create([
      vacaciones,
      vacacionesCacao,
      vacacionesTruckStop,
    ]);

    expect(vacacionesCacao.unidadOperativa).toBe('CACAO CAJA');
    expect(eventos.buscarPorEmpleado('rony', 'cacao caja')).toEqual([
      vacaciones,
      vacacionesCacao,
    ]);
    expect(
      eventos.activosParaEmpleadoEn(
        'RONY',
        new Date('2026-07-04T00:00:00.000Z'),
        'TRUCK STOP CAJA',
      ),
    ).toEqual([vacaciones, vacacionesTruckStop]);
  });

  it('detecta solapamientos solo entre eventos del mismo empleado', () => {
    const vacacionesAdicionales = EventoPlanificacion.create({
      empleado: 'Rony',
      tipo: TipoEventoPlanificacion.FERIADO,
      fechaInicio: new Date('2026-07-05T00:00:00.000Z'),
      fechaFin: new Date('2026-07-05T00:00:00.000Z'),
    });

    const eventos = EventosPlanificacion.create([
      vacaciones,
      vacacionesAdicionales,
      feriado,
    ]);

    expect(eventos.tieneSolapamientos()).toBe(true);
    expect(eventos.solapamientos()).toHaveLength(1);
  });

  it('no considera solapados eventos del mismo nombre en unidades distintas', () => {
    const eventoCacao = EventoPlanificacion.create({
      empleado: 'Carlos',
      unidadOperativa: 'CACAO PISTA',
      tipo: TipoEventoPlanificacion.VACACIONES,
      fechaInicio: new Date('2026-07-05T00:00:00.000Z'),
      fechaFin: new Date('2026-07-07T00:00:00.000Z'),
    });
    const eventoTruckStop = EventoPlanificacion.create({
      empleado: 'Carlos',
      unidadOperativa: 'TRUCK STOP PISTA',
      tipo: TipoEventoPlanificacion.FERIADO,
      fechaInicio: new Date('2026-07-06T00:00:00.000Z'),
      fechaFin: new Date('2026-07-06T00:00:00.000Z'),
    });
    const eventos = EventosPlanificacion.create([eventoCacao, eventoTruckStop]);

    expect(eventos.tieneSolapamientos()).toBe(false);
    expect(eventos.solapamientos()).toEqual([]);
  });

  it('rechaza intervalos de fechas inválidos', () => {
    expect(() =>
      EventoPlanificacion.create({
        empleado: 'Rony',
        tipo: TipoEventoPlanificacion.VACACIONES,
        fechaInicio: new Date('2026-07-06T00:00:00.000Z'),
        fechaFin: new Date('2026-07-05T00:00:00.000Z'),
      }),
    ).toThrow('EventoPlanificacion.fechaFin no puede ser menor que fechaInicio.');
  });
});
