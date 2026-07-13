// src/infrastructure/excel/ExcelReader.ts

import { Calendario } from '../../domain/Calendario.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { WorkbookLoader } from './WorkbookLoader.js';
import { SheetClassifier } from './SheetClassifier.js';
import { SheetReader } from './SheetReader.js';
import type { TipoHoja } from './excel-types.js';

export class ExcelReader {
  constructor(
    private readonly loader = new WorkbookLoader(),
    private readonly classifier = new SheetClassifier(),
    private readonly sheetReader = new SheetReader(),
  ) {}

  public async leerCalendario(rutaArchivo: string): Promise<Calendario> {
    const workbook = await this.loader.cargar(rutaArchivo);
    const calendario = new Calendario('Calendario desde Excel');

    workbook.eachSheet((worksheet) => {
      const tipoHoja: TipoHoja = this.classifier.clasificar(worksheet);
      const unidad: UnidadOperativa | null =
        this.sheetReader.leerUnidadOperativa(worksheet, tipoHoja);

      if (unidad !== null) {
        calendario.agregarUnidadOperativa(unidad);
      }
    });

    return calendario;
  }
}