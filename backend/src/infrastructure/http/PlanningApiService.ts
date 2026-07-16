import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AnalizadorEstadoFinalCalendario } from '../../application/planning/AnalizadorEstadoFinalCalendario.js';
import { AnalizadorEstadoFinalEmpleado } from '../../application/planning/AnalizadorEstadoFinalEmpleado.js';
import { AjustarAsignacionManualUseCase } from '../../application/planning/AjustarAsignacionManualUseCase.js';
import { convertirAjustesManualesAReemplazos } from '../../application/planning/convertirAjustesManualesAReemplazos.js';
import { DecisorPrimerDiaContinuidadSimple } from '../../application/planning/DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from '../../application/planning/DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from '../../application/planning/GeneradorRotacionSemanal.js';
import { GeneratePlanningProposalUseCase } from '../../application/planning/GeneratePlanningProposalUseCase.js';
import { PlanificacionInputValidator } from '../../application/planning/PlanificacionInputValidator.js';
import { PlanificadorUnidadOperativa } from '../../application/planning/PlanificadorUnidadOperativa.js';
import { PlanningEngine } from '../../application/planning/PlanningEngine.js';
import { ValidadorCobertura } from '../../application/planning/ValidadorCobertura.js';
import { ExcelCalendarioReader } from '../excel/ExcelCalendarioReader.js';
import { ExcelCalendarioWriter } from '../excel/ExcelCalendarioWriter.js';
import { HttpApiError } from './HttpApiError.js';
import { PlanningHttpMapper } from './PlanningHttpMapper.js';
import type {
  ImportarCalendarioResponseDto,
  ResultadoAjusteManualDto,
  ResultadoPlanificacionDto,
} from './dtos.js';

const DIRECTORIO_BACKEND = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const RUTA_PLANTILLA_PREDETERMINADA = path.join(
  DIRECTORIO_BACKEND,
  'assets',
  'plantilla-turnos.xlsx',
);
const MAXIMO_EXCEL_BYTES_PREDETERMINADO = 15 * 1024 * 1024;

export interface ExportacionExcelApi {
  contenido: Buffer;
  nombreArchivo: string;
}

export interface PlanningApi {
  importarCalendario(input: unknown): Promise<ImportarCalendarioResponseDto>;
  generarPlanificacion(input: unknown): Promise<ResultadoPlanificacionDto>;
  ajustarPlanificacion(input: unknown): Promise<ResultadoAjusteManualDto>;
  exportarPlanificacion(input: unknown): Promise<ExportacionExcelApi>;
}

export interface PlanningApiServiceOptions {
  reader?: ExcelCalendarioReader;
  writer?: ExcelCalendarioWriter;
  useCase?: GeneratePlanningProposalUseCase;
  ajustarUseCase?: AjustarAsignacionManualUseCase;
  mapper?: PlanningHttpMapper;
  templatePath?: string;
  maxExcelBytes?: number;
  temporaryDirectory?: string;
}

export class PlanningApiService implements PlanningApi {
  private readonly reader: ExcelCalendarioReader;
  private readonly writer: ExcelCalendarioWriter;
  private readonly useCase: GeneratePlanningProposalUseCase;
  private readonly ajustarUseCase: AjustarAsignacionManualUseCase;
  private readonly mapper: PlanningHttpMapper;
  private readonly templatePath: string;
  private readonly maxExcelBytes: number;
  private readonly temporaryDirectory: string;

  public constructor(options: PlanningApiServiceOptions = {}) {
    this.reader = options.reader ?? new ExcelCalendarioReader();
    this.writer = options.writer ?? new ExcelCalendarioWriter();
    this.useCase = options.useCase ?? crearCasoDeUsoPlanificacion();
    this.ajustarUseCase =
      options.ajustarUseCase ?? new AjustarAsignacionManualUseCase();
    this.mapper = options.mapper ?? new PlanningHttpMapper();
    this.templatePath =
      options.templatePath ?? resolverRutaPlantillaDesdeEntorno();
    this.maxExcelBytes =
      options.maxExcelBytes ?? MAXIMO_EXCEL_BYTES_PREDETERMINADO;
    this.temporaryDirectory = options.temporaryDirectory ?? tmpdir();

    if (!Number.isInteger(this.maxExcelBytes) || this.maxExcelBytes <= 0) {
      throw new Error('maxExcelBytes debe ser un entero mayor que cero.');
    }
  }

