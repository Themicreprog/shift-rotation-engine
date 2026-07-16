import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';

import ExcelJS from 'exceljs';
import type { Cell, CellValue, Font, RichText, Worksheet } from 'exceljs';

import type { Calendario } from '../../domain/Calendario.js';
import { Empleado } from '../../domain/Empleado.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import type { ReemplazoPlanificacion } from '../../domain/planning/ReemplazoPlanificacion.js';

export interface OpcionesExcelCalendarioWriter {
  rutaPlantilla: string;
  mes: number;
  anio: number;
  rutaSalida?: string;
  reemplazos?: ReadonlyArray<ReemplazoPlanificacion>;
}

type EstadoExportable = 'TURNO A' | 'TURNO B' | 'LIBRE' | 'FERIADO' | 'VACACIONES' | 'OTRO';

interface ConfiguracionHoja {
  nombreHoja: string;
  nombreUnidad: string;
}

interface BloqueSemanaPlantilla {
  filaEncabezado: number;
  filaInicioDatos: number;
  filaFinDatos: number;
  columnaTurnoDia: number;
}

const MES_REFERENCIA_PLANTILLA = 7;
const BLOQUES_SEMANALES_PLANTILLA = 5;
const MAXIMO_SEMANAS_CALENDARIO = 6;
const COLOR_REEMPLAZO = 'FFFCE4D6';
const COLOR_TEXTO_ACTIVO = 'FF000000';
const COLOR_TEXTO_TITULAR = 'FF8A8A8A';

const CONFIGURACIONES_HOJAS: ReadonlyArray<ConfiguracionHoja> = [
  { nombreHoja: 'CACAO C1', nombreUnidad: 'CACAO PISTA' },
  { nombreHoja: 'CAJA CACAO', nombreUnidad: 'CACAO CAJA' },
  { nombreHoja: 'TRUCK STOP', nombreUnidad: 'TRUCK STOP PISTA' },
  { nombreHoja: 'CAJA TRUCK STOP', nombreUnidad: 'TRUCK STOP CAJA' },
];

