// src/infrastructure/excel/BlockExtractor.ts

import type { Worksheet, Row, Cell, CellValue } from 'exceljs';
import { RawAssignment, TipoBloqueExcel, WeekLayout } from './excel-types.js';

export class BlockExtractor {
  public extractAssignments(
    worksheet: Worksheet,
    layout: WeekLayout,
    esHojaDeCaja: boolean,
  ): RawAssignment[] {
    const asignaciones: RawAssignment[] = [];
    let bloqueActual: TipoBloqueExcel = 'DESCONOCIDO';

    for (let fila = layout.filaInicioDatos; fila <= layout.filaFinDatos; fila += 1) {
      const row: Row = worksheet.getRow(fila);
      const bloqueDetectado = this.detectarBloque(row);
      if (bloqueDetectado !== undefined) {
        bloqueActual = bloqueDetectado;
      }

      if (this.esFilaResumen(row)) {
        continue;
      }

      const estadoTexto = this.mapearEstadoDesdeBloque(bloqueActual);

      for (const diaCol of layout.columnasDias) {
        const cell = row.getCell(diaCol.columna);
        if (!this.esCeldaDato(cell)) continue;

        const texto = String(cell.value).trim();
        const nombres = esHojaDeCaja ? this.separarNombresPorComa(texto) : [texto];

        for (const nombre of nombres) {
          asignaciones.push({
            empleadoNombre: nombre,
            estadoTexto,
            semanaEtiqueta: layout.etiquetaSemana,
          });
        }
      }
    }

    return asignaciones;
  }

  private detectarBloque(row: Row): TipoBloqueExcel | undefined {
    const valores = Array.isArray(row.values) ? row.values : [];
    const textos = valores
      .filter((v: CellValue | null | undefined): v is CellValue => v != null)
      .map((v: CellValue) => String(v).trim().toUpperCase());

    if (textos.includes('TURNO A')) return 'TURNO_A';
    if (textos.includes('TURNO B')) return 'TURNO_B';
    if (textos.includes('LIBRE')) return 'LIBRE';
    if (textos.includes('FERIADO')) return 'FERIADO';
    if (textos.includes('VACACIONES')) return 'VACACIONES';
    if (textos.includes('OTRO')) return 'OTRO';
    return undefined;
  }

  private esFilaResumen(row: Row): boolean {
    const valores = Array.isArray(row.values) ? row.values : [];
    const textos = valores
      .filter((v: CellValue | null | undefined): v is CellValue => v != null)
      .map((v: CellValue) => String(v).trim().toUpperCase());

    const contieneCOUNTA = textos.some((t: string) => t.startsWith('=COUNTA('));
    const contieneCOUNTIF = textos.some((t: string) => t.startsWith('=COUNTIF('));
    const contieneQuincena =
      textos.some((t: string) => t.includes('PRIMERA QUINCENA')) ||
      textos.some((t: string) => t.includes('SEGUNDA QUINCENA'));

    return contieneCOUNTA || contieneCOUNTIF || contieneQuincena;
  }

  private esCeldaDato(cell: Cell): boolean {
    const value = cell.value;
    if (value == null) return false;

    if (typeof value === 'string') {
      const texto = value.trim();
      return texto.length > 0 && !texto.startsWith('=');
    }

    if (typeof value === 'object' && 'formula' in value) {
      return false;
    }

    return false;
  }

  private separarNombresPorComa(texto: string): string[] {
    return texto
      .split(',')
      .map((parte: string) => parte.trim())
      .filter((parte: string) => parte.length > 0);
  }

  private mapearEstadoDesdeBloque(bloque: TipoBloqueExcel): string {
    switch (bloque) {
      case 'TURNO_A':
        return 'TURNO A';
      case 'TURNO_B':
        return 'TURNO B';
      case 'LIBRE':
        return 'LIBRE';
      case 'FERIADO':
        return 'FERIADO';
      case 'VACACIONES':
        return 'VACACIONES';
      case 'OTRO':
      case 'DESCONOCIDO':
        return 'OTRO';
    }
  }
}