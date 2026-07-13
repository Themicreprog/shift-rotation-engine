import type { Workbook, Worksheet } from 'exceljs';
import * as ExcelJS from 'exceljs';
import { Calendario } from '../../domain/Calendario.js';
import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';

/**
 * ExcelCalendarioReader
 *
 * Responsabilidad única: transformar un archivo Excel (.xlsx) en un
 * objeto `Calendario` del dominio.
 *
 * No contiene reglas de negocio, no valida datos operativos, no corrige
 * información y no modifica el archivo original. Únicamente traduce la
 * estructura tabular de cada hoja hacia las clases del dominio ya
 * aprobadas (`Calendario`, `UnidadOperativa`, `Empleado`, `EstadoTurno`).
 *
 * LIMITACIÓN TEMPORAL (pendiente de definición del negocio):
 * Se asume que cada hoja del workbook representa una `UnidadOperativa`,
 * que la primera fila es un encabezado de días y que la primera columna
 * de cada fila de empleado contiene su nombre. Esta convención mínima
 * es una decisión temporal para poder construir el modelo; deberá
 * confirmarse o ajustarse cuando se defina el formato oficial de los
 * archivos reales de la empresa.
 */
export class ExcelCalendarioReader {
  public async leer(rutaArchivo: string): Promise<Calendario> {
    const workbook = await this.abrirWorkbook(rutaArchivo);
    const nombreCalendario = this.obtenerNombreCalendario(rutaArchivo);
    const unidadesOperativas = workbook.worksheets.map((hoja) => this.construirUnidadOperativa(hoja));

    return Calendario.create({ nombre: nombreCalendario, unidadesOperativas });
  }

  private async abrirWorkbook(rutaArchivo: string): Promise<Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(rutaArchivo);
    return workbook;
  }

  private obtenerNombreCalendario(rutaArchivo: string): string {
    const segmentos = rutaArchivo.split(/[/\\]/);
    const archivo = segmentos[segmentos.length - 1] ?? rutaArchivo;
    return archivo.replace(/\.xlsx$/i, '');
  }

  private construirUnidadOperativa(hoja: Worksheet): UnidadOperativa {
    const empleados = this.extraerEmpleados(hoja);
    return UnidadOperativa.create({ nombre: hoja.name, empleados });
  }

  private extraerEmpleados(hoja: Worksheet): Empleado[] {
    const empleados: Empleado[] = [];
    const totalFilas = hoja.rowCount;

    for (let numeroFila = 2; numeroFila <= totalFilas; numeroFila += 1) {
      const fila = hoja.getRow(numeroFila);
      const nombreEmpleado = this.leerNombreEmpleado(fila);

      if (nombreEmpleado === undefined) {
        continue;
      }

      const estadosPorDia = this.leerEstadosDeFila(fila);
      empleados.push(Empleado.create({ nombre: nombreEmpleado, estadosPorDia }));
    }

    return empleados;
  }

  private leerNombreEmpleado(fila: ExcelJS.Row): string | undefined {
    const valorCelda = fila.getCell(1).value;

    if (valorCelda === null || valorCelda === undefined) {
      return undefined;
    }

    const nombre = String(valorCelda).trim();
    return nombre.length > 0 ? nombre : undefined;
  }

  private leerEstadosDeFila(fila: ExcelJS.Row): EstadoTurno[] {
    const estados: EstadoTurno[] = [];
    const totalColumnas = fila.cellCount;

    for (let numeroColumna = 2; numeroColumna <= totalColumnas; numeroColumna += 1) {
      const valorCelda = fila.getCell(numeroColumna).value;

      if (valorCelda === null || valorCelda === undefined) {
        continue;
      }

      const texto = String(valorCelda).trim();

      if (texto.length === 0) {
        continue;
      }

      estados.push(EstadoTurno.create(texto));
    }

    return estados;
  }
}