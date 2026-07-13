// src/infrastructure/excel/WorkbookLoader.ts

import * as ExcelJS from 'exceljs';

export class WorkbookLoader {
  public async cargar(rutaArchivo: string): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(rutaArchivo);
    return workbook;
  }
}