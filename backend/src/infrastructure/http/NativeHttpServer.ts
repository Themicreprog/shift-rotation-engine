import { createServer } from 'node:http';
import type {
  IncomingMessage,
  RequestListener,
  Server,
  ServerResponse,
} from 'node:http';

import { HttpApiError } from './HttpApiError.js';
import { PlanningApiService } from './PlanningApiService.js';
import type { PlanningApi } from './PlanningApiService.js';

const MAXIMO_BODY_PREDETERMINADO = 25 * 1024 * 1024;
const ORIGEN_CORS_PREDETERMINADO = 'http://localhost:5173';
const RUTAS_CONOCIDAS = new Set([
  '/api/health',
  '/api/calendarios/importar',
  '/api/planificaciones/generar',
  '/api/planificaciones/ajustar',
  '/api/planificaciones/exportar',
]);

export interface NativeHttpServerOptions {
  api?: PlanningApi;
  maxBodyBytes?: number;
  corsOrigin?: string;
}

interface HttpRuntimeOptions {
  api: PlanningApi;
  maxBodyBytes: number;
  corsOrigin: string;
}

export function createNativeHttpServer(
  options: NativeHttpServerOptions = {},
): Server {
  const runtimeOptions = resolverOpciones(options);
  const listener = createHttpRequestListener(runtimeOptions);

  return createServer(listener);
}

export function createHttpRequestListener(
  options: NativeHttpServerOptions = {},
): RequestListener {
  const runtimeOptions = resolverOpciones(options);

  return (request, response) => {
    void manejarSolicitud(request, response, runtimeOptions);
  };
}

async function manejarSolicitud(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpRuntimeOptions,
): Promise<void> {
  aplicarEncabezadosComunes(response, options.corsOrigin);

  try {
    const pathname = obtenerPathname(request);

    if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (pathname === '/api/health' && request.method === 'GET') {
      enviarJson(response, 200, {
        status: 'ok',
        servicio: 'fireschedule-backend',
      });
      return;
    }

    if (
      pathname === '/api/calendarios/importar' &&
      request.method === 'POST'
    ) {
      const input = await leerJson(request, options.maxBodyBytes);
      const resultado = await options.api.importarCalendario(input);
      enviarJson(response, 200, resultado);
      return;
    }

    if (
      pathname === '/api/planificaciones/generar' &&
      request.method === 'POST'
    ) {
      const input = await leerJson(request, options.maxBodyBytes);
      const resultado = await options.api.generarPlanificacion(input);
      enviarJson(
        response,
        resultado.conflictos.length > 0 ? 422 : 200,
        resultado,
      );
      return;
    }

    if (
      pathname === '/api/planificaciones/ajustar' &&
      request.method === 'POST'
    ) {
      const input = await leerJson(request, options.maxBodyBytes);
      const resultado = await options.api.ajustarPlanificacion(input);
      enviarJson(
        response,
        resultado.conflictos.length > 0 ? 422 : 200,
        resultado,
      );
      return;
    }

    if (
      pathname === '/api/planificaciones/exportar' &&
      request.method === 'POST'
    ) {
      const input = await leerJson(request, options.maxBodyBytes);
      const archivo = await options.api.exportarPlanificacion(input);
      enviarExcel(response, archivo.contenido, archivo.nombreArchivo);
      return;
    }

    if (RUTAS_CONOCIDAS.has(pathname)) {
      response.setHeader('Allow', pathname === '/api/health' ? 'GET' : 'POST');
      throw new HttpApiError(
        405,
        'METODO_NO_PERMITIDO',
        'El método HTTP no está permitido para esta ruta.',
      );
    }

    throw new HttpApiError(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.');
  } catch (error) {
    enviarError(response, error);
  }
}

async function leerJson(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';')[0]?.trim();

  if (contentType !== 'application/json') {
    throw new HttpApiError(
      415,
      'TIPO_DE_CONTENIDO_NO_SOPORTADO',
      'Content-Type debe ser application/json.',
    );
  }

  const contentLength = request.headers['content-length'];

  if (contentLength !== undefined) {
    const declarado = Number(contentLength);

    if (!Number.isFinite(declarado) || declarado < 0) {
      throw new HttpApiError(
        400,
        'CONTENT_LENGTH_INVALIDO',
        'Content-Length no es válido.',
      );
    }

    if (declarado > maxBodyBytes) {
      throw bodyDemasiadoGrande(maxBodyBytes);
    }
  }

  const fragmentos: Buffer[] = [];
  let total = 0;

  for await (const fragmento of request) {
    const buffer = Buffer.isBuffer(fragmento)
      ? fragmento
      : Buffer.from(fragmento as Uint8Array);
    total += buffer.length;

    if (total > maxBodyBytes) {
      request.resume();
      throw bodyDemasiadoGrande(maxBodyBytes);
    }

    fragmentos.push(buffer);
  }

  if (total === 0) {
    throw new HttpApiError(
      400,
      'JSON_REQUERIDO',
      'La solicitud debe incluir un cuerpo JSON.',
    );
  }

  const texto = Buffer.concat(fragmentos).toString('utf8').replace(/^\uFEFF/, '');

  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new HttpApiError(400, 'JSON_INVALIDO', 'El cuerpo JSON no es válido.');
  }
}

