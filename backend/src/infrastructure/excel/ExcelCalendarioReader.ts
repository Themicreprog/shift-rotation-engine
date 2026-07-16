// src/infrastructure/excel/ExcelCalendarioReader.ts

import { Calendario } from '../../domain/Calendario.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { WorkbookLoader } from './WorkbookLoader.js';
import { SheetClassifier } from './SheetClassifier.js';
import { SheetReader } from './SheetReader.js';
import type { PeriodoExcel } from './excel-types.js';

export class ExcelCalendarioReader {
  constructor(
    private readonly loader = new WorkbookLoader(),
    private readonly classifier = new SheetClassifier(),
    private readonly sheetReader = new SheetReader(),
  ) {}

  public async leerCalendario(rutaArchivo: string): Promise<Calendario> {
    const workbook = await this.loader.cargar(rutaArchivo);
    const hojasOperativas = workbook.worksheets
      .map((worksheet) => ({
        worksheet,
        tipoHoja: this.classifier.clasificar(worksheet),
        periodo: this.sheetReader.extraerPeriodoDeclarado(worksheet),
      }))
      .filter(({ tipoHoja }) => tipoHoja !== 'AUXILIAR');
    const periodoObjetivo = this.seleccionarPeriodoObjetivo(
      hojasOperativas.flatMap(({ periodo }) =>
        periodo === null ? [] : [periodo],
      ),
    );
    const unidades = new Map<string, UnidadOperativa>();

    if (periodoObjetivo === null) {
      return new Calendario('Calendario desde Excel');
    }

    const hojasDelPeriodo = hojasOperativas.filter(
      ({ periodo }) =>
        periodo?.mes === periodoObjetivo.mes &&
        periodo.anio === periodoObjetivo.anio,
    );
    const fechaInicio = new Date(
      Date.UTC(periodoObjetivo.anio, periodoObjetivo.mes - 1, 1),
    );
    const finMesDeclarado = new Date(
      Date.UTC(periodoObjetivo.anio, periodoObjetivo.mes, 0),
    );
    const fechasFinDetectadas = hojasDelPeriodo.flatMap(({ worksheet }) => {
      const fecha = this.sheetReader.extraerFechaFinDetectada(
        worksheet,
        periodoObjetivo,
      );

      return fecha === null ? [] : [fecha];
    });
    const fechaFinComun =
      fechasFinDetectadas.length === 0
        ? finMesDeclarado.getTime()
        : Math.min(
            ...fechasFinDetectadas.map((fecha) => fecha.getTime()),
          );
    const fechaFin = new Date(
      Math.max(finMesDeclarado.getTime(), fechaFinComun),
    );
    const calendario = new Calendario('Calendario desde Excel', {
      mes: periodoObjetivo.mes,
      anio: periodoObjetivo.anio,
      fechaInicio,
      fechaFin,
    });

    for (const { worksheet, tipoHoja } of hojasDelPeriodo) {
      const unidad: UnidadOperativa | null =
        this.sheetReader.leerUnidadOperativa(
          worksheet,
          tipoHoja,
          periodoObjetivo,
          fechaFin,
        );

      if (unidad !== null) {
        const existente = unidades.get(unidad.nombre);

        if (
          existente === undefined ||
          unidad.cantidadEmpleados() > existente.cantidadEmpleados()
        ) {
          unidades.set(unidad.nombre, unidad);
        }
      }
    }

    for (const unidad of unidades.values()) {
      calendario.agregarUnidadOperativa(unidad);
    }

    return calendario;
  }

  private seleccionarPeriodoObjetivo(
    periodos: ReadonlyArray<PeriodoExcel>,
  ): PeriodoExcel | null {
    const conteos = new Map<
      string,
      { periodo: PeriodoExcel; cantidad: number }
    >();

    for (const periodo of periodos) {
      const clave = `${periodo.anio}-${periodo.mes}`;
      const conteo = conteos.get(clave);
      conteos.set(clave, {
        periodo,
        cantidad: (conteo?.cantidad ?? 0) + 1,
      });
    }

    let seleccionado: { periodo: PeriodoExcel; cantidad: number } | null = null;

    for (const candidato of conteos.values()) {
      const fechaCandidato =
        candidato.periodo.anio * 12 + candidato.periodo.mes;
      const fechaSeleccionada =
        seleccionado === null
          ? -1
          : seleccionado.periodo.anio * 12 + seleccionado.periodo.mes;

      if (
        seleccionado === null ||
        candidato.cantidad > seleccionado.cantidad ||
        (candidato.cantidad === seleccionado.cantidad &&
          fechaCandidato > fechaSeleccionada)
      ) {
        seleccionado = candidato;
      }
    }

    return seleccionado?.periodo ?? null;
  }
}