const ESTADOS_EXPORTABLES = new Set<EstadoExportable>([
  'TURNO A',
  'TURNO B',
  'LIBRE',
  'FERIADO',
  'VACACIONES',
  'OTRO',
]);

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

    await workbook.xlsx.readFile(opciones.rutaPlantilla);
    this.conservarHojasUtiles(workbook);

    for (const configuracion of CONFIGURACIONES_HOJAS) {
      const worksheet = workbook.getWorksheet(configuracion.nombreHoja);
      const unidad = unidades.get(configuracion.nombreUnidad);

      if (worksheet === undefined || unidad === undefined) {
        throw new Error(
          `La plantilla no contiene la hoja requerida "${configuracion.nombreHoja}".`,
        );
      }

      this.prepararHoja(
        worksheet,
        unidad,
        opciones.mes,
        opciones.anio,
        semanas,
        reemplazosPorUnidad.get(configuracion.nombreUnidad) ?? [],
      );
    }

    this.limpiarFormulas(workbook);
    this.eliminarNotas(workbook);

    const contenido = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido);

    if (opciones.rutaSalida !== undefined) {
      await writeFile(opciones.rutaSalida, buffer);
    }

    return buffer;
  }

  private validarCalendario(
    calendario: Calendario,
    mes: number,
    anio: number,
  ): Map<string, UnidadOperativa> {
    this.validarPeriodo(mes, anio);

    const diasEnMes = new Date(anio, mes, 0).getDate();
    const nombresEsperados = new Set(CONFIGURACIONES_HOJAS.map(({ nombreUnidad }) => nombreUnidad));
    const unidades = new Map<string, UnidadOperativa>();

    for (const unidad of calendario.unidadesOperativas) {
      const nombre = this.normalizarTexto(unidad.nombre);

      if (!nombresEsperados.has(nombre)) {
        throw new Error(`La plantilla de julio no admite la unidad operativa "${unidad.nombre}".`);
      }

      if (unidades.has(nombre)) {
        throw new Error(`La unidad operativa "${nombre}" está duplicada.`);
      }

      const periodoOrigen = calendario.obtenerPeriodoOrigen();
      const inicioMes = new Date(Date.UTC(anio, mes - 1, 1));
      const desplazamiento =
        periodoOrigen === null
          ? 0
          : Math.round(
              (inicioMes.getTime() - periodoOrigen.fechaInicio.getTime()) /
                (24 * 60 * 60 * 1000),
            );
      const empleadosNormalizados = unidad.empleados.map((empleado) => {
        if (
          empleado.totalDias() === diasEnMes &&
          desplazamiento === 0
        ) {
          return empleado;
        }

        if (
          periodoOrigen === null ||
          desplazamiento < 0 ||
          desplazamiento + diasEnMes > empleado.totalDias()
        ) {
          throw new Error(
            `${empleado.nombre} debe contener los ${diasEnMes} estados de ${mes}/${anio}.`,
          );
        }

        return Empleado.create({
          nombre: empleado.nombre,
          estadosPorDia: Array.from(
            { length: diasEnMes },
            (_, indice) =>
              empleado.estadoDelDia(desplazamiento + indice + 1),
          ),
        });
      });

      for (const empleado of empleadosNormalizados) {

        for (let dia = 1; dia <= diasEnMes; dia += 1) {
          const estado = empleado.estadoDelDia(dia).valor;

          if (!ESTADOS_EXPORTABLES.has(estado as EstadoExportable)) {
            throw new Error(
              `El estado "${estado}" de ${empleado.nombre} no puede escribirse en la plantilla.`,
            );
          }
        }
      }

      unidades.set(
        nombre,
        UnidadOperativa.create({
          nombre: unidad.nombre,
          empleados: empleadosNormalizados,
        }),
      );
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
        throw new Error(
          `El reemplazo de ${reemplazo.empleadoReemplazo} referencia la unidad inexistente "${reemplazo.unidadOperativa}".`,
        );
      }

      if (
        !Number.isInteger(reemplazo.dia) ||
        reemplazo.dia < 1 ||
        reemplazo.dia > diasEnMes
      ) {
        throw new Error(
          `El día ${reemplazo.dia} del reemplazo de ${reemplazo.empleadoReemplazo} está fuera de ${mes}/${anio}.`,
        );
      }

      const empleadoReemplazo = unidad.empleados.find(
        (empleado) =>
          this.normalizarTexto(empleado.nombre) ===
          this.normalizarTexto(reemplazo.empleadoReemplazo),
      );

      if (!empleadoReemplazo) {
        throw new Error(
          `${reemplazo.empleadoReemplazo} no existe en ${unidad.nombre} para exportar su reemplazo.`,
        );
      }

      if (empleadoReemplazo.estadoDelDia(reemplazo.dia).valor !== reemplazo.turno) {
        throw new Error(
          `El reemplazo de ${reemplazo.empleadoReemplazo} no coincide con ${reemplazo.turno} el día ${reemplazo.dia} en ${unidad.nombre}.`,
        );
      }

      if (
        reemplazo.empleadoTitular !== null &&
        !unidad.empleados.some(
          (empleado) =>
            this.normalizarTexto(empleado.nombre) ===
            this.normalizarTexto(reemplazo.empleadoTitular ?? ''),
        )
      ) {
        throw new Error(
          `El titular ${reemplazo.empleadoTitular} no existe en ${unidad.nombre}.`,
        );
      }

      const clave = [
        nombreUnidad,
        reemplazo.dia,
        this.normalizarTexto(reemplazo.empleadoReemplazo),
      ].join('::');

      if (claves.has(clave)) {
        throw new Error(
          `El reemplazo de ${reemplazo.empleadoReemplazo} está duplicado el día ${reemplazo.dia} en ${unidad.nombre}.`,
        );
      }

      claves.add(clave);
      const reemplazosUnidad = resultado.get(nombreUnidad) ?? [];
      reemplazosUnidad.push(reemplazo);
      resultado.set(nombreUnidad, reemplazosUnidad);
    }

    return resultado;
  }

  private prepararHoja(
    worksheet: Worksheet,
    unidad: UnidadOperativa,
    mes: number,
    anio: number,
    semanas: ReadonlyArray<ReadonlyArray<Date>>,
    reemplazos: ReadonlyArray<ReemplazoPlanificacion>,
  ): void {
    const bloques = this.detectarBloquesSemana(worksheet);
    const bloquesReferencia = bloques.filter((bloque) =>
      this.bloqueContieneMes(worksheet, bloque, MES_REFERENCIA_PLANTILLA),
    );

    if (bloquesReferencia.length !== BLOQUES_SEMANALES_PLANTILLA) {
      throw new Error(
        `La hoja "${worksheet.name}" debe contener cinco bloques semanales de julio reutilizables.`,
      );
    }

    const bloquesExportacion = [...bloquesReferencia];
    const todosLosBloques = [...bloques];

    if (semanas.length > bloquesExportacion.length) {
      const ultimoBloque = bloquesExportacion.at(-1);

      if (ultimoBloque === undefined) {
        throw new Error(`La hoja "${worksheet.name}" no contiene bloques para clonar.`);
      }

      const sextoBloque = this.clonarBloqueSemana(worksheet, ultimoBloque);
      bloquesExportacion.push(sextoBloque);
      todosLosBloques.push(sextoBloque);
    }

    this.actualizarTitulo(worksheet, mes, anio);

    for (const bloque of todosLosBloques) {
      this.limpiarAsignaciones(worksheet, bloque);

      if (!bloquesExportacion.includes(bloque)) {
        this.ocultarBloque(worksheet, bloque);
      }
    }

    for (let indice = 0; indice < bloquesExportacion.length; indice += 1) {
      const bloque = bloquesExportacion[indice];
      const semana = semanas[indice];

      if (bloque === undefined) continue;

      if (semana === undefined) {
        this.ocultarBloque(worksheet, bloque);
        this.limpiarEncabezadosDias(worksheet, bloque);
        continue;
      }

      this.mostrarBloque(worksheet, bloque);
      this.actualizarEncabezadoSemana(worksheet, bloque, semana, indice + 1);
      this.escribirSemana(
        worksheet,
        bloque,
        semana,
        unidad,
        mes,
        anio,
        reemplazos,
      );
    }
  }

  private clonarBloqueSemana(
    worksheet: Worksheet,
    origen: BloqueSemanaPlantilla,
  ): BloqueSemanaPlantilla {
    const filaDestino = worksheet.rowCount + 1;
    const desplazamiento = filaDestino - origen.filaEncabezado;
    const ultimaColumna = worksheet.columnCount;
    const fusionesOrigen = worksheet.model.merges.filter((rango) =>
      this.rangoEstaDentroDelBloque(rango, origen),
    );

    for (
      let filaOrigen = origen.filaEncabezado;
      filaOrigen <= origen.filaFinDatos;
      filaOrigen += 1
    ) {
      const rowOrigen = worksheet.getRow(filaOrigen);
      const rowDestino = worksheet.getRow(filaOrigen + desplazamiento);

      rowDestino.height = rowOrigen.height;
      rowDestino.hidden = false;
      rowDestino.outlineLevel = rowOrigen.outlineLevel ?? 0;

      for (let columna = 1; columna <= ultimaColumna; columna += 1) {
        const cellOrigen = rowOrigen.getCell(columna);
        const cellDestino = rowDestino.getCell(columna);
        const esCeldaSecundariaFusionada =
          cellOrigen.isMerged && cellOrigen.master.address !== cellOrigen.address;

        cellDestino.value = esCeldaSecundariaFusionada ? null : cellOrigen.value;
        cellDestino.style = { ...cellOrigen.style };
      }
    }

    for (const rango of fusionesOrigen) {
      worksheet.mergeCells(this.desplazarRango(rango, desplazamiento));
    }

    return {
      filaEncabezado: origen.filaEncabezado + desplazamiento,
      filaInicioDatos: origen.filaInicioDatos + desplazamiento,
      filaFinDatos: origen.filaFinDatos + desplazamiento,
      columnaTurnoDia: origen.columnaTurnoDia,
    };
  }

  private rangoEstaDentroDelBloque(rango: string, bloque: BloqueSemanaPlantilla): boolean {
    const filas = rango.match(/\d+/g)?.map(Number);
    const primeraFila = filas?.[0];
    const ultimaFila = filas?.[1];

    return (
      primeraFila !== undefined &&
      ultimaFila !== undefined &&
      primeraFila >= bloque.filaEncabezado &&
      ultimaFila <= bloque.filaFinDatos
    );
  }

  private desplazarRango(rango: string, desplazamiento: number): string {
    return rango.replace(
      /([A-Z]+)(\d+)/g,
      (_, columna: string, fila: string) => `${columna}${Number(fila) + desplazamiento}`,
    );
  }

  private conservarHojasUtiles(workbook: ExcelJS.Workbook): void {
    const nombresHojas = new Set(CONFIGURACIONES_HOJAS.map(({ nombreHoja }) => nombreHoja));

    for (const worksheet of [...workbook.worksheets]) {
      if (!nombresHojas.has(worksheet.name)) {
        workbook.removeWorksheet(worksheet.id);
      }
    }

    for (const nombreHoja of nombresHojas) {
      if (workbook.getWorksheet(nombreHoja) === undefined) {
        throw new Error(`La plantilla no contiene la hoja requerida "${nombreHoja}".`);
      }
    }
  }

  private detectarBloquesSemana(worksheet: Worksheet): BloqueSemanaPlantilla[] {
    const encabezados: Array<{
      fila: number;
      columnaTurnoDia: number;
    }> = [];

    for (let fila = 1; fila <= worksheet.rowCount; fila += 1) {
      const row = worksheet.getRow(fila);
      let contieneSemana = false;
      let columnaTurnoDia: number | null = null;

      for (let columna = 1; columna <= row.cellCount; columna += 1) {
        const texto = this.normalizarTexto(row.getCell(columna).text ?? '');

        if (texto.startsWith('SEMANA')) contieneSemana = true;
        if (texto === 'TURNO/DIA') columnaTurnoDia = columna;
      }

      if (contieneSemana && columnaTurnoDia !== null) {
        encabezados.push({ fila, columnaTurnoDia });
      }
    }

    return encabezados.map((encabezado, indice) => ({
      filaEncabezado: encabezado.fila,
      filaInicioDatos: encabezado.fila + 1,
      filaFinDatos: (encabezados[indice + 1]?.fila ?? worksheet.rowCount + 1) - 1,
      columnaTurnoDia: encabezado.columnaTurnoDia,
    }));
  }

  private bloqueContieneMes(
    worksheet: Worksheet,
    bloque: BloqueSemanaPlantilla,
    mes: number,
  ): boolean {
    const row = worksheet.getRow(bloque.filaEncabezado);

    for (let columna = bloque.columnaTurnoDia + 1; columna <= row.cellCount; columna += 1) {
      const coincidencia = (row.getCell(columna).text ?? '').match(
        /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*\d{2,4})?/,
      );

      if (coincidencia?.[2] !== undefined && Number(coincidencia[2]) === mes) {
        return true;
      }
    }

    return false;
  }

  private limpiarAsignaciones(worksheet: Worksheet, bloque: BloqueSemanaPlantilla): void {
    let estadoActual: EstadoExportable | null = null;

    for (let fila = bloque.filaInicioDatos; fila <= bloque.filaFinDatos; fila += 1) {
      const textoEstado = this.normalizarTexto(
        worksheet.getCell(fila, bloque.columnaTurnoDia).text ?? '',
      );

      if (ESTADOS_EXPORTABLES.has(textoEstado as EstadoExportable)) {
        estadoActual = textoEstado as EstadoExportable;
      }

      for (
        let columna = bloque.columnaTurnoDia + 1;
        columna <= bloque.columnaTurnoDia + 7;
        columna += 1
      ) {
        const cell = worksheet.getCell(fila, columna);
        cell.value = null;

        if (
          estadoActual === 'TURNO A' ||
          estadoActual === 'TURNO B' ||
          estadoActual === 'OTRO'
        ) {
          cell.fill = { type: 'pattern', pattern: 'none' };
        }
      }
    }
  }

  private actualizarTitulo(worksheet: Worksheet, mes: number, anio: number): void {
    const nombreMes = NOMBRES_MESES[mes];
    const titulo = `Cuadro de Turnos mes de ${nombreMes} ${anio}`;
    const maestrosActualizados = new Set<string>();

    for (let fila = 1; fila <= Math.min(15, worksheet.rowCount); fila += 1) {
      const row = worksheet.getRow(fila);

      for (let columna = 1; columna <= row.cellCount; columna += 1) {
        const cell = row.getCell(columna);
        const texto = this.normalizarTexto(cell.text ?? '');

        if (!texto.includes('CUADRO DE TURNOS MES DE')) continue;

        const master = cell.master;

        if (!maestrosActualizados.has(master.address)) {
          master.value = titulo;
          maestrosActualizados.add(master.address);
        }
      }
    }

    if (maestrosActualizados.size === 0) {
      throw new Error(`No se encontró el título del calendario en la hoja "${worksheet.name}".`);
    }
  }

  private actualizarEncabezadoSemana(
    worksheet: Worksheet,
    bloque: BloqueSemanaPlantilla,
    semana: ReadonlyArray<Date>,
    numeroSemana: number,
  ): void {
    worksheet.getCell(bloque.filaEncabezado, 1).value = `SEMANA ${numeroSemana}`;

    for (let indiceDia = 0; indiceDia < 7; indiceDia += 1) {
      const fecha = semana[indiceDia];

      if (fecha !== undefined) {
        worksheet.getCell(bloque.filaEncabezado, bloque.columnaTurnoDia + 1 + indiceDia).value =
          this.formatearFecha(fecha);
      }
    }
  }

  private escribirSemana(
    worksheet: Worksheet,
    bloque: BloqueSemanaPlantilla,
    semana: ReadonlyArray<Date>,
    unidad: UnidadOperativa,
    mes: number,
    anio: number,
    reemplazos: ReadonlyArray<ReemplazoPlanificacion>,
  ): void {
    const filasPorEstado = this.detectarFilasPorEstado(worksheet, bloque);

    for (let indiceDia = 0; indiceDia < semana.length; indiceDia += 1) {
      const fecha = semana[indiceDia];

      if (fecha === undefined || fecha.getMonth() + 1 !== mes || fecha.getFullYear() !== anio) {
        continue;
      }

      const nombresPorEstado = new Map<EstadoExportable, string[]>();

      for (const empleado of unidad.empleados) {
        const estado = empleado.estadoDelDia(fecha.getDate()).valor as EstadoExportable;
        const nombres = nombresPorEstado.get(estado) ?? [];
        nombres.push(empleado.nombre);
        nombresPorEstado.set(estado, nombres);
      }

      for (const [estado, nombres] of nombresPorEstado) {
        const filas = filasPorEstado.get(estado);

        if (filas === undefined && estado === 'OTRO') continue;

        if (filas === undefined) {
          throw new Error(`La hoja "${worksheet.name}" no contiene una fila para ${estado}.`);
        }

        if (bloque.columnaTurnoDia === 3) {
          const primeraFila = filas[0];

          if (primeraFila !== undefined) {
            this.escribirAsignacion(
              worksheet.getCell(
                primeraFila,
                bloque.columnaTurnoDia + 1 + indiceDia,
              ),
              nombres,
              reemplazos,
              fecha.getDate(),
            );
          }

          continue;
        }

        if (filas.length < nombres.length) {
          throw new Error(
            `La hoja "${worksheet.name}" no tiene filas suficientes para ${nombres.length} empleados en ${estado}, día ${fecha.getDate()}.`,
          );
        }

        for (let indiceNombre = 0; indiceNombre < nombres.length; indiceNombre += 1) {
          const fila = filas[indiceNombre];
          const nombre = nombres[indiceNombre];

          if (fila !== undefined && nombre !== undefined) {
            this.escribirAsignacion(
              worksheet.getCell(
                fila,
                bloque.columnaTurnoDia + 1 + indiceDia,
              ),
              [nombre],
              reemplazos,
              fecha.getDate(),
            );
          }
        }
      }
    }
  }

  private escribirAsignacion(
    cell: Cell,
    nombres: ReadonlyArray<string>,
    reemplazos: ReadonlyArray<ReemplazoPlanificacion>,
    dia: number,
  ): void {
    const reemplazosAplicables = reemplazos.filter(
      (reemplazo) =>
        reemplazo.dia === dia &&
        nombres.some(
          (nombre) =>
            this.normalizarTexto(nombre) ===
            this.normalizarTexto(reemplazo.empleadoReemplazo),
        ),
    );
    const fuenteActiva = this.crearFuenteActiva(cell.font);
    const textoActivo = nombres.join(', ');

    cell.font = fuenteActiva;

    if (reemplazosAplicables.length === 0) {
      cell.value = textoActivo;
      return;
    }

    const titulares = reemplazosAplicables.flatMap((reemplazo) =>
      reemplazo.empleadoTitular === null
        ? []
        : [reemplazo.empleadoTitular],
    );
    const richText: RichText[] = [
      { text: textoActivo, font: fuenteActiva },
    ];

    if (titulares.length > 0) {
      richText.push({
        text: `\n${titulares.join(', ')}`,
        font: this.crearFuenteTitular(fuenteActiva),
      });
    }

    cell.value = { richText };

    cell.style = {
      ...cell.style,
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR_REEMPLAZO },
      },
      alignment: { ...cell.alignment, wrapText: true },
    };
    const row = cell.worksheet.getRow(cell.fullAddress.row);
    row.height = Math.max(row.height ?? 15, titulares.length > 0 ? 30 : 24);
  }

  private crearFuenteActiva(
    fuente: Partial<Font> | undefined,
  ): Partial<Font> {
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
      size: Math.max(8, (fuenteActiva.size ?? 11) - 2),
      color: { argb: COLOR_TEXTO_TITULAR },
    };
  }

  private eliminarNotas(workbook: ExcelJS.Workbook): void {
    for (const worksheet of workbook.worksheets) {
      worksheet.eachRow({ includeEmpty: true }, (row) => {
        row.eachCell({ includeEmpty: true }, (cell) => {
          const celdaInterna = cell as Cell & { _comment?: unknown };

          celdaInterna._comment = undefined;
        });
      });
    }
  }

  private detectarFilasPorEstado(
    worksheet: Worksheet,
    bloque: BloqueSemanaPlantilla,
  ): Map<EstadoExportable, number[]> {
    const filasPorEstado = new Map<EstadoExportable, number[]>();
    let estadoActual: EstadoExportable | null = null;

    for (let fila = bloque.filaInicioDatos; fila <= bloque.filaFinDatos; fila += 1) {
      const textoEstado = this.normalizarTexto(
        worksheet.getCell(fila, bloque.columnaTurnoDia).text ?? '',
      );

      if (ESTADOS_EXPORTABLES.has(textoEstado as EstadoExportable)) {
        estadoActual = textoEstado as EstadoExportable;
      }

      if (estadoActual !== null) {
        const filas = filasPorEstado.get(estadoActual) ?? [];
        filas.push(fila);
        filasPorEstado.set(estadoActual, filas);
      }
    }

    return filasPorEstado;
  }

  private limpiarEncabezadosDias(worksheet: Worksheet, bloque: BloqueSemanaPlantilla): void {
    for (
      let columna = bloque.columnaTurnoDia + 1;
      columna <= bloque.columnaTurnoDia + 7;
      columna += 1
    ) {
      worksheet.getCell(bloque.filaEncabezado, columna).value = null;
    }
  }

  private ocultarBloque(worksheet: Worksheet, bloque: BloqueSemanaPlantilla): void {
    for (let fila = bloque.filaEncabezado; fila <= bloque.filaFinDatos; fila += 1) {
      worksheet.getRow(fila).hidden = true;
    }
  }

  private mostrarBloque(worksheet: Worksheet, bloque: BloqueSemanaPlantilla): void {
    for (let fila = bloque.filaEncabezado; fila <= bloque.filaFinDatos; fila += 1) {
      worksheet.getRow(fila).hidden = false;
    }
  }

  private limpiarFormulas(workbook: ExcelJS.Workbook): void {
    for (const worksheet of workbook.worksheets) {
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (this.esFormula(cell.value)) {
            cell.value = null;
          }
        });
      });
    }
  }

  private esFormula(valor: CellValue): boolean {
    return (
      typeof valor === 'object' &&
      valor !== null &&
      ('formula' in valor || 'sharedFormula' in valor)
    );
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
      throw new Error(
        `Un mes calendario admite como máximo ${MAXIMO_SEMANAS_CALENDARIO} semanas; ${mes}/${anio} necesita ${cantidadSemanas}.`,
      );
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

  private normalizarTexto(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }
}