function enviarJson(
  response: ServerResponse,
  statusCode: number,
  contenido: unknown,
): void {
  const body = Buffer.from(JSON.stringify(contenido), 'utf8');
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', body.length);
  response.end(body);
}

function enviarExcel(
  response: ServerResponse,
  contenido: Buffer,
  nombreArchivo: string,
): void {
  response.statusCode = 200;
  response.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${nombreArchivo}"`,
  );
  response.setHeader('Content-Length', contenido.length);
  response.end(contenido);
}

function enviarError(response: ServerResponse, error: unknown): void {
  if (response.writableEnded) return;

  if (error instanceof HttpApiError) {
    enviarJson(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  enviarJson(response, 500, {
    error: {
      code: 'ERROR_INTERNO',
      message: 'Ocurrió un error interno en el servidor.',
    },
  });
}

function aplicarEncabezadosComunes(
  response: ServerResponse,
  corsOrigin: string,
): void {
  response.setHeader('Access-Control-Allow-Origin', corsOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Vary', 'Origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function obtenerPathname(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    throw new HttpApiError(400, 'URL_INVALIDA', 'La URL solicitada no es válida.');
  }
}

function bodyDemasiadoGrande(maxBodyBytes: number): HttpApiError {
  return new HttpApiError(
    413,
    'SOLICITUD_DEMASIADO_GRANDE',
    `El cuerpo supera el límite de ${maxBodyBytes} bytes.`,
  );
}

function resolverOpciones(
  options: NativeHttpServerOptions,
): HttpRuntimeOptions {
  const maxBodyBytes =
    options.maxBodyBytes ??
    leerEnteroPositivoDesdeEntorno(
      'FIRESCHEDULE_MAX_BODY_BYTES',
      MAXIMO_BODY_PREDETERMINADO,
    );
  const corsOrigin =
    options.corsOrigin ??
    process.env['FIRESCHEDULE_CORS_ORIGIN']?.trim() ??
    ORIGEN_CORS_PREDETERMINADO;

  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new Error('maxBodyBytes debe ser un entero mayor que cero.');
  }

  if (corsOrigin.length === 0) {
    throw new Error('corsOrigin no puede estar vacío.');
  }

  return {
    api: options.api ?? new PlanningApiService(),
    maxBodyBytes,
    corsOrigin,
  };
}

function leerEnteroPositivoDesdeEntorno(
  nombre: string,
  predeterminado: number,
): number {
  const valor = process.env[nombre]?.trim();

  if (valor === undefined || valor.length === 0) return predeterminado;

  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`${nombre} debe ser un entero mayor que cero.`);
  }

  return numero;
}
