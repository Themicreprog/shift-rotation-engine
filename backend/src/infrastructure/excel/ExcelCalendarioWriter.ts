import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';

import ExcelJS from 'exceljs';
import type { Cell, Font, RichText, Worksheet } from 'exceljs';

import type { Calendario } from '../../domain/Calendario.js';
import { Empleado } from '../../domain/Empleado.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import type { ReemplazoPlanificacion } from '../../domain/planning/ReemplazoPlanificacion.js';

export interface OpcionesExcelCalendarioWriter {
  /**
   * Se conserva por compatibilidad con la API anterior.
   * El exportador nuevo NO depende de una plantilla externa.
   */
  rutaPlantilla?: string;
  mes: number;
  anio: number;
  rutaSalida?: string;
  reemplazos?: ReadonlyArray<ReemplazoPlanificacion>;
}

type EstadoExportable = 'TURNO A' | 'TURNO B' | 'LIBRE' | 'FERIADO' | 'VACACIONES' | 'OTRO';

interface ConfiguracionHoja {
  nombreHoja: string;
  nombreUnidad: string;
  subtitulo: string;
  esBomberos: boolean;
}

const MAXIMO_SEMANAS_CALENDARIO = 6;
const COLOR_TITULO = 'FF1F4E78';
const COLOR_ENCABEZADO = 'FFD9EAF7';
const COLOR_TURNO_A = 'FFE2F0D9';
const COLOR_TURNO_B = 'FFDDEBF7';
const COLOR_LIBRE = 'FFFFF2CC';
const COLOR_EVENTO = 'FFF4CCCC';
const COLOR_OTRO = 'FFE7E6E6';
const COLOR_REEMPLAZO = 'FFFCE4D6';
const COLOR_BORDE = 'FFB7B7B7';
const COLOR_TEXTO_ACTIVO = 'FF000000';
const COLOR_TEXTO_TITULAR = 'FF8A8A8A';

const CONFIGURACIONES_HOJAS: ReadonlyArray<ConfiguracionHoja> = [
  { nombreHoja: 'CACAO C1', nombreUnidad: 'CACAO PISTA', subtitulo: 'BOMBEROS', esBomberos: true },
  { nombreHoja: 'CAJA CACAO', nombreUnidad: 'CACAO CAJA', subtitulo: 'CAJEROS', esBomberos: false },
  { nombreHoja: 'TRUCK STOP', nombreUnidad: 'TRUCK STOP PISTA', subtitulo: 'BOMBEROS', esBomberos: true },
  { nombreHoja: 'CAJA TRUCK STOP', nombreUnidad: 'TRUCK STOP CAJA', subtitulo: 'CAJEROS', esBomberos: false },
];

const ESTADOS_EXPORTABLES: ReadonlyArray<EstadoExportable> = [
  'TURNO A',
  'TURNO B',
  'LIBRE',
  'FERIADO',
  'VACACIONES',
  'OTRO',
];

const NOMBRES_MESES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

