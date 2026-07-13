// src/infrastructure/excel/WeekDetector.ts

import type { Worksheet, Row, CellValue } from 'exceljs';
import { DiaColumna, WeekLayout } from './excel-types.js';

export class WeekDetector {
  public detect(worksheet: Worksheet): WeekLayout[] {
    const layouts: WeekLayout[] = [];
    const ultimaFila = worksheet.rowCount;

    for (let fila = 1; fila <= ultimaFila; fila += 1) {
      const row: Row = worksheet.getRow(fila);
      const valores = Array.isArray(row.values) ? row.values : [];
      const textos = valores
        .filter((v: CellValue | null | undefined): v is CellValue => v != null)
        .map((v: CellValue) => String(v).trim());

      const indiceSemana = textos.findIndex((t: string) =>
        t.toUpperCase().startsWith('SEMANA'),
      );
      const indiceTurnoDia = textos.findIndex(
        (t: string) => t.toUpperCase() === 'TURNO/DIA',
      );

      if (indiceSemana !== -1 && indiceTurnoDia !== -1) {
        const etiquetaSemana = textos[indiceSemana] ?? '';
        const columnasDias = this.detectarColumnasDias(row, indiceTurnoDia + 1);

        const filaEncabezado = fila;
        const filaInicioDatos = fila + 1;
        const filaFinDatos = this.encontrarFinDeSemana(worksheet, filaInicioDatos);

        layouts.push({
          etiquetaSemana,
          filaEncabezado,
          filaInicioDatos,
          filaFinDatos,
          columnasDias,
        });
      }
    }

    return layouts;
  }

  private detectarColumnasDias(row: Row, inicioColumna: number): DiaColumna[] {
    const columnas: DiaColumna[] = [];
    const ultimaColumna = row.cellCount;

    for (let col = inicioColumna; col <= ultimaColumna; col += 1) {
      const cell = row.getCell(col);
      const valor = cell.value;

      if (valor == null) {
        break;
      }

      const texto = String(valor).trim();
      if (texto.length === 0) {
        break;
      }

      columnas.push({ encabezadoTexto: texto, columna: col });
    }

    return columnas;
  }

  private encontrarFinDeSemana(worksheet: Worksheet, filaInicioDatos: number): number {
    const ultimaFila = worksheet.rowCount;
    let fila = filaInicioDatos;

    while (fila <= ultimaFila) {
      const row: Row = worksheet.getRow(fila);
      const valores = Array.isArray(row.values) ? row.values : [];
      const textos = valores
        .filter((v: CellValue | null | undefined): v is CellValue => v != null)
        .map((v: CellValue) => String(v).trim().toUpperCase());

      const esNuevaSemana = textos.some((t: string) => t.startsWith('SEMANA'));
      const esTablaQuincena =
        textos.some((t: string) => t.includes('PRIMERA QUINCENA')) ||
        textos.some((t: string) => t.includes('SEGUNDA QUINCENA'));

      if (esNuevaSemana || esTablaQuincena) {
        return fila - 1;
      }

      fila += 1;
    }

    return ultimaFila;
  }
}