import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { BlockExtractor } from '../../../src/infrastructure/excel/BlockExtractor.js';
import type { WeekLayout } from '../../../src/infrastructure/excel/excel-types.js';

describe('BlockExtractor - fechas de continuidad', () => {
  it('interpreta enero sin año como continuidad de diciembre del año siguiente', () => {
    const layout: WeekLayout = {
      etiquetaSemana: 'SEMANA 5',
      filaEncabezado: 1,
      filaInicioDatos: 2,
      filaFinDatos: 10,
      columnasDias: [
        { columna: 3, encabezadoTexto: 'Lunes 28/12' },
        { columna: 4, encabezadoTexto: 'Martes 29/12' },
        { columna: 5, encabezadoTexto: 'Mier. 30/12' },
        { columna: 6, encabezadoTexto: 'Jueves 31/12' },
        { columna: 7, encabezadoTexto: 'Viernes 1/1' },
        { columna: 8, encabezadoTexto: 'Sábado 2/1' },
        { columna: 9, encabezadoTexto: 'Domingo 3/1' },
      ],
    };

    const fechas = new BlockExtractor().extractDateColumns(layout, {
      mes: 12,
      anio: 2026,
    });

    expect(fechas.map(({ fecha }) => fecha)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('ignora bloques históricos y no acepta más que el derrame semanal inmediato', () => {
    const layout: WeekLayout = {
      etiquetaSemana: 'HISTÓRICO',
      filaEncabezado: 1,
      filaInicioDatos: 2,
      filaFinDatos: 10,
      columnasDias: [
        { columna: 3, encabezadoTexto: 'Lunes 1/4' },
        { columna: 4, encabezadoTexto: 'Sábado 1/8' },
        { columna: 5, encabezadoTexto: 'Sábado 8/8' },
      ],
    };

    const fechas = new BlockExtractor().extractDateColumns(layout, {
      mes: 7,
      anio: 2026,
    });

    expect(fechas.map(({ fecha }) => fecha)).toEqual(['2026-08-01']);
  });

  it('lee solo al trabajador activo de celdas richText en caja', () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet('CAJA CACAO');
    const layout = crearLayout(2, 3);

    worksheet.getCell('A2').value = 'TURNO A';
    worksheet.getCell('C2').value = {
      richText: [
        {
          text: 'Edwin',
          font: { bold: true, color: { argb: 'FF000000' } },
        },
        {
          text: '\nRony',
          font: {
            bold: false,
            size: 9,
            color: { argb: 'FF8A8A8A' },
          },
        },
      ],
    };
    worksheet.getCell('A3').value = 'TURNO B';
    worksheet.getCell('C3').value = {
      richText: [
        {
          text: 'Jeferson',
          font: { bold: true, color: { argb: 'FF000000' } },
        },
        {
          text: '\nDerlin',
          font: {
            bold: false,
            size: 9,
            color: { argb: 'FF8A8A8A' },
          },
        },
      ],
    };

    const asignaciones = new BlockExtractor().extractAssignments(
      worksheet,
      layout,
      true,
      { mes: 7, anio: 2026 },
    );

    expect(asignaciones.map(({ empleadoNombre, estadoTexto }) => ({
      empleadoNombre,
      estadoTexto,
    }))).toEqual([
      { empleadoNombre: 'Edwin', estadoTexto: 'TURNO A' },
      { empleadoNombre: 'Jeferson', estadoTexto: 'TURNO B' },
    ]);
  });

  it('normaliza formatos planos antiguos sin crear empleados fantasma', () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet('CAJA CACAO');
    const layout = crearLayout(2, 7);

    worksheet.getCell('A2').value = 'TURNO A';
    worksheet.getCell('C2').value = 'Natanael, Edwin (por Rony)';
    worksheet.getCell('A3').value = 'TURNO B';
    worksheet.getCell('C3').value = 'Jeferson\npor Derlin';
    worksheet.getCell('C3').font = { color: { theme: 2 } };
    worksheet.getCell('C4').value = 'Celio (cobertura adicional)';
    worksheet.getCell('C4').font = { color: { theme: 2 } };
    worksheet.getCell('C5').value = 'Rony';
    worksheet.getCell('C5').font = { color: { theme: 2 } };
    worksheet.getCell('C6').value = 'Edwin (en Caja)';
    worksheet.getCell('C7').value = 'Jeferson en Caja';

    const asignaciones = new BlockExtractor().extractAssignments(
      worksheet,
      layout,
      true,
      { mes: 7, anio: 2026 },
    );

    expect(asignaciones.map(({ empleadoNombre }) => empleadoNombre)).toEqual([
      'Natanael',
      'Edwin',
      'Jeferson',
      'Celio',
      'Edwin',
      'Jeferson',
    ]);
    expect(
      asignaciones.some(({ empleadoNombre }) =>
        /\bpor\b|cobertura adicional/iu.test(empleadoNombre),
      ),
    ).toBe(false);
  });
});

function crearLayout(filaInicio: number, filaFin: number): WeekLayout {
  return {
    etiquetaSemana: 'SEMANA 1',
    filaEncabezado: 1,
    filaInicioDatos: filaInicio,
    filaFinDatos: filaFin,
    columnasDias: [
      { columna: 3, encabezadoTexto: 'Mier. 1/7' },
    ],
  };
}
