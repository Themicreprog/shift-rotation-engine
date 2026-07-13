// src/infrastructure/excel/SheetClassifier.ts

import type { Worksheet, Row, CellValue } from 'exceljs';
import { TipoHoja } from './excel-types.js';

export class SheetClassifier {
  public clasificar(worksheet: Worksheet): TipoHoja {
    const primerasFilas = this.leerPrimerasFilasComoTexto(worksheet, 10);
    const hayCajeros = primerasFilas.some((valor: string) =>
      valor.toLowerCase().includes('cajeros'),
    );

    if (hayCajeros) return 'CAJA';

    if (this.haySemana(worksheet)) return 'PISTA';

    return 'AUXILIAR';
  }

  private leerPrimerasFilasComoTexto(
    worksheet: Worksheet,
    maxFilas: number,
  ): string[] {
    const textos: string[] = [];
    const limite = Math.min(maxFilas, worksheet.rowCount);

    for (let fila = 1; fila <= limite; fila += 1) {
      const row: Row = worksheet.getRow(fila);
      const valores = Array.isArray(row.values) ? row.values : [];
      for (const v of valores) {
        if (v == null) continue;
        textos.push(String(v).trim());
      }
    }

    return textos;
  }

  private haySemana(worksheet: Worksheet): boolean {
    const limiteFilas = Math.min(worksheet.rowCount, 200);

    for (let fila = 1; fila <= limiteFilas; fila += 1) {
      const row: Row = worksheet.getRow(fila);
      const valores = Array.isArray(row.values) ? row.values : [];
      const textos = valores
        .filter((v: CellValue | null | undefined): v is CellValue => v != null)
        .map((v: CellValue) => String(v).trim().toUpperCase());

      const tieneSemana = textos.some((texto: string) => texto.startsWith('SEMANA'));
      const tieneTurnoDia = textos.some((texto: string) => texto === 'TURNO/DIA');

      if (tieneSemana && tieneTurnoDia) return true;
    }

    return false;
  }
}