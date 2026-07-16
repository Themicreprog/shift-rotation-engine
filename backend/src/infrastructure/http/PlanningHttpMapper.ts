import { Calendario } from '../../domain/Calendario.js';
import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { AlcanceOperativo } from '../../domain/planning/AlcanceOperativo.js';
import { ComodinesPlanificacion } from '../../domain/planning/ComodinesPlanificacion.js';
import { EventoPlanificacion } from '../../domain/planning/EventoPlanificacion.js';
import { EventosPlanificacion } from '../../domain/planning/EventosPlanificacion.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';
import { ReemplazoPlanificacion } from '../../domain/planning/ReemplazoPlanificacion.js';
import type {
  MotivoReemplazoPlanificacion,
  TipoCoberturaPlanificacion,
  TurnoOperativoPlanificacion,
} from '../../domain/planning/ReemplazoPlanificacion.js';
import { TipoEventoPlanificacion } from '../../domain/planning/TipoEventoPlanificacion.js';
import type { RotationResult } from '../../domain/rotation/RotationResult.js';
import { SolicitudPlanificacion } from '../../application/planning/SolicitudPlanificacion.js';
import type { ResultadoAjusteManualPlanificacion } from '../../application/planning/AjustarAsignacionManualUseCase.js';
import { AjusteManualPlanificacion } from '../../domain/planning/AjusteManualPlanificacion.js';
import type {
  EstadoAjusteManualPlanificacion,
  EstadoIntercambiablePlanificacion,
  MovimientoAjusteManualPlanificacion,
  TurnoOperativoPlanificacion as TurnoAjusteManual,
} from '../../domain/planning/AjusteManualPlanificacion.js';
import { HttpApiError } from './HttpApiError.js';
import type {
  ArchivoExcelDto,
  AjusteManualPlanificacionDto,
  CalendarioDto,
  ReemplazoPlanificacionDto,
  ResultadoAjusteManualDto,
  ResultadoPlanificacionDto,
} from './dtos.js';

const ESTADOS_PERMITIDOS = new Set([
  'TURNO A',
  'TURNO B',
  'LIBRE',
  'VACACIONES',
  'FERIADO',
  'OTRO',
]);

const MAXIMO_TEXTO = 200;
const MAXIMO_UNIDADES = 20;
const MAXIMO_EMPLEADOS_POR_UNIDAD = 100;
const MAXIMO_DIAS = 62;
const TIPOS_COBERTURA = new Set<TipoCoberturaPlanificacion>([
  'BASE',
  'FLEXIBLE',
  'COMODIN',
  'MANUAL',
]);
const MOTIVOS_REEMPLAZO = new Set<MotivoReemplazoPlanificacion>([
  'VACACIONES',
  'FERIADO',
  'DESCANSO',
  'FALTANTE',
  'TRANSFERENCIA_FLEXIBLE',
  'AJUSTE_MANUAL',
]);

const NOMBRES_UNIDADES = [
  { interno: 'CACAO PISTA', publico: 'CACAO C1' },
  { interno: 'CACAO CAJA', publico: 'CAJA CACAO' },
  { interno: 'TRUCK STOP PISTA', publico: 'TRUCK STOP' },
  { interno: 'TRUCK STOP CAJA', publico: 'CAJA TRUCK STOP' },
] as const;

const UNIDAD_INTERNA_POR_NOMBRE = new Map<string, string>(
  NOMBRES_UNIDADES.flatMap(({ interno, publico }) => [
    [normalizarNombreUnidad(interno), interno] as const,
    [normalizarNombreUnidad(publico), interno] as const,
  ]),
);

const UNIDAD_PUBLICA_POR_NOMBRE_INTERNO = new Map<string, string>(
  NOMBRES_UNIDADES.map(({ interno, publico }) => [
    normalizarNombreUnidad(interno),
    publico,
  ]),
);

const REEMPLAZOS_UNIDADES_EN_TEXTO = NOMBRES_UNIDADES.map(
  ({ interno, publico }) => ({
    expresion: new RegExp(escaparExpresionRegular(interno), 'giu'),
    publico,
  }),
);

type JsonObject = Record<string, unknown>;

function normalizarNombreUnidad(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toUpperCase();
}

