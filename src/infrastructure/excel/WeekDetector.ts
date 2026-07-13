// src/infrastructure/excel/WeekDetector.ts

import type { Cell, Row, Worksheet } from 'exceljs';
import type { DiaColumna, WeekLayout } from './excel-types.js';

export class WeekDetector {
  public detect(worksheet: Worksheet): WeekLayout[] {
    const layouts: WeekLayout[] = [];

    for (let fila = 1; fila <= worksheet.rowCount; fila += 1) {
      const row = worksheet.getRow(fila);

      const columnaSemana = this.buscarColumnaSemana(row);
      const columnaTurnoDia = this.buscarColumnaTurnoDia(row);

      if (columnaSemana === null || columnaTurnoDia === null) {
        continue;
      }

      const etiquetaSemana = (row.getCell(columnaSemana).text ?? '').trim();

      const columnasDias = this.detectarColumnasDias(
        row,
        columnaTurnoDia + 1,
      );

      const filaInicioDatos = fila + 1;

      // Importante:
      // Se envía la fila del encabezado actual para no confundir
      // celdas fusionadas de esta misma semana con una semana nueva.
      const filaFinDatos = this.encontrarFinDeSemana(
        worksheet,
        filaInicioDatos,
        fila,
      );

      layouts.push({
        etiquetaSemana,
        filaEncabezado: fila,
        filaInicioDatos,
        filaFinDatos,
        columnasDias,
      });
    }

    return layouts;
  }

  private buscarColumnaSemana(row: Row): number | null {
    for (let columna = 1; columna <= row.cellCount; columna += 1) {
      const cell: Cell = row.getCell(columna);
      const texto = (cell.text ?? '').trim().toUpperCase();

      if (texto.startsWith('SEMANA')) {
        return columna;
      }
    }

    return null;
  }

  private buscarColumnaTurnoDia(row: Row): number | null {
    for (let columna = 1; columna <= row.cellCount; columna += 1) {
      const cell: Cell = row.getCell(columna);
      const texto = (cell.text ?? '').trim().toUpperCase();

      if (texto === 'TURNO/DIA') {
        return columna;
      }
    }

    return null;
  }

  private detectarColumnasDias(
    row: Row,
    columnaInicio: number,
  ): DiaColumna[] {
    const columnasDias: DiaColumna[] = [];

    for (
      let columna = columnaInicio;
      columna <= row.cellCount;
      columna += 1
    ) {
      const cell: Cell = row.getCell(columna);
      const texto = (cell.text ?? '').trim();

      if (texto.length === 0) {
        break;
      }

      columnasDias.push({
        encabezadoTexto: texto,
        columna,
      });
    }

    return columnasDias;
  }

  private encontrarFinDeSemana(
    worksheet: Worksheet,
    filaInicioDatos: number,
    filaEncabezadoActual: number,
  ): number {
    for (
      let fila = filaInicioDatos;
      fila <= worksheet.rowCount;
      fila += 1
    ) {
      const row = worksheet.getRow(fila);

      const esNuevaSemana = this.esFilaNuevaSemana(
        row,
        fila,
        filaEncabezadoActual,
      );

      if (esNuevaSemana || this.esFilaResumenQuincena(row)) {
        return fila - 1;
      }
    }

    return worksheet.rowCount;
  }

  private esFilaNuevaSemana(
    row: Row,
    filaActual: number,
    filaEncabezadoActual: number,
  ): boolean {
    // Una celda fusionada puede repetir "SEMANA 1" visualmente
    // en las filas debajo de su encabezado.
    //
    // Para cerrar una semana, exigimos que exista SEMANA y TURNO/DIA
    // en la misma fila; esa combinación corresponde al encabezado real
    // de una nueva semana.
    if (filaActual <= filaEncabezadoActual) {
      return false;
    }

    let contieneSemana = false;
    let contieneTurnoDia = false;

    for (let columna = 1; columna <= row.cellCount; columna += 1) {
      const cell: Cell = row.getCell(columna);
      const texto = (cell.text ?? '').trim().toUpperCase();

      if (texto.startsWith('SEMANA')) {
        contieneSemana = true;
      }

      if (texto === 'TURNO/DIA') {
        contieneTurnoDia = true;
      }
    }

    return contieneSemana && contieneTurnoDia;
  }

  private esFilaResumenQuincena(row: Row): boolean {
    for (let columna = 1; columna <= row.cellCount; columna += 1) {
      const cell: Cell = row.getCell(columna);
      const texto = (cell.text ?? '').trim().toUpperCase();

      if (
        texto.includes('PRIMERA QUINCENA') ||
        texto.includes('SEGUNDA QUINCENA')
      ) {
        return true;
      }
    }

    return false;
  }
}