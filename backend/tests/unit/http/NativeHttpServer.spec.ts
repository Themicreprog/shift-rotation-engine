import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNativeHttpServer } from '../../../src/infrastructure/http/NativeHttpServer.js';
import { PlanningApiService } from '../../../src/infrastructure/http/PlanningApiService.js';
import type { PlanningApi } from '../../../src/infrastructure/http/PlanningApiService.js';
import type { ResultadoAjusteManualDto } from '../../../src/infrastructure/http/dtos.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});

describe('API HTTP nativa', () => {
  it('expone health y encabezados CORS', async () => {
    const baseUrl = await iniciarServidor(crearApiFalsa());
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      servicio: 'fireschedule-backend',
    });
  });

  it('enruta importación, conflictos de planificación y descarga XLSX', async () => {
    const baseUrl = await iniciarServidor(crearApiFalsa());
    const importar = await fetch(`${baseUrl}/api/calendarios/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contenidoBase64: 'UEs=' }),
    });

    expect(importar.status).toBe(200);
    expect(await importar.json()).toMatchObject({
      calendario: { nombre: 'Importado' },
    });

    const generar = await fetch(`${baseUrl}/api/planificaciones/generar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solicitud: true }),
    });

    expect(generar.status).toBe(422);
    expect(await generar.json()).toMatchObject({
      conflictos: ['Conflicto de prueba'],
      exportable: false,
    });

    const exportar = await fetch(`${baseUrl}/api/planificaciones/exportar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendario: true }),
    });
    const contenido = Buffer.from(await exportar.arrayBuffer());

    expect(exportar.status).toBe(200);
    expect(exportar.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(exportar.headers.get('content-disposition')).toContain(
      'turnos-2026-08.xlsx',
    );
    expect(contenido.subarray(0, 2).toString()).toBe('PK');
  });

  it('rechaza JSON mal formado y métodos no permitidos', async () => {
    const baseUrl = await iniciarServidor(crearApiFalsa());
    const jsonInvalido = await fetch(`${baseUrl}/api/calendarios/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    const metodoInvalido = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(jsonInvalido.status).toBe(400);
    expect(await jsonInvalido.json()).toEqual({
      error: {
        code: 'JSON_INVALIDO',
        message: 'El cuerpo JSON no es válido.',
      },
    });
    expect(metodoInvalido.status).toBe(405);
    expect(metodoInvalido.headers.get('allow')).toBe('GET');
  });
});

