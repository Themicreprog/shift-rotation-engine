import path from 'node:path';

import ExcelJS from 'exceljs';
import type { CellValue, RichText, Worksheet } from 'exceljs';
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

function bufferComoArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
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

function buscarCeldaPorTexto(worksheet: Worksheet, texto: string): ExcelJS.Cell | undefined {
  let encontrada: ExcelJS.Cell | undefined;

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.text === texto) encontrada = cell;
    });
  });

  return encontrada;
}

function textosDeHoja(worksheet: Worksheet): string[] {
  const textos: string[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.text.trim().length > 0) textos.push(cell.text);
    });
  });

  return textos;
}

describe('ExcelCalendarioWriter con diseño limpio propio', () => {
  it('genera un Buffer limpio con las cuatro hojas reales, sin depender del layout viejo', async () => {
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
    await resultado.xlsx.load(bufferComoArrayBuffer(buffer));

    expect(resultado.worksheets.map(({ name }) => name)).toEqual([
      'CACAO C1',
      'CAJA CACAO',
      'TRUCK STOP',
      'CAJA TRUCK STOP',
    ]);
    expect(resultado.getWorksheet('PISTA')).toBeUndefined();
    expect(resultado.getWorksheet('CACAO PISTA')).toBeUndefined();
    expect(contarFormulas(resultado)).toBe(0);
    expect(contarNotas(resultado)).toBe(0);

    const cacaoPista = resultado.getWorksheet('CACAO C1');
    const cacaoCaja = resultado.getWorksheet('CAJA CACAO');
    const truckPista = resultado.getWorksheet('TRUCK STOP');
    const truckCaja = resultado.getWorksheet('CAJA TRUCK STOP');

    expect(cacaoPista?.getCell('A1').text).toBe('Cuadro de Turnos mes de Julio 2026');
    expect(cacaoPista?.getCell('A2').text).toBe('CACAO C1 - BOMBEROS');
    expect(cacaoCaja?.getCell('A2').text).toBe('CAJA CACAO - CAJEROS');
    expect(truckPista?.getCell('A2').text).toBe('TRUCK STOP - BOMBEROS');
    expect(truckCaja?.getCell('A2').text).toBe('CAJA TRUCK STOP - CAJEROS');

    expect(textosDeHoja(cacaoPista!)).toContain('Mier. 1/7');
    expect(textosDeHoja(cacaoPista!)).toContain('TURNO A');
    expect(textosDeHoja(cacaoPista!)).toContain('TURNO B');
    expect(textosDeHoja(cacaoPista!)).toContain('LIBRE');
    expect(textosDeHoja(cacaoPista!)).toContain('FERIADO');
    expect(textosDeHoja(cacaoPista!)).toContain('VACACIONES');

    const celdaReemplazoPista = buscarCeldaPorTexto(cacaoPista!, 'Mario\nRene');
    expect(celdaReemplazoPista).toBeDefined();
    expect(celdaReemplazoPista?.alignment?.wrapText).toBe(true);
    expect(celdaReemplazoPista?.fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFCE4D6' },
    });

    const reemplazoPista = obtenerRichText(celdaReemplazoPista?.value ?? null);
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

    const celdaReemplazoCaja = buscarCeldaPorTexto(cacaoCaja!, 'Edwin\nCelio');
    expect(celdaReemplazoCaja).toBeDefined();
    const reemplazoCaja = obtenerRichText(celdaReemplazoCaja?.value ?? null);
    expect(reemplazoCaja).toHaveLength(2);
    expect(reemplazoCaja[0]).toMatchObject({
      text: 'Edwin',
      font: { bold: true, color: { argb: 'FF000000' } },
    });
    expect(reemplazoCaja[1]).toMatchObject({
      text: '\nCelio',
      font: { color: { argb: 'FF8A8A8A' } },
    });

    expect(textosDeHoja(cacaoPista!)).toContain('Jose');
    expect(textosDeHoja(cacaoPista!)).toContain('Edwin');
    expect(textosDeHoja(cacaoPista!)).toContain('Rene');
    expect(textosDeHoja(cacaoPista!)).toContain('Luis D');
    expect(textosDeHoja(cacaoCaja!)).toContain('Rony');
    expect(textosDeHoja(cacaoCaja!)).toContain('Celio');
    expect(textosDeHoja(truckPista!)).toContain('Jeferson');
    expect(textosDeHoja(truckCaja!)).toContain('Norlan');
    expect(textosDeHoja(truckCaja!)).toContain('Derlin');
    expect(textosDeHoja(truckCaja!)).toContain('Lester');
  });

  it('genera agosto con sexta semana usando el diseño nuevo propio', async () => {
    const writer = new ExcelCalendarioWriter();
    const buffer = await writer.escribirCalendario(crearCalendario(), {
      rutaPlantilla,
      mes: 8,
      anio: 2026,
    });
    const resultado = new ExcelJS.Workbook();

    await resultado.xlsx.load(bufferComoArrayBuffer(buffer));

    expect(resultado.worksheets.map(({ name }) => name)).toEqual([
      'CACAO C1',
      'CAJA CACAO',
      'TRUCK STOP',
      'CAJA TRUCK STOP',
    ]);
    expect(contarFormulas(resultado)).toBe(0);

    for (const nombreHoja of ['CACAO C1', 'CAJA CACAO', 'TRUCK STOP', 'CAJA TRUCK STOP']) {
      const hoja = resultado.getWorksheet(nombreHoja);
      expect(hoja).toBeDefined();
      expect(hoja?.getCell('A1').text).toBe('Cuadro de Turnos mes de Agosto 2026');
      expect(textosDeHoja(hoja!)).toContain('SEMANA 6');
      expect(textosDeHoja(hoja!)).toContain('Lunes 31/8');
    }

    expect(textosDeHoja(resultado.getWorksheet('CACAO C1')!)).toContain('Mario');
    expect(textosDeHoja(resultado.getWorksheet('CAJA CACAO')!)).toContain('Natanael');
    expect(textosDeHoja(resultado.getWorksheet('CAJA CACAO')!)).toContain('Edwin');
    expect(textosDeHoja(resultado.getWorksheet('TRUCK STOP')!)).toContain('Jeferson');
    expect(textosDeHoja(resultado.getWorksheet('CAJA TRUCK STOP')!)).toContain('Norlan');
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

    await workbook.xlsx.load(bufferComoArrayBuffer(buffer));

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