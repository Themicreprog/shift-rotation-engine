import path from 'node:path';

import ExcelJS from 'exceljs';
import type { CellValue, RichText } from 'exceljs';
import { describe, expect, it } from 'vitest';

import { Calendario } from '../../src/domain/Calendario.js';
import { Empleado } from '../../src/domain/Empleado.js';
import { EstadoTurno } from '../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../src/domain/UnidadOperativa.js';
import { ReemplazoPlanificacion } from '../../src/domain/planning/ReemplazoPlanificacion.js';
import { ExcelCalendarioReader } from '../../src/infrastructure/excel/ExcelCalendarioReader.js';
import { ExcelCalendarioWriter } from '../../src/infrastructure/excel/ExcelCalendarioWriter.js';

const rutaPlantilla = path.resolve(__dirname, '../fixtures/turnos-de-julio-pero-limpios-3.xlsx');

function crearEmpleado(nombre: string, estado: string): Empleado {
  return Empleado.create({
    nombre,
    estadosPorDia: Array.from({ length: 31 }, () => EstadoTurno.create(estado)),
  });
}

function crearCalendario(
  opciones: { jefersonEnCaja?: boolean } = {},
): Calendario {
  const calendario = new Calendario('Julio 2026');

  calendario.agregarUnidadOperativa(
    UnidadOperativa.create({
      nombre: 'CACAO PISTA',
      empleados: [
        crearEmpleado('Mario', 'TURNO A'),
        crearEmpleado('Jose', 'TURNO B'),
        crearEmpleado('Edwin', 'LIBRE'),
        crearEmpleado('Rene', 'FERIADO'),
        crearEmpleado('Luis D', 'VACACIONES'),
      ],
    }),
  );
  calendario.agregarUnidadOperativa(
    UnidadOperativa.create({
      nombre: 'CACAO CAJA',
      empleados: [
        crearEmpleado('Natanael', 'TURNO A'),
        crearEmpleado('Edwin', 'TURNO A'),
        crearEmpleado('Rony', 'TURNO B'),
        crearEmpleado('Celio', 'OTRO'),
      ],
    }),
  );
  calendario.agregarUnidadOperativa(
    UnidadOperativa.create({
      nombre: 'TRUCK STOP PISTA',
      empleados: [
        crearEmpleado('Jeferson', 'TURNO A'),
        crearEmpleado('Milton', 'TURNO B'),
        crearEmpleado('Hector', 'LIBRE'),
        crearEmpleado('Saudy', 'FERIADO'),
        crearEmpleado('Evin', 'VACACIONES'),
      ],
    }),
  );
  calendario.agregarUnidadOperativa(
    UnidadOperativa.create({
      nombre: 'TRUCK STOP CAJA',
      empleados: opciones.jefersonEnCaja
        ? [
            crearEmpleado('Norlan', 'TURNO A'),
            crearEmpleado('Derlin', 'LIBRE'),
            crearEmpleado('Jeferson', 'TURNO B'),
            crearEmpleado('Lester', 'OTRO'),
          ]
        : [
            crearEmpleado('Norlan', 'TURNO A'),
            crearEmpleado('Derlin', 'TURNO B'),
            crearEmpleado('Lester', 'OTRO'),
          ],
    }),
  );

  return calendario;
}

function contarFormulas(workbook: ExcelJS.Workbook): number {
  let formulas = 0;

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const valor = cell.value;

        if (
          typeof valor === 'object' &&
          valor !== null &&
          ('formula' in valor || 'sharedFormula' in valor)
        ) {
          formulas += 1;
        }
      });
    });
  }

  return formulas;
}

function contarNotas(workbook: ExcelJS.Workbook): number {
  let notas = 0;

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.note !== undefined) notas += 1;
      });
    });
  }

  return notas;
}

function obtenerRichText(valor: CellValue): RichText[] {
  if (
    typeof valor !== 'object' ||
    valor === null ||
    !('richText' in valor) ||
    !Array.isArray(valor.richText)
  ) {
    throw new Error('Se esperaba una celda con richText.');
  }

  return valor.richText;
}