describe('composición HTTP con el motor real', () => {
  it('importa Base64 y exporta un XLSX usando la plantilla del servidor', async () => {
    const api = new PlanningApiService();
    const rutaFixture = path.resolve(
      __dirname,
      '../../fixtures/turnos-de-julio-pero-limpios-3.xlsx',
    );
    const archivo = await readFile(rutaFixture);
    const importado = await api.importarCalendario({
      nombreArchivo: 'turnos-julio.xlsx',
      contenidoBase64: archivo.toString('base64'),
    });

    expect(importado.resumen.unidadesOperativas).toBe(4);
    expect(importado.resumen.empleados).toBeGreaterThan(0);
    expect(
      importado.calendario.unidadesOperativas
        .map(({ nombre }) => nombre)
        .sort(),
    ).toEqual(
      ['CACAO C1', 'CAJA CACAO', 'CAJA TRUCK STOP', 'TRUCK STOP'].sort(),
    );
    expect(JSON.stringify(importado)).not.toContain('PISTA');

    const unidadConTurno = importado.calendario.unidadesOperativas.find(
      (unidad) =>
        unidad.empleados.some((empleado) =>
          empleado.estadosPorDia.some(
            (estado) => estado === 'TURNO A' || estado === 'TURNO B',
          ),
        ),
    );
    const empleadoConTurno = unidadConTurno?.empleados.find((empleado) =>
      empleado.estadosPorDia.some(
        (estado) => estado === 'TURNO A' || estado === 'TURNO B',
      ),
    );
    const indiceTurno = empleadoConTurno?.estadosPorDia.findIndex(
      (estado) => estado === 'TURNO A' || estado === 'TURNO B',
    );

    if (
      unidadConTurno === undefined ||
      empleadoConTurno === undefined ||
      indiceTurno === undefined ||
      indiceTurno < 0
    ) {
      throw new Error('El fixture debe contener al menos una asignación operativa.');
    }

    const turno = empleadoConTurno.estadosPorDia[indiceTurno];

    if (turno !== 'TURNO A' && turno !== 'TURNO B') {
      throw new Error('La asignación seleccionada debe ser operativa.');
    }

    const exportado = await api.exportarPlanificacion({
      calendario: importado.calendario,
      mes: 7,
      anio: 2026,
      reemplazos: [
        {
          unidadOperativa: unidadConTurno.nombre,
          dia: indiceTurno + 1,
          turno,
          empleadoTitular: null,
          empleadoReemplazo: empleadoConTurno.nombre,
          tipoCobertura: 'BASE',
          motivo: 'FALTANTE',
        },
      ],
    });

    expect(exportado.nombreArchivo).toBe('turnos-2026-07.xlsx');
    expect(exportado.contenido.subarray(0, 2).toString()).toBe('PK');
  });

  it('convierte DTOs estrictos y genera el mes completo', async () => {
    const api = new PlanningApiService();
    const resultado = await api.generarPlanificacion({
      calendarioOrigen: {
        nombre: 'Junio 2026',
        unidadesOperativas: [
          {
            nombre: 'CACAO',
            empleados: [
              {
                nombre: 'Rony',
                estadosPorDia: ['TURNO A'],
              },
            ],
          },
        ],
      },
      mes: 7,
      anio: 2026,
    });

    expect(resultado.conflictos).toEqual([]);
    expect(Array.isArray(resultado.reemplazos)).toBe(true);
    expect(resultado.calendario.unidadesOperativas[0]?.empleados[0]?.estadosPorDia).toHaveLength(
      33,
    );
  });

  it('rechaza campos desconocidos y fechas ambiguas', async () => {
    const api = new PlanningApiService();
    const calendarioOrigen = {
      nombre: 'Junio 2026',
      unidadesOperativas: [
        {
          nombre: 'CACAO',
          empleados: [
            { nombre: 'Mario', estadosPorDia: ['TURNO A'] },
          ],
        },
      ],
    };

    await expect(
      api.generarPlanificacion({
        calendarioOrigen,
        mes: 7,
        anio: 2026,
        campoInventado: true,
      }),
    ).rejects.toMatchObject({ code: 'SOLICITUD_INVALIDA' });

    await expect(
      api.generarPlanificacion({
        calendarioOrigen,
        mes: 7,
        anio: 2026,
        eventos: [
          {
            empleado: 'Mario',
            tipo: 'FERIADO',
            fechaInicio: '07/10/2026',
            fechaFin: '07/10/2026',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SOLICITUD_INVALIDA' });
  });
});

describe('ajustes manuales por HTTP', () => {
  it('aplica una sustitución y devuelve historial y reemplazo exportable', async () => {
    const baseUrl = await iniciarServidor(new PlanningApiService());
    const response = await solicitarAjuste(baseUrl, {
      accion: 'APLICAR',
      calendario: crearCalendarioEditableDto(),
      historial: [],
      unidadOperativa: 'CACAO C1',
      dia: 2,
      titular: 'Mario',
      reemplazo: 'Jose',
    });
    const resultado = (await response.json()) as ResultadoAjusteManualDto;

    expect(response.status).toBe(200);
    expect(estadoDto(resultado, 'Mario', 2)).toBe('LIBRE');
    expect(estadoDto(resultado, 'Jose', 2)).toBe('TURNO A');
    expect(resultado.historial).toHaveLength(1);
    expect(resultado.calendario.unidadesOperativas[0]?.nombre).toBe('CACAO C1');
    expect(resultado.ajuste).toMatchObject({
      tipo: 'SUSTITUCION',
      unidadOperativa: 'CACAO C1',
      titularOriginal: 'Mario',
      titular: 'Mario',
      reemplazo: 'Jose',
      estado: 'APLICADO',
    });
    expect(resultado.reemplazos).toEqual([
      expect.objectContaining({
        unidadOperativa: 'CACAO C1',
        empleadoTitular: 'Mario',
        empleadoReemplazo: 'Jose',
        tipoCobertura: 'MANUAL',
        motivo: 'AJUSTE_MANUAL',
      }),
    ]);
    expect(JSON.stringify(resultado)).not.toContain('PISTA');
  });

  it('deshace el último ajuste usando el calendario e historial devueltos', async () => {
    const baseUrl = await iniciarServidor(new PlanningApiService());
    const aplicar = await solicitarAjuste(baseUrl, {
      accion: 'APLICAR',
      calendario: crearCalendarioEditableDto(),
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 2,
      titular: 'Mario',
      reemplazo: 'Jose',
    });
    const aplicado = (await aplicar.json()) as ResultadoAjusteManualDto;
    const deshacer = await solicitarAjuste(baseUrl, {
      accion: 'DESHACER',
      calendario: aplicado.calendario,
      historial: aplicado.historial,
    });
    const resultado = (await deshacer.json()) as ResultadoAjusteManualDto;

    expect(deshacer.status).toBe(200);
    expect(estadoDto(resultado, 'Mario', 2)).toBe('TURNO A');
    expect(estadoDto(resultado, 'Jose', 2)).toBe('LIBRE');
    expect(resultado.historial[0]?.estado).toBe('DESHECHO');
    expect(resultado.ajuste?.estado).toBe('DESHECHO');
    expect(resultado.reemplazos).toEqual([]);
  });

  it('responde 422 y no altera el calendario cuando el reemplazo no existe', async () => {
    const baseUrl = await iniciarServidor(new PlanningApiService());
    const response = await solicitarAjuste(baseUrl, {
      accion: 'APLICAR',
      calendario: crearCalendarioEditableDto(),
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 2,
      titular: 'Mario',
      reemplazo: 'Persona inexistente',
    });
    const resultado = (await response.json()) as ResultadoAjusteManualDto;

    expect(response.status).toBe(422);
    expect(resultado.ajuste).toBeNull();
    expect(resultado.historial).toEqual([]);
    expect(resultado.reemplazos).toEqual([]);
    expect(resultado.conflictos).toEqual([
      expect.stringContaining('no pertenece a CACAO C1'),
    ]);
    expect(estadoDto(resultado, 'Mario', 2)).toBe('TURNO A');
  });

  it('rechaza un historial alterado que no coincide con sus movimientos', async () => {
    const baseUrl = await iniciarServidor(new PlanningApiService());
    const aplicar = await solicitarAjuste(baseUrl, {
      accion: 'APLICAR',
      calendario: crearCalendarioEditableDto(),
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 2,
      titular: 'Mario',
      reemplazo: 'Jose',
    });
    const aplicado = (await aplicar.json()) as ResultadoAjusteManualDto;
    const historialAlterado = aplicado.historial.map((ajuste) => ({
      ...ajuste,
      tipo: 'INTERCAMBIO',
    }));
    const response = await solicitarAjuste(baseUrl, {
      accion: 'DESHACER',
      calendario: aplicado.calendario,
      historial: historialAlterado,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'SOLICITUD_INVALIDA',
        message: expect.stringContaining('datos derivados'),
      },
    });
  });
});

async function iniciarServidor(api: PlanningApi): Promise<string> {
  const server = createNativeHttpServer({
    api,
    corsOrigin: '*',
    maxBodyBytes: 1024 * 1024,
  });
  servers.push(server);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function crearApiFalsa(): PlanningApi {
  return {
    async importarCalendario() {
      return {
        calendario: {
          nombre: 'Importado',
          unidadesOperativas: [],
        },
        resumen: {
          unidadesOperativas: 0,
          empleados: 0,
          periodoOrigen: null,
          ultimaFechaDetectada: null,
          diasContinuidad: 0,
          periodoDestinoSugerido: null,
        },
      };
    },
    async generarPlanificacion() {
      return {
        calendario: {
          nombre: 'Propuesta',
          unidadesOperativas: [],
        },
        cambios: [],
        advertencias: [],
        conflictos: ['Conflicto de prueba'],
        reemplazos: [],
        exportable: false,
      };
    },
    async ajustarPlanificacion() {
      return {
        calendario: {
          nombre: 'Ajustado',
          unidadesOperativas: [],
        },
        historial: [],
        ajuste: null,
        conflictos: [],
        reemplazos: [],
      };
    },
    async exportarPlanificacion() {
      return {
        contenido: Buffer.from('PK-archivo-de-prueba'),
        nombreArchivo: 'turnos-2026-08.xlsx',
      };
    },
  };
}

async function solicitarAjuste(
  baseUrl: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}/api/planificaciones/ajustar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function crearCalendarioEditableDto() {
  return {
    nombre: 'Planificación editable',
    unidadesOperativas: [
      {
        nombre: 'CACAO PISTA',
        empleados: [
          {
            nombre: 'Mario',
            estadosPorDia: ['LIBRE', 'TURNO A', 'LIBRE'],
          },
          {
            nombre: 'Jose',
            estadosPorDia: ['LIBRE', 'LIBRE', 'LIBRE'],
          },
        ],
      },
    ],
  };
}

function estadoDto(
  resultado: ResultadoAjusteManualDto,
  empleado: string,
  dia: number,
): string | undefined {
  return resultado.calendario.unidadesOperativas[0]?.empleados
    .find((candidato) => candidato.nombre === empleado)
    ?.estadosPorDia[dia - 1];
}