  public async importarCalendario(
    input: unknown,
  ): Promise<ImportarCalendarioResponseDto> {
    const archivo = this.mapper.parseImportarCalendario(
      input,
      this.maxExcelBytes,
    );
    const rutaTemporal = path.join(
      this.temporaryDirectory,
      `fireschedule-${randomUUID()}.xlsx`,
    );

    await writeFile(rutaTemporal, archivo.contenido, { flag: 'wx' });

    try {
      let calendario;

      try {
        calendario = await this.reader.leerCalendario(rutaTemporal);
      } catch (error) {
        console.error('No fue posible procesar el calendario Excel:', error);
        throw new HttpApiError(
          422,
          'EXCEL_NO_PROCESABLE',
          'El archivo no tiene un formato de calendario compatible.',
        );
      }

      if (calendario.unidadesOperativas.length === 0) {
        throw new HttpApiError(
          422,
          'EXCEL_SIN_UNIDADES',
          'El archivo no contiene unidades operativas reconocibles.',
        );
      }

      const periodoOrigen = calendario.obtenerPeriodoOrigen();
      const periodoDestinoSugerido =
        periodoOrigen === null
          ? null
          : periodoOrigen.mes === 12
            ? { mes: 1, anio: periodoOrigen.anio + 1 }
            : { mes: periodoOrigen.mes + 1, anio: periodoOrigen.anio };
      const finMesOrigen =
        periodoOrigen === null
          ? null
          : new Date(
              Date.UTC(periodoOrigen.anio, periodoOrigen.mes, 0),
            );
      const diasContinuidad =
        periodoOrigen === null || finMesOrigen === null
          ? 0
          : Math.max(
              0,
              Math.round(
                (periodoOrigen.fechaFin.getTime() - finMesOrigen.getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
            );

      return {
        calendario: this.mapper.calendarioToDto(calendario),
        resumen: {
          unidadesOperativas: calendario.unidadesOperativas.length,
          empleados: calendario.unidadesOperativas.reduce(
            (total, unidad) => total + unidad.cantidadEmpleados(),
            0,
          ),
          periodoOrigen:
            periodoOrigen === null
              ? null
              : { mes: periodoOrigen.mes, anio: periodoOrigen.anio },
          ultimaFechaDetectada:
            periodoOrigen?.fechaFin.toISOString().slice(0, 10) ?? null,
          diasContinuidad,
          periodoDestinoSugerido,
        },
      };
    } finally {
      await unlink(rutaTemporal).catch(() => undefined);
    }
  }

  public async generarPlanificacion(
    input: unknown,
  ): Promise<ResultadoPlanificacionDto> {
    const solicitud = this.mapper.parseSolicitudPlanificacion(input);
    const resultado = this.useCase.execute(solicitud);

    return this.mapper.resultadoToDto(resultado);
  }

  public async ajustarPlanificacion(
    input: unknown,
  ): Promise<ResultadoAjusteManualDto> {
    const solicitud = this.mapper.parseAjustarPlanificacion(input);
    const resultado =
      solicitud.accion === 'APLICAR'
        ? this.ajustarUseCase.aplicar({
            calendario: solicitud.calendario,
            historial: solicitud.historial,
            unidadOperativa: solicitud.unidadOperativa,
            dia: solicitud.dia,
            titular: solicitud.titular,
            reemplazo: solicitud.reemplazo,
          })
        : this.ajustarUseCase.deshacerUltimo({
            calendario: solicitud.calendario,
            historial: solicitud.historial,
          });
    const reemplazos = convertirAjustesManualesAReemplazos(
      resultado.historial,
    );

    return this.mapper.resultadoAjusteToDto(resultado, reemplazos);
  }

  public async exportarPlanificacion(
    input: unknown,
  ): Promise<ExportacionExcelApi> {
    const solicitud = this.mapper.parseExportarCalendario(input);

    let contenido: Buffer;

    try {
      contenido = await this.writer.escribirCalendario(solicitud.calendario, {
        rutaPlantilla: this.templatePath,
        mes: solicitud.mes,
        anio: solicitud.anio,
        reemplazos: solicitud.reemplazos,
      });
    } catch (error) {
      throw new HttpApiError(
        422,
        'CALENDARIO_NO_EXPORTABLE',
        error instanceof Error
          ? error.message
          : 'El calendario no se puede exportar.',
      );
    }

    return {
      contenido,
      nombreArchivo: `turnos-${solicitud.anio}-${String(solicitud.mes).padStart(2, '0')}.xlsx`,
    };
  }
}

export function crearCasoDeUsoPlanificacion(): GeneratePlanningProposalUseCase {
  const analizadorEmpleado = new AnalizadorEstadoFinalEmpleado();

  return new GeneratePlanningProposalUseCase(
    new PlanningEngine(
      new PlanificacionInputValidator(),
      new AnalizadorEstadoFinalCalendario(analizadorEmpleado),
      new PlanificadorUnidadOperativa(
        analizadorEmpleado,
        new DecisorPrimerDiaContinuidadSimple(),
        new GeneradorRotacionSemanal(),
        new DistribuidorDiaLibre(),
        new ValidadorCobertura(),
      ),
    ),
  );
}

export function resolverRutaPlantillaDesdeEntorno(): string {
  const configurada = process.env['FIRESCHEDULE_EXCEL_TEMPLATE']?.trim();

  return configurada ? path.resolve(configurada) : RUTA_PLANTILLA_PREDETERMINADA;
}