describe('ExcelCalendarioWriter con plantilla real', () => {
  it('genera un Buffer limpio conservando las cuatro hojas, estados y formato', async () => {
    const plantilla = new ExcelJS.Workbook();
    await plantilla.xlsx.readFile(rutaPlantilla);
    const anchoOriginal = plantilla.getWorksheet('CACAO C1')?.getColumn(5).width;

    const writer = new ExcelCalendarioWriter();
    const buffer = await writer.escribirCalendario(crearCalendario(), {
      rutaPlantilla,
      mes: 7,
      anio: 2026,
      reemplazos: [
        ReemplazoPlanificacion.create({
          unidadOperativa: 'CACAO PISTA',
          dia: 1,
          turno: 'TURNO A',
          empleadoTitular: 'Rene',
          empleadoReemplazo: 'Mario',
          tipoCobertura: 'COMODIN',
          motivo: 'FERIADO',
        }),
        ReemplazoPlanificacion.create({
          unidadOperativa: 'CACAO CAJA',
          dia: 1,
          turno: 'TURNO A',
          empleadoTitular: 'Celio',
          empleadoReemplazo: 'Edwin',
          tipoCobertura: 'FLEXIBLE',
          motivo: 'FALTANTE',
        }),
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);

    const resultado = new ExcelJS.Workbook();
    const contenido = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    await resultado.xlsx.load(contenido);

    expect(resultado.worksheets.map(({ name }) => name)).toEqual([
      'CACAO C1',
      'CAJA CACAO',
      'TRUCK STOP',
      'CAJA TRUCK STOP',
    ]);
    expect(resultado.getWorksheet('CACAO 1')).toBeUndefined();
    expect(contarFormulas(resultado)).toBe(0);
    expect(contarNotas(resultado)).toBe(0);

    const cacaoPista = resultado.getWorksheet('CACAO C1');
    const cacaoCaja = resultado.getWorksheet('CAJA CACAO');
    const truckPista = resultado.getWorksheet('TRUCK STOP');
    const truckCaja = resultado.getWorksheet('CAJA TRUCK STOP');

    expect(cacaoPista?.getCell('B3').text).toBe('Cuadro de Turnos mes de Julio 2026');
    expect(cacaoPista?.getCell('C32').text).toBe('Lunes 29/6');
    expect(cacaoPista?.getCell('E32').text).toBe('Mier. 1/7');
    expect(cacaoCaja?.getCell('D7').text).toBe('Lunes 29/6');
    expect(cacaoCaja?.getCell('F7').text).toBe('Mier. 1/7');

    expect(cacaoPista?.getCell('E33').text).toBe('Mario\nRene');
    const reemplazoPista = obtenerRichText(
      cacaoPista?.getCell('E33').value ?? null,
    );

    expect(reemplazoPista).toHaveLength(2);
    expect(reemplazoPista[0]).toMatchObject({
      text: 'Mario',
      font: { bold: true, color: { argb: 'FF000000' } },
    });
    expect(reemplazoPista[1]).toMatchObject({
      text: '\nRene',
      font: { color: { argb: 'FF8A8A8A' } },
    });
    expect(reemplazoPista[1]?.font?.bold ?? false).toBe(false);
    expect(reemplazoPista[1]?.font?.size).toBeLessThan(
      reemplazoPista[0]?.font?.size ?? Number.POSITIVE_INFINITY,
    );
    expect(cacaoPista?.getCell('E33').fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFCE4D6' },
    });
    expect(cacaoPista?.getCell('E33').note).toBeUndefined();
    expect(cacaoPista?.getCell('E33').alignment?.wrapText).toBe(true);
    expect(cacaoPista?.getRow(33).height).toBeGreaterThanOrEqual(30);
    expect(cacaoPista?.getCell('E43').text).toBe('Jose');
    expect(cacaoPista?.getCell('E38').text).toBe('Edwin');
    expect(cacaoPista?.getCell('E40').text).toBe('Rene');
    expect(cacaoPista?.getCell('E42').text).toBe('Luis D');
    expect(cacaoCaja?.getCell('F8').text).toBe('Natanael, Edwin\nCelio');
    const reemplazoCaja = obtenerRichText(
      cacaoCaja?.getCell('F8').value ?? null,
    );

    expect(reemplazoCaja).toHaveLength(2);
    expect(reemplazoCaja[0]).toMatchObject({
      text: 'Natanael, Edwin',
      font: { bold: true, color: { argb: 'FF000000' } },
    });
    expect(reemplazoCaja[1]).toMatchObject({
      text: '\nCelio',
      font: { color: { argb: 'FF8A8A8A' } },
    });
    expect(reemplazoCaja[1]?.font?.bold ?? false).toBe(false);
    expect(cacaoCaja?.getCell('F8').fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFCE4D6' },
    });
    expect(cacaoCaja?.getCell('F8').note).toBeUndefined();
    expect(cacaoCaja?.getCell('F13').text).toBe('Rony');
    expect(cacaoCaja?.getCell('F9').text).toBe('Celio');
    expect(truckPista?.getCell('E30').text).toBe('Jeferson');
    expect(truckCaja?.getCell('F8').text).toBe('Norlan');
    expect(truckCaja?.getCell('F13').text).toBe('Derlin');
    expect(truckCaja?.getCell('F9').text).toBe('Lester');

    expect(cacaoPista?.getCell('B3').isMerged).toBe(true);
    expect(cacaoPista?.getCell('B3').master.address).toBe('B3');
    expect(cacaoPista?.getCell('A32').isMerged).toBe(true);
    expect(cacaoPista?.getCell('A32').alignment?.textRotation).toBe(90);
    expect(cacaoPista?.getCell('E32').font?.bold).toBe(true);
    expect(cacaoPista?.getCell('E32').border?.top?.style).toBe('thin');
    expect(cacaoPista?.getCell('I43').fill).toMatchObject({
      type: 'pattern',
      pattern: 'none',
    });
    expect(cacaoPista?.getCell('E43').font?.color).toEqual({
      argb: 'FF000000',
    });
    expect(cacaoPista?.getColumn(5).width).toBe(anchoOriginal);
    expect(cacaoPista?.getRow(8).hidden).toBe(true);
    expect(cacaoPista?.getRow(32).hidden).toBe(false);
  });

  it('genera la sexta semana de agosto clonando formato y fusiones del último bloque', async () => {
    const writer = new ExcelCalendarioWriter();
    const buffer = await writer.escribirCalendario(crearCalendario(), {
      rutaPlantilla,
      mes: 8,
      anio: 2026,
    });
    const resultado = new ExcelJS.Workbook();
    const contenido = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    await resultado.xlsx.load(contenido);

    expect(resultado.worksheets.map(({ name }) => name)).toEqual([
      'CACAO C1',
      'CAJA CACAO',
      'TRUCK STOP',
      'CAJA TRUCK STOP',
    ]);
    expect(contarFormulas(resultado)).toBe(0);

    const cacaoPista = resultado.getWorksheet('CACAO C1');
    const cacaoCaja = resultado.getWorksheet('CAJA CACAO');
    const truckPista = resultado.getWorksheet('TRUCK STOP');
    const truckCaja = resultado.getWorksheet('CAJA TRUCK STOP');

    expect(cacaoPista?.getCell('B3').text).toBe('Cuadro de Turnos mes de Agosto 2026');
    expect(cacaoPista?.getCell('A144').text).toBe('SEMANA 6');
    expect(cacaoPista?.getCell('C144').text).toBe('Lunes 31/8');
    expect(cacaoPista?.getCell('C145').text).toBe('Mario');
    expect(cacaoPista?.getCell('A144').isMerged).toBe(true);
    expect(cacaoPista?.getCell('A144').master.address).toBe('A144');
    expect(cacaoPista?.getCell('A144').alignment?.textRotation).toBe(90);
    expect(cacaoPista?.getCell('C144').font?.bold).toBe(true);
    expect(cacaoPista?.getCell('C144').border?.top?.style).toBe('thin');

    expect(cacaoCaja?.getCell('A70').text).toBe('SEMANA 6');
    expect(cacaoCaja?.getCell('D70').text).toBe('Lunes 31/8');
    expect(cacaoCaja?.getCell('D71').text).toBe('Natanael, Edwin');
    expect(cacaoCaja?.getCell('A70').isMerged).toBe(true);

    expect(truckPista?.getCell('A132').text).toBe('SEMANA 6');
    expect(truckPista?.getCell('C132').text).toBe('Lunes 31/8');
    expect(truckPista?.getCell('C133').text).toBe('Jeferson');
    expect(truckPista?.getCell('A132').isMerged).toBe(true);

    expect(truckCaja?.getCell('A78').text).toBe('SEMANA 6');
    expect(truckCaja?.getCell('D78').text).toBe('Lunes 31/8');
    expect(truckCaja?.getCell('D79').text).toBe('Norlan');
    expect(truckCaja?.getCell('A78').isMerged).toBe(true);
  });

  it('vuelve a importar el Excel generado sin nombres fantasma ni perder flexibles de caja', async () => {
    const writer = new ExcelCalendarioWriter();
    const buffer = await writer.escribirCalendario(
      crearCalendario({ jefersonEnCaja: true }),
      {
        rutaPlantilla,
        mes: 7,
        anio: 2026,
        reemplazos: [
          ReemplazoPlanificacion.create({
            unidadOperativa: 'CACAO PISTA',
            dia: 1,
            turno: 'TURNO A',
            empleadoTitular: 'Rene',
            empleadoReemplazo: 'Mario',
            tipoCobertura: 'BASE',
            motivo: 'FERIADO',
          }),
          ReemplazoPlanificacion.create({
            unidadOperativa: 'CACAO CAJA',
            dia: 1,
            turno: 'TURNO A',
            empleadoTitular: 'Celio',
            empleadoReemplazo: 'Edwin',
            tipoCobertura: 'FLEXIBLE',
            motivo: 'DESCANSO',
          }),
          ReemplazoPlanificacion.create({
            unidadOperativa: 'TRUCK STOP CAJA',
            dia: 1,
            turno: 'TURNO B',
            empleadoTitular: 'Derlin',
            empleadoReemplazo: 'Jeferson',
            tipoCobertura: 'FLEXIBLE',
            motivo: 'DESCANSO',
          }),
          ReemplazoPlanificacion.create({
            unidadOperativa: 'TRUCK STOP PISTA',
            dia: 1,
            turno: 'TURNO A',
            empleadoTitular: null,
            empleadoReemplazo: 'Jeferson',
            tipoCobertura: 'BASE',
            motivo: 'FALTANTE',
          }),
        ],
      },
    );
    const workbook = new ExcelJS.Workbook();
    const contenido = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    await workbook.xlsx.load(contenido);

    const reader = new ExcelCalendarioReader({
      cargar: async () => workbook,
    });
    const reimportado = await reader.leerCalendario('buffer-en-memoria.xlsx');
    const nombres = reimportado.unidadesOperativas.flatMap((unidad) =>
      unidad.empleados.map((empleado) => empleado.nombre),
    );

    expect(nombres).not.toContainEqual(expect.stringMatching(/\bpor\b/iu));
    expect(nombres).not.toContainEqual(
      expect.stringMatching(/cobertura adicional/iu),
    );
    expect(
      reimportado
        .buscarUnidadOperativa('CACAO CAJA')
        ?.empleados.find((empleado) => empleado.nombre === 'Edwin')
        ?.estadoDelDia(1).valor,
    ).toBe('TURNO A');
    expect(
      reimportado
        .buscarUnidadOperativa('TRUCK STOP CAJA')
        ?.empleados.find((empleado) => empleado.nombre === 'Jeferson')
        ?.estadoDelDia(1).valor,
    ).toBe('TURNO B');
  });
});
