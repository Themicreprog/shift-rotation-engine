import type {
  Cell,
  CellRichTextValue,
  CellValue,
  Row,
  Worksheet,
} from 'exceljs';

import type {
  FechaColumnaExcel,
  PeriodoExcel,
  RawAssignment,
  TipoBloqueExcel,
  WeekLayout,
} from './excel-types.js';

export class BlockExtractor {
  public extractAssignments(
    worksheet: Worksheet,
    layout: WeekLayout,
    esHojaDeCaja: boolean,
    periodo: PeriodoExcel,
  ): RawAssignment[] {
    const asignaciones: RawAssignment[] = [];
    let bloqueActual: TipoBloqueExcel = 'DESCONOCIDO';
    const columnasPeriodo = this.extractDateColumns(layout, periodo);

    for (
      let fila = layout.filaInicioDatos;
      fila <= layout.filaFinDatos;
      fila += 1
    ) {
      const row: Row = worksheet.getRow(fila);
      const bloqueDetectado = this.detectarBloque(row);

      if (bloqueDetectado !== undefined) {
        bloqueActual = bloqueDetectado;
      }

      if (this.esFilaResumen(row)) {
        continue;
      }

      const estadoTexto = this.mapearEstadoDesdeBloque(bloqueActual);

      for (const diaCol of columnasPeriodo) {
        const cell: Cell = row.getCell(diaCol.columna);
        const nombres = this.extraerNombres(cell, esHojaDeCaja);

        for (const nombre of nombres) {
          asignaciones.push({
            empleadoNombre: nombre,
            estadoTexto,
            semanaEtiqueta: layout.etiquetaSemana,
            dia: diaCol.dia,
            mes: diaCol.mes,
            anio: diaCol.anio,
            fecha: diaCol.fecha,
          });
        }
      }
    }

    return asignaciones;
  }

  public extractDateColumns(
    layout: WeekLayout,
    periodo: PeriodoExcel,
  ): FechaColumnaExcel[] {
    return layout.columnasDias
      .map((dia) =>
        this.extraerFecha(dia.encabezadoTexto, dia.columna, periodo),
      )
      .filter((dia): dia is FechaColumnaExcel => dia !== null);
  }

  private detectarBloque(row: Row): TipoBloqueExcel | undefined {
    const valores = Array.isArray(row.values) ? row.values : [];
    const textos = valores
      .filter(
        (valor: CellValue | null | undefined): valor is CellValue =>
          valor !== null && valor !== undefined,
      )
      .map((valor) => String(valor).trim().toUpperCase());

    if (textos.includes('TURNO A')) return 'TURNO_A';
    if (textos.includes('TURNO B')) return 'TURNO_B';
    if (textos.includes('LIBRE')) return 'LIBRE';
    if (textos.includes('FERIADO')) return 'FERIADO';
    if (textos.includes('VACACIONES')) return 'VACACIONES';
    if (textos.includes('OTRO')) return 'OTRO';

    return undefined;
  }

  private esFilaResumen(row: Row): boolean {
    const textos = this.obtenerTextosDeFila(row).map((texto) =>
      texto.toUpperCase(),
    );

    return (
      textos.some((texto) => texto.startsWith('=COUNTA(')) ||
      textos.some((texto) => texto.startsWith('=COUNTIF(')) ||
      textos.some(
        (texto) =>
          texto.includes('PRIMERA QUINCENA') ||
          texto.includes('SEGUNDA QUINCENA'),
      )
    );
  }

