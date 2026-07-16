import type { Worksheet } from 'exceljs';

import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { BlockExtractor } from './BlockExtractor.js';
import type {
  PeriodoExcel,
  RawAssignment,
  TipoHoja,
  WeekLayout,
} from './excel-types.js';
import { WeekDetector } from './WeekDetector.js';

const MESES: Readonly<Record<string, number>> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

interface EstadosEmpleado {
  nombre: string;
  estados: string[];
}

export class SheetReader {
  constructor(
    private readonly weekDetector = new WeekDetector(),
    private readonly blockExtractor = new BlockExtractor(),
  ) {}

  public leerUnidadOperativa(
    worksheet: Worksheet,
    tipoHoja: TipoHoja,
    periodoObjetivo?: PeriodoExcel,
    fechaFinObjetivo?: Date,
  ): UnidadOperativa | null {
    if (tipoHoja === 'AUXILIAR') return null;

    const periodo = periodoObjetivo ?? this.extraerPeriodoDeclarado(worksheet);

    if (periodo === null) return null;

    const layouts: WeekLayout[] = this.weekDetector.detect(worksheet);

    if (layouts.length === 0) return null;

    const nombreEstacion = this.extraerNombreEstacion(worksheet, tipoHoja);
    const esHojaDeCaja = tipoHoja === 'CAJA';
    const rawAssignments: RawAssignment[] = [];

    for (const layout of layouts) {
      rawAssignments.push(
        ...this.blockExtractor.extractAssignments(
          worksheet,
          layout,
          esHojaDeCaja,
          periodo,
        ),
      );
    }

    const fechaInicio = new Date(
      Date.UTC(periodo.anio, periodo.mes - 1, 1),
    );
    const fechaFin =
      fechaFinObjetivo ??
      this.extraerFechaFinDetectada(worksheet, periodo) ??
      new Date(Date.UTC(periodo.anio, periodo.mes, 0));
    const totalDias = this.diferenciaDias(fechaInicio, fechaFin) + 1;
    const estadosPorEmpleado = new Map<string, EstadosEmpleado>();

    for (const raw of rawAssignments) {
      const nombreCanonico = this.normalizarNombreEmpleado(raw.empleadoNombre);
      const clave = this.normalizarClaveEmpleado(nombreCanonico);
      const existente = estadosPorEmpleado.get(clave) ?? {
        nombre: nombreCanonico,
        estados: Array.from({ length: totalDias }, () => 'OTRO'),
      };
      const fechaAsignacion = this.parseFechaIso(raw.fecha);
      const indiceDia = this.diferenciaDias(fechaInicio, fechaAsignacion);

      if (indiceDia < 0 || indiceDia >= totalDias) {
        continue;
      }

      const estadoActual = existente.estados[indiceDia] ?? 'OTRO';

      if (
        this.prioridadEstado(raw.estadoTexto) >=
        this.prioridadEstado(estadoActual)
      ) {
        existente.estados[indiceDia] = raw.estadoTexto;
      }

      estadosPorEmpleado.set(clave, existente);
    }

    if (estadosPorEmpleado.size === 0) return null;

    const empleados = [...estadosPorEmpleado.entries()].map(
      ([, empleado]) =>
        Empleado.create({
          nombre: empleado.nombre,
          estadosPorDia: empleado.estados.map((valor) =>
            EstadoTurno.create(valor),
          ),
        }),
    );

    return UnidadOperativa.create({
      nombre: nombreEstacion,
      empleados,
    });
  }

  public extraerFechaFinDetectada(
    worksheet: Worksheet,
    periodo: PeriodoExcel,
  ): Date | null {
    const fechas = this.weekDetector
      .detect(worksheet)
      .flatMap((layout) =>
        this.blockExtractor.extractDateColumns(layout, periodo),
      )
      .map(({ fecha }) => this.parseFechaIso(fecha));

    if (fechas.length === 0) {
      return null;
    }

    return new Date(Math.max(...fechas.map((fecha) => fecha.getTime())));
  }

