import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PlanningApiService } from '../../src/infrastructure/http/PlanningApiService.js';
import type {
  CalendarioDto,
  ImportarCalendarioResponseDto,
} from '../../src/infrastructure/http/dtos.js';

const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('continuidad mensual desde Excel real', () => {
  it.each([
    {
      archivo: 'TURNOS-PISTA-Y-CAJA-JUNIO-2026.xlsx',
      mesOrigen: 6,
      mesDestino: 7,
      ultimaFecha: '2026-07-05',
      diasContinuidad: 5,
      totalDiasImportados: 35,
    },
    {
      archivo: 'turnos-de-julio-pero-limpios-3.xlsx',
      mesOrigen: 7,
      mesDestino: 8,
      ultimaFecha: '2026-08-02',
      diasContinuidad: 2,
      totalDiasImportados: 33,
    },
  ])(
    'detecta el derrame del mes siguiente en $archivo',
    async ({
      archivo,
      mesOrigen,
      mesDestino,
      ultimaFecha,
      diasContinuidad,
      totalDiasImportados,
    }) => {
      const importado = await importarFixture(archivo);

      expect(importado.resumen).toMatchObject({
        periodoOrigen: { mes: mesOrigen, anio: 2026 },
        ultimaFechaDetectada: ultimaFecha,
        diasContinuidad,
        periodoDestinoSugerido: { mes: mesDestino, anio: 2026 },
      });
      expect(importado.calendario.periodoOrigen).toEqual({
        mes: mesOrigen,
        anio: 2026,
        fechaInicio: `2026-${String(mesOrigen).padStart(2, '0')}-01`,
        fechaFin: ultimaFecha,
      });

      for (const unidad of importado.calendario.unidadesOperativas) {
        for (const empleado of unidad.empleados) {
          expect(empleado.estadosPorDia).toHaveLength(totalDiasImportados);
        }
      }
    },
  );

  it.each([
    {
      archivo: 'TURNOS-PISTA-Y-CAJA-JUNIO-2026.xlsx',
      mesDestino: 7,
      diasMesOrigen: 30,
      diasHeredados: 5,
    },
    {
      archivo: 'turnos-de-julio-pero-limpios-3.xlsx',
      mesDestino: 8,
      diasMesOrigen: 31,
      diasHeredados: 2,
    },
  ])(
    'conserva el prefijo confirmado y genera desde el día siguiente en $archivo',
    async ({ archivo, mesDestino, diasMesOrigen, diasHeredados }) => {
      const api = new PlanningApiService();
      const importado = await importarFixture(archivo, api);
      const resultado = await api.generarPlanificacion({
        calendarioOrigen: importado.calendario,
        mes: mesDestino,
        anio: 2026,
      });

      expect(resultado.conflictos).toEqual([]);

      for (const unidadDestino of resultado.calendario.unidadesOperativas) {
        const unidadOrigen = importado.calendario.unidadesOperativas.find(
          (unidad) => unidad.nombre === unidadDestino.nombre,
        );

        expect(unidadOrigen).toBeDefined();

        for (const empleadoDestino of unidadDestino.empleados) {
          expect(empleadoDestino.estadosPorDia).toHaveLength(
            new Date(2026, mesDestino, 0).getDate(),
          );
          const empleadoOrigen = unidadOrigen?.empleados.find(
            (empleado) => empleado.nombre === empleadoDestino.nombre,
          );

          if (empleadoOrigen === undefined) {
            continue;
          }

          expect(
            empleadoDestino.estadosPorDia.slice(0, diasHeredados),
          ).toEqual(
            empleadoOrigen.estadosPorDia.slice(
              diasMesOrigen,
              diasMesOrigen + diasHeredados,
            ),
          );
        }
      }

      expect(
        resultado.reemplazos.every(
          (reemplazo) => reemplazo.dia > diasHeredados,
        ),
      ).toBe(true);
    },
  );

  it('respeta las asignaciones activas y no las versiones atenuadas del 1 de agosto', async () => {
    const api = new PlanningApiService();
    const importado = await importarFixture(
      'turnos-de-julio-pero-limpios-3.xlsx',
      api,
    );
    const resultado = await api.generarPlanificacion({
      calendarioOrigen: importado.calendario,
      mes: 8,
      anio: 2026,
    });

    expect(estadoDe(resultado.calendario, 'CACAO C1', 'Julio', 1)).toBe(
      'TURNO A',
    );
    expect(estadoDe(resultado.calendario, 'CACAO C1', 'Lester', 1)).toBe(
      'TURNO A',
    );
    expect(estadoDe(resultado.calendario, 'CACAO C1', 'Mario', 1)).toBe(
      'TURNO B',
    );
    expect(
      estadoDe(resultado.calendario, 'CAJA TRUCK STOP', 'Norlan', 1),
    ).toBe('FERIADO');
    expect(
      estadoDe(resultado.calendario, 'CAJA TRUCK STOP', 'Derlin', 1),
    ).toBe('LIBRE');
    expect(
      estadoDe(resultado.calendario, 'CAJA TRUCK STOP', 'Jeferson', 1),
    ).toBe('TURNO B');
    expect(resultado.advertencias).toContainEqual(
      expect.stringContaining(
        'Asignación simultánea no permitida para Jeferson: día 1 en TRUCK STOP y CAJA TRUCK STOP',
      ),
    );

    for (const [empleado, unidadBase, unidadCaja] of [
      ['Edwin', 'CACAO C1', 'CAJA CACAO'],
      ['Jeferson', 'TRUCK STOP', 'CAJA TRUCK STOP'],
    ] as const) {
      for (let dia = 3; dia <= 31; dia += 1) {
        const trabajaBase = esTurnoOperativo(
          estadoDe(resultado.calendario, unidadBase, empleado, dia),
        );
        const trabajaCaja = esTurnoOperativo(
          estadoDe(resultado.calendario, unidadCaja, empleado, dia),
        );

        expect(trabajaBase && trabajaCaja).toBe(false);
      }
    }
  });

  it('rechaza eventos que intentan sobrescribir los días ya confirmados', async () => {
    const api = new PlanningApiService();
    const importado = await importarFixture(
      'turnos-de-julio-pero-limpios-3.xlsx',
      api,
    );
    const resultado = await api.generarPlanificacion({
      calendarioOrigen: importado.calendario,
      mes: 8,
      anio: 2026,
      eventos: [
        {
          empleado: 'Julio',
          unidadOperativa: 'CACAO C1',
          tipo: 'VACACIONES',
          fechaInicio: '2026-08-01',
          fechaFin: '2026-08-03',
        },
      ],
    });

    expect(resultado.exportable).toBe(false);
    expect(resultado.conflictos).toContainEqual(
      expect.stringContaining('días ya confirmados hasta 2026-08-02'),
    );
  });
});

async function importarFixture(
  archivo: string,
  api = new PlanningApiService(),
): Promise<ImportarCalendarioResponseDto> {
  const contenido = await readFile(path.join(fixturesDir, archivo));

  return api.importarCalendario({
    nombreArchivo: archivo,
    contenidoBase64: contenido.toString('base64'),
  });
}

function estadoDe(
  calendario: CalendarioDto,
  unidad: string,
  empleado: string,
  dia: number,
): string | undefined {
  return calendario.unidadesOperativas
    .find((candidata) => candidata.nombre === unidad)
    ?.empleados.find((candidato) => candidato.nombre === empleado)
    ?.estadosPorDia.at(dia - 1);
}

function esTurnoOperativo(estado: string | undefined): boolean {
  return estado === 'TURNO A' || estado === 'TURNO B';
}