  private extraerFecha(
    encabezado: string,
    columna: number,
    periodo: PeriodoExcel,
  ): FechaColumnaExcel | null {
    const coincidencia = encabezado.match(
      /\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/,
    );

    if (coincidencia === null) return null;

    const dia = Number(coincidencia[1]);
    const mes = Number(coincidencia[2]);
    const anioEnEncabezado = coincidencia[3];
    const periodoSiguiente = this.siguientePeriodo(periodo);
    const anio =
      anioEnEncabezado === undefined
        ? mes === periodoSiguiente.mes
          ? periodoSiguiente.anio
          : periodo.anio
        : this.normalizarAnio(Number(anioEnEncabezado));
    const perteneceAlMesDeclarado =
      mes === periodo.mes && anio === periodo.anio;
    const perteneceAlMesSiguiente =
      mes === periodoSiguiente.mes &&
      anio === periodoSiguiente.anio &&
      dia <= 7;

    if (!perteneceAlMesDeclarado && !perteneceAlMesSiguiente) return null;

    const diasEnMes = new Date(anio, mes, 0).getDate();

    if (dia < 1 || dia > diasEnMes) return null;

    return {
      columna,
      dia,
      mes,
      anio,
      fecha: `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
    };
  }

  private normalizarAnio(anio: number): number {
    return anio < 100 ? 2000 + anio : anio;
  }

  private siguientePeriodo(periodo: PeriodoExcel): PeriodoExcel {
    return periodo.mes === 12
      ? { mes: 1, anio: periodo.anio + 1 }
      : { mes: periodo.mes + 1, anio: periodo.anio };
  }

  private extraerNombres(cell: Cell, esHojaDeCaja: boolean): string[] {
    const textoOriginal = this.extraerTextoCelda(cell);

    if (textoOriginal === null) return [];

    if (
      this.esAsignacionAtenuada(cell) &&
      !this.contieneMetadatosReemplazo(textoOriginal)
    ) {
      return [];
    }

    const texto = this.extraerTextoActivo(textoOriginal);

    if (texto.length === 0 || texto.startsWith('=')) {
      return [];
    }

    const candidatos = esHojaDeCaja ? this.separarNombresPorComa(texto) : [texto];

    return candidatos
      .map((nombre) => nombre.replace(/\s+/g, ' ').trim())
      .filter((nombre) => this.esNombreEmpleadoValido(nombre));
  }

  private extraerTextoCelda(cell: Cell): string | null {
    const valor = cell.value;

    if (typeof valor === 'string') return valor;

    if (this.esValorRichText(valor)) {
      return valor.richText.map(({ text }) => text).join('');
    }

    return null;
  }

  private extraerTextoActivo(texto: string): string {
    const primeraLinea = texto.replace(/\r/g, '').split('\n', 1)[0] ?? '';

    return primeraLinea
      .replace(/\s*\(\s*en\s+caja\s*\)\s*/giu, ' ')
      .replace(/\s+en\s+caja\s*$/iu, '')
      .replace(/\s*\(\s*por\s+[^)]*\)\s*/giu, ' ')
      .replace(/\s*\(\s*cobertura\s+adicional\s*\)\s*/giu, ' ')
      .replace(/\s+cobertura\s+adicional\s*$/iu, '')
      .replace(
        /\s+por\s+[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/iu,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private contieneMetadatosReemplazo(texto: string): boolean {
    return /\bpor\b|\bcobertura\s+adicional\b/iu.test(texto);
  }

  private esValorRichText(
    valor: CellValue | null,
  ): valor is CellRichTextValue {
    return (
      typeof valor === 'object' &&
      valor !== null &&
      'richText' in valor &&
      Array.isArray(valor.richText)
    );
  }

  private esNombreEmpleadoValido(nombre: string): boolean {
    if (
      nombre.length < 2 ||
      nombre.length > 80 ||
      !/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u.test(nombre)
    ) {
      return false;
    }

    const normalizado = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    return ![
      'TURNO A',
      'TURNO B',
      'TURNO/DIA',
      'LIBRE',
      'FERIADO',
      'VACACIONES',
      'OTRO',
      'TOTAL',
      'TOMADO',
      'CAJEROS',
    ].includes(normalizado);
  }

  private separarNombresPorComa(texto: string): string[] {
    return texto
      .split(/[,/]/)
      .map((nombre) => nombre.trim())
      .filter((nombre) => nombre.length > 0);
  }

  private esAsignacionAtenuada(cell: Cell): boolean {
    const valor = cell.value;

    if (this.esValorRichText(valor)) {
      for (const fragmento of valor.richText) {
        const textoPrimeraLinea = fragmento.text.split(/\r?\n/, 1)[0] ?? '';

        if (textoPrimeraLinea.trim().length > 0) {
          const color = fragmento.font?.color ?? cell.font?.color;

          return color?.theme === 2;
        }

        if (/\r?\n/.test(fragmento.text)) break;
      }
    }

    const color = cell.font?.color;

    // En los calendarios reales, el tema 2 se usa para dejar visible pero
    // atenuado al titular que fue reemplazado. No debe contarse como la
    // asignacion operativa vigente al reconstruir la continuidad.
    return color?.theme === 2;
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
      const texto = (row.getCell(columna).text ?? '').trim();

      if (texto.length > 0) {
        textos.push(texto);
      }
    }

    return textos;
  }
}