const NOMBRES_DIAS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Mier.',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export class ExcelCalendarioWriter {
  public async escribirCalendario(
    calendario: Calendario,
    opciones: OpcionesExcelCalendarioWriter,
  ): Promise<Buffer> {
    const semanas = this.construirSemanas(opciones.mes, opciones.anio);
    const unidades = this.validarCalendario(calendario, opciones.mes, opciones.anio);
    const reemplazosPorUnidad = this.validarReemplazos(
      unidades,
      opciones.reemplazos ?? [],
      opciones.mes,
      opciones.anio,
    );
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'FireSchedule';
    workbook.created = new Date();
    workbook.modified = new Date();

    for (const configuracion of CONFIGURACIONES_HOJAS) {
      const unidad = unidades.get(configuracion.nombreUnidad);

      if (unidad === undefined) {
        throw new Error(`Falta la unidad operativa requerida "${configuracion.nombreUnidad}".`);
      }

      const worksheet = workbook.addWorksheet(configuracion.nombreHoja, {
        properties: { defaultRowHeight: 20 },
        pageSetup: {
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          paperSize: 9,
        },
      });

      this.prepararHojaNueva(
        worksheet,
        configuracion,
        unidad,
        opciones.mes,
        opciones.anio,
        semanas,
        reemplazosPorUnidad.get(configuracion.nombreUnidad) ?? [],
      );
    }

    const contenido = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido);

    if (opciones.rutaSalida !== undefined) {
      await writeFile(opciones.rutaSalida, buffer);
    }

    return buffer;
  }

  private prepararHojaNueva(
    worksheet: Worksheet,
    configuracion: ConfiguracionHoja,
    unidad: UnidadOperativa,
    mes: number,
    anio: number,
    semanas: ReadonlyArray<ReadonlyArray<Date>>,
    reemplazos: ReadonlyArray<ReemplazoPlanificacion>,
  ): void {
    this.configurarColumnas(worksheet);
    this.escribirTitulo(worksheet, configuracion, mes, anio);

    let filaActual = 4;

    for (let indiceSemana = 0; indiceSemana < semanas.length; indiceSemana += 1) {
      const semana = semanas[indiceSemana];

      if (semana === undefined) continue;

      this.escribirEncabezadoSemana(worksheet, filaActual, semana, indiceSemana + 1);
      filaActual += 1;

      const nombresPorEstadoYDia = this.obtenerNombresPorEstadoYDia(unidad, semana, mes, anio);

      for (const estado of ESTADOS_EXPORTABLES) {
        const maximoFilas = this.calcularFilasEstado(
          estado,
          nombresPorEstadoYDia,
          configuracion.esBomberos,
        );

        if (maximoFilas === 0) continue;

        for (let indiceFilaEstado = 0; indiceFilaEstado < maximoFilas; indiceFilaEstado += 1) {
          const fila = worksheet.getRow(filaActual);
          fila.height = 24;
          const celdaEstado = worksheet.getCell(filaActual, 2);

          if (indiceFilaEstado === 0) {
            celdaEstado.value = estado;
            celdaEstado.font = { bold: true };
            celdaEstado.fill = this.crearFillEstado(estado);
          }

          celdaEstado.alignment = { vertical: 'middle', horizontal: 'center' };
          celdaEstado.border = this.crearBorde();

          for (let indiceDia = 0; indiceDia < semana.length; indiceDia += 1) {
            const fecha = semana[indiceDia];
            const columna = 3 + indiceDia;
            const cell = worksheet.getCell(filaActual, columna);

            cell.border = this.crearBorde();
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

            if (fecha === undefined) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
              continue;
            }

            const fueraDelMes = fecha.getMonth() + 1 !== mes || fecha.getFullYear() !== anio;
            if (fueraDelMes) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
            }

            const nombres = nombresPorEstadoYDia.get(this.claveEstadoFecha(estado, fecha)) ?? [];
            const nombre = nombres[indiceFilaEstado];

            if (nombre !== undefined) {
              this.escribirAsignacion(cell, nombre, reemplazos, fecha.getDate());
            }
          }

          filaActual += 1;
        }
      }

      filaActual += 1;
    }

    worksheet.views = [{ state: 'frozen', ySplit: 3 }];
    delete worksheet.autoFilter;
  }

  private escribirTitulo(
    worksheet: Worksheet,
    configuracion: ConfiguracionHoja,
    mes: number,
    anio: number,
  ): void {
    const titulo = `Cuadro de Turnos mes de ${NOMBRES_MESES[mes]} ${anio}`;

    worksheet.mergeCells('A1:I1');
    worksheet.getCell('A1').value = titulo;
    worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TITULO } };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 28;

    worksheet.mergeCells('A2:I2');
    worksheet.getCell('A2').value = `${configuracion.nombreHoja} - ${configuracion.subtitulo}`;
    worksheet.getCell('A2').font = { bold: true, size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(2).height = 24;
  }

  private escribirEncabezadoSemana(
    worksheet: Worksheet,
    fila: number,
    semana: ReadonlyArray<Date>,
    numeroSemana: number,
  ): void {
    worksheet.getCell(fila, 1).value = `SEMANA ${numeroSemana}`;
    worksheet.getCell(fila, 2).value = 'TURNO/DIA';

    for (let indiceDia = 0; indiceDia < 7; indiceDia += 1) {
      const fecha = semana[indiceDia];
      worksheet.getCell(fila, 3 + indiceDia).value =
        fecha === undefined ? null : this.formatearFecha(fecha);
    }

    const row = worksheet.getRow(fila);
    row.height = 24;

    for (let columna = 1; columna <= 9; columna += 1) {
      const cell = worksheet.getCell(fila, columna);
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = this.crearBorde();
    }
  }

  private obtenerNombresPorEstadoYDia(
    unidad: UnidadOperativa,
    semana: ReadonlyArray<Date>,
    mes: number,
    anio: number,
  ): Map<string, string[]> {
    const resultado = new Map<string, string[]>();

    for (const fecha of semana) {
      for (const empleado of unidad.empleados) {
        const indiceDia = this.indiceDiaCalendario(unidad, fecha, mes, anio);
        if (indiceDia === null || indiceDia > empleado.totalDias()) continue;
        const estado = empleado.estadoDelDia(indiceDia).valor as EstadoExportable;

        if (!ESTADOS_EXPORTABLES.includes(estado)) continue;

        const clave = this.claveEstadoFecha(estado, fecha);
        const nombres = resultado.get(clave) ?? [];
        nombres.push(empleado.nombre);
        resultado.set(clave, nombres);
      }
    }

    return resultado;
  }

  private calcularFilasEstado(
    estado: EstadoExportable,
    nombresPorEstadoYDia: ReadonlyMap<string, ReadonlyArray<string>>,
    esBomberos: boolean,
  ): number {
    let maximo = 0;

    for (const [clave, nombres] of nombresPorEstadoYDia) {
      if (clave.startsWith(`${estado}::`)) {
        maximo = Math.max(maximo, nombres.length);
      }
    }

    if (estado === 'TURNO A' || estado === 'TURNO B') {
      return Math.max(maximo, esBomberos ? 3 : 1);
    }

    return maximo;
  }

  private escribirAsignacion(
    cell: Cell,
    nombre: string,
    reemplazos: ReadonlyArray<ReemplazoPlanificacion>,
    dia: number,
  ): void {
    const reemplazo = reemplazos.find(
      (candidato) =>
        candidato.dia === dia &&
        this.normalizarTexto(candidato.empleadoReemplazo) === this.normalizarTexto(nombre),
    );
    const fuenteActiva = this.crearFuenteActiva(cell.font);

    cell.font = fuenteActiva;

    if (reemplazo === undefined || reemplazo.empleadoTitular === null) {
      cell.value = nombre;
      return;
    }

    const richText: RichText[] = [
      { text: nombre, font: fuenteActiva },
      { text: `\n${reemplazo.empleadoTitular}`, font: this.crearFuenteTitular(fuenteActiva) },
    ];

    cell.value = { richText };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_REEMPLAZO } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.worksheet.getRow(cell.fullAddress.row).height = 34;
  }

  private validarCalendario(
    calendario: Calendario,
    mes: number,
    anio: number,
  ): Map<string, UnidadOperativa> {
    this.validarPeriodo(mes, anio);

    const nombresEsperados = new Set(CONFIGURACIONES_HOJAS.map(({ nombreUnidad }) => nombreUnidad));
    const unidades = new Map<string, UnidadOperativa>();
    const periodoOrigen = calendario.obtenerPeriodoOrigen();

    const inicioMes = new Date(Date.UTC(anio, mes - 1, 1));
    const diasEnMes = new Date(anio, mes, 0).getDate();

    if (periodoOrigen === null) {
      for (const unidad of calendario.unidadesOperativas) {
        const nombre = this.normalizarTexto(unidad.nombre);
        if (!nombresEsperados.has(nombre)) {
          throw new Error(`El exportador no admite la unidad operativa \"${unidad.nombre}\".`);
        }
        for (const empleado of unidad.empleados) {
          if (empleado.totalDias() !== diasEnMes) {
            throw new Error(`${empleado.nombre} debe contener los ${diasEnMes} estados de ${mes}/${anio}.`);
          }
        }
        unidades.set(nombre, unidad);
      }
      return unidades;
    }

    if (periodoOrigen.fechaInicio.getTime() !== inicioMes.getTime()) {
      throw new Error(`El calendario no comienza el 1/${mes}/${anio}.`);
    }

    const totalDiasVisuales = Math.round(
      (periodoOrigen.fechaFin.getTime() - periodoOrigen.fechaInicio.getTime()) / (24 * 60 * 60 * 1000),
    ) + 1;

    for (const unidad of calendario.unidadesOperativas) {
      const nombre = this.normalizarTexto(unidad.nombre);

      if (!nombresEsperados.has(nombre)) {
        throw new Error(`El exportador no admite la unidad operativa "${unidad.nombre}".`);
      }
      if (unidades.has(nombre)) {
        throw new Error(`La unidad operativa "${nombre}" está duplicada.`);
      }

      for (const empleado of unidad.empleados) {
        if (empleado.totalDias() < totalDiasVisuales) {
          throw new Error(`${empleado.nombre} debe contener los ${totalDiasVisuales} estados del período visual.`);
        }
        for (let dia = 1; dia <= totalDiasVisuales; dia += 1) {
          const estado = empleado.estadoDelDia(dia).valor;
          if (!ESTADOS_EXPORTABLES.includes(estado as EstadoExportable)) {
            throw new Error(`El estado "${estado}" de ${empleado.nombre} no puede exportarse.`);
          }
        }
      }

      unidades.set(nombre, unidad);
    }

    for (const nombreEsperado of nombresEsperados) {
      if (!unidades.has(nombreEsperado)) {
        throw new Error(`Falta la unidad operativa requerida "${nombreEsperado}".`);
      }
    }

    return unidades;
  }

  private validarReemplazos(
    unidades: ReadonlyMap<string, UnidadOperativa>,
    reemplazos: ReadonlyArray<ReemplazoPlanificacion>,
    mes: number,
    anio: number,
  ): Map<string, ReemplazoPlanificacion[]> {
    const diasEnMes = new Date(anio, mes, 0).getDate();
    const resultado = new Map<string, ReemplazoPlanificacion[]>();
    const claves = new Set<string>();

    for (const reemplazo of reemplazos) {
      const nombreUnidad = this.normalizarTexto(reemplazo.unidadOperativa);
      const unidad = unidades.get(nombreUnidad);

      if (!unidad) {
        throw new Error(`El reemplazo de ${reemplazo.empleadoReemplazo} referencia la unidad inexistente "${reemplazo.unidadOperativa}".`);
      }

      if (!Number.isInteger(reemplazo.dia) || reemplazo.dia < 1 || reemplazo.dia > diasEnMes) {
        throw new Error(`El día ${reemplazo.dia} del reemplazo de ${reemplazo.empleadoReemplazo} está fuera de ${mes}/${anio}.`);
      }

      const empleadoReemplazo = unidad.empleados.find(
        (empleado) => this.normalizarTexto(empleado.nombre) === this.normalizarTexto(reemplazo.empleadoReemplazo),
      );

      if (!empleadoReemplazo) {
        throw new Error(`${reemplazo.empleadoReemplazo} no existe en ${unidad.nombre} para exportar su reemplazo.`);
      }

      const estado = empleadoReemplazo.estadoDelDia(reemplazo.dia).valor;

      if (estado !== reemplazo.turno) {
        throw new Error(`El reemplazo de ${reemplazo.empleadoReemplazo} no coincide con ${reemplazo.turno} el día ${reemplazo.dia} en ${unidad.nombre}.`);
      }

      const clave = [nombreUnidad, reemplazo.dia, this.normalizarTexto(reemplazo.empleadoReemplazo)].join('::');

      if (claves.has(clave)) {
        throw new Error(`El reemplazo de ${reemplazo.empleadoReemplazo} está duplicado el día ${reemplazo.dia} en ${unidad.nombre}.`);
      }

      claves.add(clave);
      const reemplazosUnidad = resultado.get(nombreUnidad) ?? [];
      reemplazosUnidad.push(reemplazo);
      resultado.set(nombreUnidad, reemplazosUnidad);
    }

    return resultado;
  }

  private configurarColumnas(worksheet: Worksheet): void {
    worksheet.getColumn(1).width = 12;
    worksheet.getColumn(2).width = 16;

    for (let columna = 3; columna <= 9; columna += 1) {
      worksheet.getColumn(columna).width = 18;
    }
  }

  private crearFuenteActiva(fuente: Partial<Font> | undefined): Partial<Font> {
    return {
      ...fuente,
      bold: true,
      color: { argb: COLOR_TEXTO_ACTIVO },
    };
  }

  private crearFuenteTitular(fuenteActiva: Partial<Font>): Partial<Font> {
    return {
      ...fuenteActiva,
      bold: false,
      italic: true,
      size: Math.max(8, (fuenteActiva.size ?? 11) - 2),
      color: { argb: COLOR_TEXTO_TITULAR },
    };
  }

  private crearFillEstado(estado: EstadoExportable): ExcelJS.Fill {
    const color =
      estado === 'TURNO A'
        ? COLOR_TURNO_A
        : estado === 'TURNO B'
          ? COLOR_TURNO_B
          : estado === 'LIBRE'
            ? COLOR_LIBRE
            : estado === 'FERIADO' || estado === 'VACACIONES'
              ? COLOR_EVENTO
              : COLOR_OTRO;

    return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  }

  private crearBorde(): Partial<ExcelJS.Borders> {
    return {
      top: { style: 'thin', color: { argb: COLOR_BORDE } },
      left: { style: 'thin', color: { argb: COLOR_BORDE } },
      bottom: { style: 'thin', color: { argb: COLOR_BORDE } },
      right: { style: 'thin', color: { argb: COLOR_BORDE } },
    };
  }

  private construirSemanas(mes: number, anio: number): Date[][] {
    this.validarPeriodo(mes, anio);

    const primerDia = new Date(anio, mes - 1, 1, 12);
    const desplazamientoAlLunes = (primerDia.getDay() + 6) % 7;
    const inicio = new Date(primerDia);
    inicio.setDate(primerDia.getDate() - desplazamientoAlLunes);

    const diasEnMes = new Date(anio, mes, 0).getDate();
    const cantidadSemanas = Math.ceil((desplazamientoAlLunes + diasEnMes) / 7);

    if (cantidadSemanas > MAXIMO_SEMANAS_CALENDARIO) {
      throw new Error(`Un mes calendario admite como máximo ${MAXIMO_SEMANAS_CALENDARIO} semanas; ${mes}/${anio} necesita ${cantidadSemanas}.`);
    }

    return Array.from({ length: cantidadSemanas }, (_, indiceSemana) =>
      Array.from({ length: 7 }, (_, indiceDia) => {
        const fecha = new Date(inicio);
        fecha.setDate(inicio.getDate() + indiceSemana * 7 + indiceDia);
        return fecha;
      }),
    );
  }

  private validarPeriodo(mes: number, anio: number): void {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new Error('El mes debe ser un entero entre 1 y 12.');
    }

    if (!Number.isInteger(anio) || anio < 2000) {
      throw new Error('El año debe ser un entero mayor o igual que 2000.');
    }
  }

  private formatearFecha(fecha: Date): string {
    return `${NOMBRES_DIAS[fecha.getDay()]} ${fecha.getDate()}/${fecha.getMonth() + 1}`;
  }

  private claveEstadoFecha(estado: EstadoExportable, fecha: Date): string {
    return `${estado}::${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}`;
  }

  private indiceDiaCalendario(
    unidad: UnidadOperativa,
    fecha: Date,
    mes: number,
    anio: number,
  ): number | null {
    void unidad;
    const inicio = new Date(Date.UTC(anio, mes - 1, 1));
    const fechaUtc = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const indice = Math.round((fechaUtc.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return indice < 1 ? null : indice;
  }

  private normalizarTexto(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }
}