function escaparExpresionRegular(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ExportarCalendarioInput {
  calendario: Calendario;
  mes: number;
  anio: number;
  reemplazos: ReemplazoPlanificacion[];
}

export type AjustarPlanificacionInput =
  | {
      accion: 'APLICAR';
      calendario: Calendario;
      historial: AjusteManualPlanificacion[];
      unidadOperativa: string;
      dia: number;
      titular: string;
      reemplazo: string;
    }
  | {
      accion: 'DESHACER';
      calendario: Calendario;
      historial: AjusteManualPlanificacion[];
    };

export class PlanningHttpMapper {
  public parseImportarCalendario(
    valor: unknown,
    maximoBytes: number,
  ): ArchivoExcelDto {
    const objeto = this.requireObject(valor, 'La solicitud');
    this.assertAllowedKeys(
      objeto,
      ['contenidoBase64', 'nombreArchivo'],
      'La solicitud de importación',
    );

    const nombreArchivo = this.optionalString(
      objeto['nombreArchivo'],
      'nombreArchivo',
    ) ?? 'calendario.xlsx';

    if (!nombreArchivo.toLowerCase().endsWith('.xlsx')) {
      throw this.invalid('nombreArchivo debe terminar en .xlsx.');
    }

    const contenidoBase64 = this.requireString(
      objeto['contenidoBase64'],
      'contenidoBase64',
      Math.ceil((maximoBytes * 4) / 3) + 4,
    );

    if (
      contenidoBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(contenidoBase64)
    ) {
      throw this.invalid('contenidoBase64 no contiene Base64 válido.');
    }

    const contenido = Buffer.from(contenidoBase64, 'base64');

    if (contenido.length === 0) {
      throw this.invalid('El archivo Excel no puede estar vacío.');
    }

    if (contenido.length > maximoBytes) {
      throw new HttpApiError(
        413,
        'ARCHIVO_DEMASIADO_GRANDE',
        `El archivo Excel supera el límite de ${maximoBytes} bytes.`,
      );
    }

    if (contenido[0] !== 0x50 || contenido[1] !== 0x4b) {
      throw this.invalid('El contenido no corresponde a un archivo XLSX válido.');
    }

    return { contenido, nombreArchivo };
  }

  public parseSolicitudPlanificacion(valor: unknown): SolicitudPlanificacion {
    const objeto = this.requireObject(valor, 'La solicitud');
    this.assertAllowedKeys(
      objeto,
      [
        'calendarioOrigen',
        'mes',
        'anio',
        'alcanceOperativo',
        'eventos',
        'comodines',
      ],
      'La solicitud de planificación',
    );

    const calendario = this.parseCalendario(
      objeto['calendarioOrigen'],
      'calendarioOrigen',
    );
    const mes = this.parseMes(objeto['mes']);
    const anio = this.parseAnio(objeto['anio']);
    const periodo = this.crearPeriodoMensual(mes, anio);
    const nombresAlcance =
      objeto['alcanceOperativo'] === undefined
        ? calendario.unidadesOperativas.map(({ nombre }) => nombre)
        : this.parseStringArray(
            objeto['alcanceOperativo'],
            'alcanceOperativo',
            MAXIMO_UNIDADES,
          ).map((nombre) => this.unidadInterna(nombre));
    const eventos = this.parseEventos(objeto['eventos']);
    const comodines = this.parseComodines(objeto['comodines']);

    try {
      return new SolicitudPlanificacion(
        calendario,
        periodo,
        AlcanceOperativo.create({ unidadesOperativas: nombresAlcance }),
        EventosPlanificacion.create(eventos),
        ComodinesPlanificacion.create(comodines),
      );
    } catch (error) {
      throw this.domainError(error);
    }
  }

  public parseExportarCalendario(valor: unknown): ExportarCalendarioInput {
    const objeto = this.requireObject(valor, 'La solicitud');
    this.assertAllowedKeys(
      objeto,
      ['calendario', 'mes', 'anio', 'reemplazos'],
      'La solicitud de exportación',
    );

    const mes = this.parseMes(objeto['mes']);
    const anio = this.parseAnio(objeto['anio']);

    return {
      calendario: this.parseCalendario(objeto['calendario'], 'calendario'),
      mes,
      anio,
      reemplazos: this.parseReemplazos(
        objeto['reemplazos'],
        new Date(anio, mes, 0).getDate(),
      ),
    };
  }

  public parseAjustarPlanificacion(valor: unknown): AjustarPlanificacionInput {
    const objeto = this.requireObject(valor, 'La solicitud');
    this.assertAllowedKeys(
      objeto,
      [
        'accion',
        'calendario',
        'historial',
        'unidadOperativa',
        'dia',
        'titular',
        'reemplazo',
      ],
      'La solicitud de ajuste manual',
    );
    const accion = this.requireString(objeto['accion'], 'accion');
    const calendario = this.parseCalendario(objeto['calendario'], 'calendario');
    const historial = this.parseHistorialAjustes(objeto['historial']);

    if (accion === 'DESHACER') {
      return { accion, calendario, historial };
    }

    if (accion !== 'APLICAR') {
      throw this.invalid('accion debe ser APLICAR o DESHACER.');
    }

    return {
      accion,
      calendario,
      historial,
      unidadOperativa: this.unidadInterna(
        this.requireString(objeto['unidadOperativa'], 'unidadOperativa'),
      ),
      dia: this.requireInteger(objeto['dia'], 'dia'),
      titular: this.requireString(objeto['titular'], 'titular'),
      reemplazo: this.requireString(objeto['reemplazo'], 'reemplazo'),
    };
  }

  public calendarioToDto(calendario: Calendario): CalendarioDto {
    const periodoOrigen = calendario.obtenerPeriodoOrigen();

    return {
      nombre: calendario.nombre,
      unidadesOperativas: calendario.unidadesOperativas.map((unidad) => ({
        nombre: this.unidadPublica(unidad.nombre),
        empleados: unidad.empleados.map((empleado) => ({
          nombre: empleado.nombre,
          estadosPorDia: Array.from(
            { length: empleado.totalDias() },
            (_, indice) => empleado.estadoDelDia(indice + 1).valor,
          ),
        })),
      })),
      ...(periodoOrigen === null
        ? {}
        : {
            periodoOrigen: {
              mes: periodoOrigen.mes,
              anio: periodoOrigen.anio,
              fechaInicio: this.fechaIso(periodoOrigen.fechaInicio),
              fechaFin: this.fechaIso(periodoOrigen.fechaFin),
            },
          }),
    };
  }

  public resultadoToDto(resultado: RotationResult): ResultadoPlanificacionDto {
    const reemplazos = this.extraerReemplazos(resultado);

    return {
      calendario: this.calendarioToDto(resultado.calendario),
      cambios: resultado.cambios.map((cambio) => this.textoPublico(cambio)),
      advertencias: resultado.advertencias.map((advertencia) =>
        this.textoPublico(advertencia),
      ),
      conflictos: resultado.conflictos.map((conflicto) =>
        this.textoPublico(conflicto),
      ),
      reemplazos: reemplazos.map((reemplazo) =>
        this.reemplazoToDto(reemplazo),
      ),
      exportable: resultado.conflictos.length === 0,
    };
  }

  public resultadoAjusteToDto(
    resultado: ResultadoAjusteManualPlanificacion,
    reemplazos: ReadonlyArray<ReemplazoPlanificacion>,
  ): ResultadoAjusteManualDto {
    return {
      calendario: this.calendarioToDto(resultado.calendario),
      historial: resultado.historial.map((ajuste) => this.ajusteToDto(ajuste)),
      ajuste:
        resultado.ajuste === null
          ? null
          : this.ajusteToDto(resultado.ajuste),
      conflictos: resultado.conflictos.map((conflicto) =>
        this.textoPublico(conflicto),
      ),
      reemplazos: reemplazos.map((reemplazo) =>
        this.reemplazoToDto(reemplazo),
      ),
    };
  }

  private parseCalendario(valor: unknown, campo: string): Calendario {
    const objeto = this.requireObject(valor, campo);
    this.assertAllowedKeys(
      objeto,
      ['nombre', 'unidadesOperativas', 'periodoOrigen'],
      campo,
    );
    const nombre = this.requireString(objeto['nombre'], `${campo}.nombre`);
    const unidadesRaw = this.requireArray(
      objeto['unidadesOperativas'],
      `${campo}.unidadesOperativas`,
      MAXIMO_UNIDADES,
    );

    if (unidadesRaw.length === 0) {
      throw this.invalid(`${campo}.unidadesOperativas no puede estar vacío.`);
    }

    try {
      const calendario = new Calendario(
        nombre,
        this.parsePeriodoOrigen(objeto['periodoOrigen'], `${campo}.periodoOrigen`),
      );

      for (let indice = 0; indice < unidadesRaw.length; indice += 1) {
        calendario.agregarUnidadOperativa(
          this.parseUnidad(unidadesRaw[indice], `${campo}.unidadesOperativas[${indice}]`),
        );
      }

      return calendario;
    } catch (error) {
      if (error instanceof HttpApiError) throw error;
      throw this.domainError(error);
    }
  }

  private parsePeriodoOrigen(
    valor: unknown,
    campo: string,
  ): {
    mes: number;
    anio: number;
    fechaInicio: Date;
    fechaFin: Date;
  } | null {
    if (valor === undefined) {
      return null;
    }

    const objeto = this.requireObject(valor, campo);
    this.assertAllowedKeys(
      objeto,
      ['mes', 'anio', 'fechaInicio', 'fechaFin'],
      campo,
    );
    const mes = this.requireInteger(objeto['mes'], `${campo}.mes`);
    const anio = this.requireInteger(objeto['anio'], `${campo}.anio`);

    if (mes < 1 || mes > 12) {
      throw this.invalid(`${campo}.mes debe estar entre 1 y 12.`);
    }

    if (anio < 2000 || anio > 2100) {
      throw this.invalid(`${campo}.anio debe estar entre 2000 y 2100.`);
    }

    return {
      mes,
      anio,
      fechaInicio: this.parseFecha(
        objeto['fechaInicio'],
        `${campo}.fechaInicio`,
      ),
      fechaFin: this.parseFecha(objeto['fechaFin'], `${campo}.fechaFin`),
    };
  }

  private parseUnidad(valor: unknown, campo: string): UnidadOperativa {
    const objeto = this.requireObject(valor, campo);
    this.assertAllowedKeys(objeto, ['nombre', 'empleados'], campo);
    const nombre = this.unidadInterna(
      this.requireString(objeto['nombre'], `${campo}.nombre`),
    );
    const empleadosRaw = this.requireArray(
      objeto['empleados'],
      `${campo}.empleados`,
      MAXIMO_EMPLEADOS_POR_UNIDAD,
    );
    const empleados = empleadosRaw.map((empleado, indice) =>
      this.parseEmpleado(empleado, `${campo}.empleados[${indice}]`),
    );
    const cantidadesDias = new Set(empleados.map((empleado) => empleado.totalDias()));

    if (cantidadesDias.size > 1) {
      throw this.invalid(
        `Todos los empleados de ${campo} deben contener la misma cantidad de días.`,
      );
    }

    return UnidadOperativa.create({ nombre, empleados });
  }

  private parseEmpleado(valor: unknown, campo: string): Empleado {
    const objeto = this.requireObject(valor, campo);
    this.assertAllowedKeys(objeto, ['nombre', 'estadosPorDia'], campo);
    const nombre = this.requireString(objeto['nombre'], `${campo}.nombre`);
    const estadosRaw = this.requireArray(
      objeto['estadosPorDia'],
      `${campo}.estadosPorDia`,
      MAXIMO_DIAS,
    );

    if (estadosRaw.length === 0) {
      throw this.invalid(`${campo}.estadosPorDia no puede estar vacío.`);
    }

    const estados = estadosRaw.map((estado, indice) => {
      const valorEstado = this.requireString(
        estado,
        `${campo}.estadosPorDia[${indice}]`,
      ).toUpperCase();

      if (!ESTADOS_PERMITIDOS.has(valorEstado)) {
        throw this.invalid(
          `${campo}.estadosPorDia[${indice}] contiene el estado no permitido "${valorEstado}".`,
        );
      }

      return EstadoTurno.create(valorEstado);
    });

    return Empleado.create({ nombre, estadosPorDia: estados });
  }

  private parseEventos(valor: unknown): EventoPlanificacion[] {
    if (valor === undefined) return [];

    return this.requireArray(valor, 'eventos', 500).map((evento, indice) => {
      const campo = `eventos[${indice}]`;
      const objeto = this.requireObject(evento, campo);
      this.assertAllowedKeys(
        objeto,
        ['empleado', 'tipo', 'fechaInicio', 'fechaFin', 'unidadOperativa'],
        campo,
      );
      const empleado = this.requireString(objeto['empleado'], `${campo}.empleado`);
      const tipo = this.requireString(objeto['tipo'], `${campo}.tipo`);
      const fechaInicio = this.parseFecha(
        objeto['fechaInicio'],
        `${campo}.fechaInicio`,
      );
      const fechaFin = this.parseFecha(objeto['fechaFin'], `${campo}.fechaFin`);
      const unidadOperativaPublica = this.optionalString(
        objeto['unidadOperativa'],
        `${campo}.unidadOperativa`,
      );
      const unidadOperativa =
        unidadOperativaPublica === undefined
          ? undefined
          : this.unidadInterna(unidadOperativaPublica);

      if (
        tipo !== TipoEventoPlanificacion.VACACIONES &&
        tipo !== TipoEventoPlanificacion.FERIADO
      ) {
        throw this.invalid(`${campo}.tipo debe ser VACACIONES o FERIADO.`);
      }

      try {
        return EventoPlanificacion.create(
          unidadOperativa === undefined
            ? { empleado, tipo, fechaInicio, fechaFin }
            : { empleado, tipo, fechaInicio, fechaFin, unidadOperativa },
        );
      } catch (error) {
        throw this.domainError(error);
      }
    });
  }

  private parseComodines(
    valor: unknown,
  ): Array<{ unidadOperativa: string; empleado: string }> {
    if (valor === undefined) return [];

    return this.requireArray(valor, 'comodines', 100).map((comodin, indice) => {
      const campo = `comodines[${indice}]`;
      const objeto = this.requireObject(comodin, campo);
      this.assertAllowedKeys(objeto, ['unidadOperativa', 'empleado'], campo);

      return {
        unidadOperativa: this.unidadInterna(
          this.requireString(
            objeto['unidadOperativa'],
            `${campo}.unidadOperativa`,
          ),
        ),
        empleado: this.requireString(objeto['empleado'], `${campo}.empleado`),
      };
    });
  }

  private parseReemplazos(
    valor: unknown,
    diasEnMes: number,
  ): ReemplazoPlanificacion[] {
    if (valor === undefined) return [];

    return this.requireArray(valor, 'reemplazos', 2_000).map(
      (reemplazo, indice) => {
        const campo = `reemplazos[${indice}]`;
        const objeto = this.requireObject(reemplazo, campo);
        this.assertAllowedKeys(
          objeto,
          [
            'unidadOperativa',
            'dia',
            'turno',
            'empleadoTitular',
            'empleadoReemplazo',
            'tipoCobertura',
            'motivo',
          ],
          campo,
        );
        const dia = this.requireInteger(objeto['dia'], `${campo}.dia`);
        const turno = this.requireString(objeto['turno'], `${campo}.turno`);
        const tipoCobertura = this.requireString(
          objeto['tipoCobertura'],
          `${campo}.tipoCobertura`,
        );
        const motivo = this.requireString(objeto['motivo'], `${campo}.motivo`);

        if (dia < 1 || dia > diasEnMes) {
          throw this.invalid(`${campo}.dia debe estar entre 1 y ${diasEnMes}.`);
        }

        if (turno !== 'TURNO A' && turno !== 'TURNO B') {
          throw this.invalid(`${campo}.turno debe ser TURNO A o TURNO B.`);
        }

        if (
          !TIPOS_COBERTURA.has(tipoCobertura as TipoCoberturaPlanificacion)
        ) {
          throw this.invalid(`${campo}.tipoCobertura no es válido.`);
        }

        if (!MOTIVOS_REEMPLAZO.has(motivo as MotivoReemplazoPlanificacion)) {
          throw this.invalid(`${campo}.motivo no es válido.`);
        }

        try {
          return ReemplazoPlanificacion.create({
            unidadOperativa: this.unidadInterna(
              this.requireString(
                objeto['unidadOperativa'],
                `${campo}.unidadOperativa`,
              ),
            ),
            dia,
            turno: turno as TurnoOperativoPlanificacion,
            empleadoTitular: this.optionalNullableString(
              objeto['empleadoTitular'],
              `${campo}.empleadoTitular`,
            ),
            empleadoReemplazo: this.requireString(
              objeto['empleadoReemplazo'],
              `${campo}.empleadoReemplazo`,
            ),
            tipoCobertura: tipoCobertura as TipoCoberturaPlanificacion,
            motivo: motivo as MotivoReemplazoPlanificacion,
          });
        } catch (error) {
          throw this.domainError(error);
        }
      },
    );
  }

  private parseHistorialAjustes(valor: unknown): AjusteManualPlanificacion[] {
    return this.requireArray(valor, 'historial', 2_000).map(
      (registro, indice) =>
        this.parseAjusteManual(registro, `historial[${indice}]`),
    );
  }

  private parseAjusteManual(
    valor: unknown,
    campo: string,
  ): AjusteManualPlanificacion {
    const objeto = this.requireObject(valor, campo);
    this.assertAllowedKeys(
      objeto,
      [
        'id',
        'tipo',
        'unidadOperativa',
        'dia',
        'turno',
        'titularOriginal',
        'titular',
        'reemplazo',
        'estadoTitularAnterior',
        'estadoReemplazoAnterior',
        'estadoTitularPosterior',
        'estadoReemplazoPosterior',
        'movimientos',
        'estado',
      ],
      campo,
    );
    const estadoTitularAnterior = this.parseTurnoAjuste(
      objeto['estadoTitularAnterior'],
      `${campo}.estadoTitularAnterior`,
    );
    const estadoReemplazoAnterior = this.parseEstadoIntercambiable(
      objeto['estadoReemplazoAnterior'],
      `${campo}.estadoReemplazoAnterior`,
    );
    const estado = this.parseEstadoAjuste(objeto['estado'], `${campo}.estado`);
    const movimientos = this.parseMovimientosAjuste(
      objeto['movimientos'],
      `${campo}.movimientos`,
    );
    let ajuste: AjusteManualPlanificacion;

    try {
      ajuste = AjusteManualPlanificacion.create({
        id: this.requireString(objeto['id'], `${campo}.id`),
        unidadOperativa: this.unidadInterna(
          this.requireString(
            objeto['unidadOperativa'],
            `${campo}.unidadOperativa`,
          ),
        ),
        dia: this.requireInteger(objeto['dia'], `${campo}.dia`),
        titular: this.requireString(objeto['titular'], `${campo}.titular`),
        reemplazo: this.requireString(objeto['reemplazo'], `${campo}.reemplazo`),
        estadoTitularAnterior,
        estadoReemplazoAnterior,
        movimientos,
        estado,
      });
    } catch (error) {
      throw this.domainError(error);
    }

    const tipo = this.requireString(objeto['tipo'], `${campo}.tipo`);
    const turno = this.parseTurnoAjuste(objeto['turno'], `${campo}.turno`);
    const titularOriginal = this.requireString(
      objeto['titularOriginal'],
      `${campo}.titularOriginal`,
    );
    const estadoTitularPosterior = this.parseEstadoIntercambiable(
      objeto['estadoTitularPosterior'],
      `${campo}.estadoTitularPosterior`,
    );
    const estadoReemplazoPosterior = this.parseTurnoAjuste(
      objeto['estadoReemplazoPosterior'],
      `${campo}.estadoReemplazoPosterior`,
    );

    if (
      tipo !== ajuste.tipo ||
      turno !== ajuste.turno ||
      titularOriginal !== ajuste.titularOriginal ||
      estadoTitularPosterior !== ajuste.estadoTitularPosterior ||
      estadoReemplazoPosterior !== ajuste.estadoReemplazoPosterior
    ) {
      throw this.invalid(
        `${campo} contiene datos derivados que no coinciden con sus movimientos.`,
      );
    }

    return ajuste;
  }

  private parseMovimientosAjuste(
    valor: unknown,
    campo: string,
  ): MovimientoAjusteManualPlanificacion[] {
    return this.requireArray(valor, campo, 2).map((movimiento, indice) => {
      const nombreCampo = `${campo}[${indice}]`;
      const objeto = this.requireObject(movimiento, nombreCampo);
      this.assertAllowedKeys(
        objeto,
        ['turno', 'titularOriginal', 'titular', 'reemplazo'],
        nombreCampo,
      );

      return {
        turno: this.parseTurnoAjuste(
          objeto['turno'],
          `${nombreCampo}.turno`,
        ),
        titularOriginal: this.requireString(
          objeto['titularOriginal'],
          `${nombreCampo}.titularOriginal`,
        ),
        titular: this.requireString(
          objeto['titular'],
          `${nombreCampo}.titular`,
        ),
        reemplazo: this.requireString(
          objeto['reemplazo'],
          `${nombreCampo}.reemplazo`,
        ),
      };
    });
  }

  private ajusteToDto(
    ajuste: AjusteManualPlanificacion,
  ): AjusteManualPlanificacionDto {
    return {
      id: ajuste.id,
      tipo: ajuste.tipo,
      unidadOperativa: this.unidadPublica(ajuste.unidadOperativa),
      dia: ajuste.dia,
      turno: ajuste.turno,
      titularOriginal: ajuste.titularOriginal,
      titular: ajuste.titular,
      reemplazo: ajuste.reemplazo,
      estadoTitularAnterior: ajuste.estadoTitularAnterior,
      estadoReemplazoAnterior: ajuste.estadoReemplazoAnterior,
      estadoTitularPosterior: ajuste.estadoTitularPosterior,
      estadoReemplazoPosterior: ajuste.estadoReemplazoPosterior,
      movimientos: ajuste.movimientos.map((movimiento) => ({ ...movimiento })),
      estado: ajuste.estado,
    };
  }

  private parseTurnoAjuste(valor: unknown, campo: string): TurnoAjusteManual {
    const turno = this.requireString(valor, campo);

    if (turno !== 'TURNO A' && turno !== 'TURNO B') {
      throw this.invalid(`${campo} debe ser TURNO A o TURNO B.`);
    }

    return turno;
  }

  private parseEstadoIntercambiable(
    valor: unknown,
    campo: string,
  ): EstadoIntercambiablePlanificacion {
    const estado = this.requireString(valor, campo);

    if (estado !== 'TURNO A' && estado !== 'TURNO B' && estado !== 'LIBRE') {
      throw this.invalid(`${campo} debe ser TURNO A, TURNO B o LIBRE.`);
    }

    return estado;
  }

  private parseEstadoAjuste(
    valor: unknown,
    campo: string,
  ): EstadoAjusteManualPlanificacion {
    const estado = this.requireString(valor, campo);

    if (estado !== 'APLICADO' && estado !== 'DESHECHO') {
      throw this.invalid(`${campo} debe ser APLICADO o DESHECHO.`);
    }

    return estado;
  }

  private extraerReemplazos(
    resultado: RotationResult,
  ): ReadonlyArray<ReemplazoPlanificacion> {
    if (!('reemplazos' in resultado) || !Array.isArray(resultado.reemplazos)) {
      return [];
    }

    return resultado.reemplazos.filter(
      (reemplazo): reemplazo is ReemplazoPlanificacion =>
        reemplazo instanceof ReemplazoPlanificacion,
    );
  }

  private reemplazoToDto(
    reemplazo: ReemplazoPlanificacion,
  ): ReemplazoPlanificacionDto {
    return {
      unidadOperativa: this.unidadPublica(reemplazo.unidadOperativa),
      dia: reemplazo.dia,
      turno: reemplazo.turno,
      empleadoTitular: reemplazo.empleadoTitular,
      empleadoReemplazo: reemplazo.empleadoReemplazo,
      tipoCobertura: reemplazo.tipoCobertura,
      motivo: reemplazo.motivo,
    };
  }

  private crearPeriodoMensual(mes: number, anio: number): PeriodoPlanificacion {
    return PeriodoPlanificacion.create({
      fechaInicio: new Date(Date.UTC(anio, mes - 1, 1)),
      fechaFin: new Date(Date.UTC(anio, mes, 0)),
    });
  }

  private parseMes(valor: unknown): number {
    const mes = this.requireInteger(valor, 'mes');

    if (mes < 1 || mes > 12) {
      throw this.invalid('mes debe ser un entero entre 1 y 12.');
    }

    return mes;
  }

  private parseAnio(valor: unknown): number {
    const anio = this.requireInteger(valor, 'anio');

    if (anio < 2000 || anio > 2100) {
      throw this.invalid('anio debe ser un entero entre 2000 y 2100.');
    }

    return anio;
  }

  private parseFecha(valor: unknown, campo: string): Date {
    const texto = this.requireString(valor, campo);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      throw this.invalid(`${campo} debe usar el formato YYYY-MM-DD.`);
    }

    const fecha = new Date(`${texto}T00:00:00.000Z`);

    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
      throw this.invalid(`${campo} no es una fecha válida.`);
    }

    return fecha;
  }

  private fechaIso(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }

  private parseStringArray(
    valor: unknown,
    campo: string,
    maximo: number,
  ): string[] {
    const valores = this.requireArray(valor, campo, maximo);

    if (valores.length === 0) {
      throw this.invalid(`${campo} no puede estar vacío.`);
    }

    return valores.map((item, indice) =>
      this.requireString(item, `${campo}[${indice}]`),
    );
  }

  private requireObject(valor: unknown, campo: string): JsonObject {
    if (
      typeof valor !== 'object' ||
      valor === null ||
      Array.isArray(valor)
    ) {
      throw this.invalid(`${campo} debe ser un objeto JSON.`);
    }

    return valor as JsonObject;
  }

  private requireArray(
    valor: unknown,
    campo: string,
    maximo: number,
  ): unknown[] {
    if (!Array.isArray(valor)) {
      throw this.invalid(`${campo} debe ser un arreglo.`);
    }

    if (valor.length > maximo) {
      throw this.invalid(`${campo} supera el máximo de ${maximo} elementos.`);
    }

    return valor;
  }

  private requireString(
    valor: unknown,
    campo: string,
    maximo = MAXIMO_TEXTO,
  ): string {
    if (typeof valor !== 'string') {
      throw this.invalid(`${campo} debe ser texto.`);
    }

    const normalizado = valor.trim();

    if (normalizado.length === 0) {
      throw this.invalid(`${campo} no puede estar vacío.`);
    }

    if (normalizado.length > maximo) {
      throw this.invalid(`${campo} supera el máximo de ${maximo} caracteres.`);
    }

    return normalizado;
  }

  private optionalString(valor: unknown, campo: string): string | undefined {
    return valor === undefined ? undefined : this.requireString(valor, campo);
  }

  private optionalNullableString(
    valor: unknown,
    campo: string,
  ): string | null {
    if (valor === undefined || valor === null) return null;

    return this.requireString(valor, campo);
  }

  private requireInteger(valor: unknown, campo: string): number {
    if (typeof valor !== 'number' || !Number.isInteger(valor)) {
      throw this.invalid(`${campo} debe ser un entero.`);
    }

    return valor;
  }

  private assertAllowedKeys(
    objeto: JsonObject,
    permitidas: ReadonlyArray<string>,
    campo: string,
  ): void {
    const permitidasSet = new Set(permitidas);
    const desconocidas = Object.keys(objeto).filter(
      (clave) => !permitidasSet.has(clave),
    );

    if (desconocidas.length > 0) {
      throw this.invalid(
        `${campo} contiene campos desconocidos: ${desconocidas.join(', ')}.`,
      );
    }
  }

  private unidadInterna(nombre: string): string {
    return (
      UNIDAD_INTERNA_POR_NOMBRE.get(normalizarNombreUnidad(nombre)) ??
      nombre.trim()
    );
  }

  private unidadPublica(nombre: string): string {
    const nombreInterno = this.unidadInterna(nombre);

    return (
      UNIDAD_PUBLICA_POR_NOMBRE_INTERNO.get(
        normalizarNombreUnidad(nombreInterno),
      ) ?? nombre.trim()
    );
  }

  private textoPublico(texto: string): string {
    return REEMPLAZOS_UNIDADES_EN_TEXTO.reduce(
      (resultado, { expresion, publico }) =>
        resultado.replace(expresion, publico),
      texto,
    );
  }

  private invalid(message: string): HttpApiError {
    return new HttpApiError(
      400,
      'SOLICITUD_INVALIDA',
      this.textoPublico(message),
    );
  }

  private domainError(error: unknown): HttpApiError {
    return new HttpApiError(
      400,
      'SOLICITUD_INVALIDA',
      this.textoPublico(
        error instanceof Error ? error.message : 'La solicitud no es válida.',
      ),
    );
  }
}
