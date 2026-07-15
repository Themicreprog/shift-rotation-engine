// src/infrastructure/excel/BlockExtractor.ts

import type { Cell, CellValue, Row, Worksheet } from 'exceljs';
import type {
  RawAssignment,
  TipoBloqueExcel,
  WeekLayout,
} from './excel-types.js';

export class BlockExtractor {
  public extractAssignments(
    worksheet: Worksheet,
    layout: WeekLayout,
    esHojaDeCaja: boolean,
  ): RawAssignment[] {
    const asignaciones: RawAssignment[] = [];
    let bloqueActual: TipoBloqueExcel = 'DESCONOCIDO';

    const esDebugCacaoSemana1 =
      worksheet.name === 'CACAO 1' &&
      layout.etiquetaSemana.trim().toUpperCase() === 'SEMANA 1';

    if (esDebugCacaoSemana1) {
      console.log('──────────────────────────────────────────────');
      console.log(
        `[DEBUG BlockExtractor] Hoja="${worksheet.name}" Semana="${layout.etiquetaSemana}"`,
      );
      console.log(
        `[DEBUG BlockExtractor] Rango de filas: ${layout.filaInicioDatos} hasta ${layout.filaFinDatos}`,
      );
      console.log(
        `[DEBUG BlockExtractor] Columnas de días detectadas: ${layout.columnasDias
          .map(
            (dia) =>
              `${dia.columna}:${dia.encabezadoTexto}`,
          )
          .join(' | ')}`,
      );
      console.log('──────────────────────────────────────────────');
    }

    for (
      let fila = layout.filaInicioDatos;
      fila <= layout.filaFinDatos;
      fila += 1
    ) {
      const row: Row = worksheet.getRow(fila);

      const bloqueDetectado = this.detectarBloque(row);

      if (bloqueDetectado !== undefined) {
        bloqueActual = bloqueDetectado;

        if (esDebugCacaoSemana1) {
          console.log(
            `[DEBUG Bloque] fila=${fila} bloqueActual=${bloqueActual}`,
          );
        }
      }

      if (this.esFilaResumen(row)) {
        if (esDebugCacaoSemana1) {
          console.log(`[DEBUG Resumen] fila=${fila} omitida`);
        }
        continue;
      }

      const estadoTexto = this.mapearEstadoDesdeBloque(bloqueActual);

      for (const diaCol of layout.columnasDias) {
        const cell: Cell = row.getCell(diaCol.columna);
        const textoCrudo = (cell.text ?? '').trim();
        const esDato = this.esCeldaDato(cell);

        if (esDebugCacaoSemana1 && textoCrudo.length > 0) {
          console.log(
            `[DEBUG Celda] fila=${fila} col=${diaCol.columna} dia="${diaCol.encabezadoTexto}" texto="${textoCrudo}" aceptada=${esDato} bloque=${bloqueActual}`,
          );
        }

        if (!esDato) {
          continue;
        }

        const nombres = esHojaDeCaja
          ? this.separarNombresPorComa(textoCrudo)
          : [textoCrudo];

        for (const nombre of nombres) {
          asignaciones.push({
            empleadoNombre: nombre,
            estadoTexto,
            semanaEtiqueta: layout.etiquetaSemana,
          });

          if (esDebugCacaoSemana1) {
            console.log(
              `[DEBUG Asignación creada] empleado="${nombre}" estado="${estadoTexto}"`,
            );
          }
        }
      }
    }

    if (esDebugCacaoSemana1) {
      console.log(
        `[DEBUG Resultado] RawAssignment creados: ${asignaciones.length}`,
      );
      console.log('──────────────────────────────────────────────');
    }

    return asignaciones;
  }

  private detectarBloque(row: Row): TipoBloqueExcel | undefined {
    const valores = Array.isArray(row.values) ? row.values : [];

    const textos = valores
      .filter(
        (valor: CellValue | null | undefined): valor is CellValue =>
          valor !== null && valor !== undefined,
      )
      .map((valor: CellValue) => String(valor).trim().toUpperCase());

    if (textos.includes('TURNO A')) {
      return 'TURNO_A';
    }

    if (textos.includes('TURNO B')) {
      return 'TURNO_B';
    }

    if (textos.includes('LIBRE')) {
      return 'LIBRE';
    }

    if (textos.includes('FERIADO')) {
      return 'FERIADO';
    }

    if (textos.includes('VACACIONES')) {
      return 'VACACIONES';
    }

    if (textos.includes('OTRO')) {
      return 'OTRO';
    }

    return undefined;
  }

  private esFilaResumen(row: Row): boolean {
    const textos = this.obtenerTextosDeFila(row).map((texto) =>
      texto.toUpperCase(),
    );

    const contieneCOUNTA = textos.some((texto) =>
      texto.startsWith('=COUNTA('),
    );

    const contieneCOUNTIF = textos.some((texto) =>
      texto.startsWith('=COUNTIF('),
    );

    const contieneResumenQuincena = textos.some(
      (texto) =>
        texto.includes('PRIMERA QUINCENA') ||
        texto.includes('SEGUNDA QUINCENA'),
    );

    return contieneCOUNTA || contieneCOUNTIF || contieneResumenQuincena;
  }

  private esCeldaDato(cell: Cell): boolean {
    const texto = (cell.text ?? '').trim();

    if (texto.length === 0) {
      return false;
    }

    if (texto.startsWith('=')) {
      return false;
    }

    return true;
  }

  private separarNombresPorComa(texto: string): string[] {
    return texto
      .split(',')
      .map((nombre) => nombre.trim())
      .filter((nombre) => nombre.length > 0);
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

  private obtenerTextosDeFila(row: Row): string[] {
    const textos: string[] = [];

    for (let columna = 1; columna <= row.cellCount; columna += 1) {
      const cell: Cell = row.getCell(columna);
      const texto = (cell.text ?? '').trim();

      if (texto.length > 0) {
        textos.push(texto);
      }
    }

    return textos;
  }
}