  public extraerPeriodoDeclarado(worksheet: Worksheet): PeriodoExcel | null {
    const limiteFilas = Math.min(15, worksheet.rowCount);

    for (let fila = 1; fila <= limiteFilas; fila += 1) {
      const row = worksheet.getRow(fila);

      for (let columna = 1; columna <= row.cellCount; columna += 1) {
        const texto = this.normalizarTexto(row.getCell(columna).text ?? '');
        const coincidencia = texto.match(
          /CUADRO\s+DE\s+TURNOS\s+MES\s+DE\s+([A-Z]+)\s+(\d{4})/,
        );

        if (coincidencia === null) continue;

        const nombreMes = coincidencia[1];
        const textoAnio = coincidencia[2];

        if (nombreMes === undefined || textoAnio === undefined) continue;

        const mes = MESES[nombreMes];

        if (mes !== undefined) {
          return { mes, anio: Number(textoAnio) };
        }
      }
    }

    return null;
  }

  private extraerNombreEstacion(
    worksheet: Worksheet,
    tipoHoja: TipoHoja,
  ): string {
    const textos = [worksheet.name];
    const limiteFilas = Math.min(15, worksheet.rowCount);

    for (let fila = 1; fila <= limiteFilas; fila += 1) {
      const row = worksheet.getRow(fila);

      for (let columna = 1; columna <= row.cellCount; columna += 1) {
        const texto = (row.getCell(columna).text ?? '').trim();

        if (texto.length > 0) textos.push(texto);
      }
    }

    const textosNormalizados = textos.map((texto) =>
      this.normalizarTexto(texto),
    );
    let estacion: string;

    if (textosNormalizados.some((texto) => texto.includes('TRUCK STOP'))) {
      estacion = 'TRUCK STOP';
    } else if (textosNormalizados.some((texto) => texto.includes('CACAO'))) {
      estacion = 'CACAO';
    } else {
      estacion = this.extraerNombreGenerico(textosNormalizados, worksheet.name);
    }

    return `${estacion} ${tipoHoja}`;
  }

  private extraerNombreGenerico(
    textos: ReadonlyArray<string>,
    nombreHoja: string,
  ): string {
    const candidato = textos.find(
      (texto) =>
        texto.length > 0 &&
        !texto.includes('CORPORACION ROD') &&
        !texto.includes('CUADRO DE TURNOS') &&
        texto !== 'CAJEROS' &&
        !texto.startsWith('SEMANA'),
    );

    return (candidato ?? this.normalizarTexto(nombreHoja))
      .replace(/^E\s*\/\s*S\s+/, '')
      .replace(/\s+ROD(?:,?\s*S\.?A\.?)?$/, '')
      .trim();
  }

  private normalizarClaveEmpleado(nombre: string): string {
    return this.normalizarTexto(nombre).replace(/\s+/g, ' ');
  }

  private normalizarNombreEmpleado(nombre: string): string {
    const nombreLimpio = nombre.replace(/\s+/g, ' ').trim();
    const clave = this.normalizarClaveEmpleado(nombreLimpio);

    if (clave === 'CELEO') {
      return 'Celio';
    }

    return nombreLimpio;
  }

  private normalizarTexto(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  private prioridadEstado(estado: string): number {
    switch (estado) {
      case 'VACACIONES':
        return 5;
      case 'FERIADO':
        return 4;
      case 'LIBRE':
        return 3;
      case 'TURNO A':
      case 'TURNO B':
        return 2;
      case 'OTRO':
        return 1;
      default:
        return 0;
    }
  }

  private parseFechaIso(fecha: string): Date {
    const coincidencia = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (coincidencia === null) {
      throw new Error(`La fecha de Excel "${fecha}" no es valida.`);
    }

    return new Date(
      Date.UTC(
        Number(coincidencia[1]),
        Number(coincidencia[2]) - 1,
        Number(coincidencia[3]),
      ),
    );
  }

  private diferenciaDias(fechaInicio: Date, fechaFin: Date): number {
    return Math.round(
      (fechaFin.getTime() - fechaInicio.getTime()) / (24 * 60 * 60 * 1000),
    );
  }
}
