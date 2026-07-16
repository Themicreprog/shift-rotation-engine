import path from 'node:path';
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';

import { ExcelCalendarioReader } from '../../src/infrastructure/excel/ExcelCalendarioReader.js';
import { SheetClassifier } from '../../src/infrastructure/excel/SheetClassifier.js';
import { WeekDetector } from '../../src/infrastructure/excel/WeekDetector.js';

import type { Calendario } from '../../src/domain/Calendario.js';
import type { UnidadOperativa } from '../../src/domain/UnidadOperativa.js';
import type { Empleado } from '../../src/domain/Empleado.js';

const fixturesDir = path.resolve(__dirname, '../fixtures');

const archivos = [
  'TURNOS-PISTA-Y-CAJA-JUNIO-2026.xlsx', // Junio real
  'TURNOS-PISTA-Y-CAJA-JULIO-2026-2.xlsx', // Julio con fórmulas
  'turnos-de-julio-pero-limpios-3.xlsx', // Julio limpio sin fórmulas
];

async function cargarWorkbook(nombreArchivo: string): Promise<ExcelJS.Workbook> {
  const ruta = path.join(fixturesDir, nombreArchivo);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  return wb;
}

describe('ExcelCalendarioReader — validación funcional con Excel real', () => {
  it('procesa todos los archivos sin excepciones y con hojas operativas', async () => {
    const reader = new ExcelCalendarioReader();

    for (const nombre of archivos) {
      const ruta = path.join(fixturesDir, nombre);

      let calendario: Calendario | null = null;
      let error: unknown = null;

      try {
        calendario = await reader.leerCalendario(ruta);
      } catch (e) {
        error = e;
      }

      expect(error).toBeNull();
      expect(calendario).not.toBeNull();
      expect(calendario!.unidadesOperativas.length).toBeGreaterThan(0);

      for (const unidad of calendario!.unidadesOperativas) {
        expect(unidad.cantidadEmpleados()).toBeGreaterThan(0);
      }
    }
  });

  it('clasifica correctamente las hojas en PISTA, CAJA y AUXILIAR', async () => {
    const classifier = new SheetClassifier();

    for (const nombre of archivos) {
      const workbook = await cargarWorkbook(nombre);

      let hayPista = false;
      let hayCaja = false;

      workbook.eachSheet((worksheet) => {
        const tipo = classifier.clasificar(worksheet);
        if (tipo === 'PISTA') hayPista = true;
        if (tipo === 'CAJA') hayCaja = true;
      });

      // Cada archivo debe tener al menos una hoja de Pista y una de Caja
      expect(hayPista).toBe(true);
      expect(hayCaja).toBe(true);
    }
  });

  it('detecta semanas en cada hoja operativa', async () => {
    const classifier = new SheetClassifier();
    const detector = new WeekDetector();

    for (const nombre of archivos) {
      const workbook = await cargarWorkbook(nombre);

      workbook.eachSheet((worksheet) => {
        const tipo = classifier.clasificar(worksheet);
        if (tipo === 'PISTA' || tipo === 'CAJA') {
          const weeks = detector.detect(worksheet);
          expect(weeks.length).toBeGreaterThan(0);
        }
      });
    }
  });

  it('construye empleados con estados por día coherentes', async () => {
    const reader = new ExcelCalendarioReader();

    for (const nombre of archivos) {
      const ruta = path.join(fixturesDir, nombre);
      const calendario = await reader.leerCalendario(ruta);

      let totalEmpleados = 0;
      let totalDias = 0;

      calendario.unidadesOperativas.forEach((unidad: UnidadOperativa) => {
        const cantidadEmpleados = unidad.cantidadEmpleados();
        expect(cantidadEmpleados).toBeGreaterThan(0);
        totalEmpleados += cantidadEmpleados;

        unidad.empleados.forEach((empleado: Empleado) => {
          const diasEmpleado = empleado.totalDias();
          expect(diasEmpleado).toBeGreaterThan(0);
          totalDias += diasEmpleado;
        });
      });

      // El calendario debe contener al menos un empleado y un día asignado
      expect(totalEmpleados).toBeGreaterThan(0);
      expect(totalDias).toBeGreaterThan(0);
    }
  });

  it('lee solo las cuatro unidades de julio del archivo limpio sin corromper empleados ni dias', async () => {
    const reader = new ExcelCalendarioReader();
    const ruta = path.join(fixturesDir, 'turnos-de-julio-pero-limpios-3.xlsx');

    const calendario = await reader.leerCalendario(ruta);
    const nombresUnidades = calendario.unidadesOperativas.map((unidad) => unidad.nombre).sort();

    expect(nombresUnidades).toEqual([
      'CACAO CAJA',
      'CACAO PISTA',
      'TRUCK STOP CAJA',
      'TRUCK STOP PISTA',
    ]);

    for (const unidad of calendario.unidadesOperativas) {
      expect(unidad.cantidadEmpleados()).toBeGreaterThan(0);

      for (const empleado of unidad.empleados) {
        expect(empleado.nombre).not.toMatch(/^\d+$/);
        expect(empleado.nombre).not.toBe('Celeo');
        expect(empleado.nombre).not.toContain('(');
        expect(empleado.totalDias()).toBe(33);

        for (let dia = 1; dia <= 33; dia += 1) {
          expect(() => empleado.estadoDelDia(dia)).not.toThrow();
        }
      }
    }

    expect(
      calendario.buscarUnidadOperativa('CACAO PISTA')?.empleados.map(
        (empleado) => empleado.nombre,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Mario',
        'Jose',
        'Edwin',
        'Rene',
        'Luis D',
        'Julio',
        'Joel',
      ]),
    );
    expect(
      calendario.buscarUnidadOperativa('CACAO CAJA')?.empleados.map(
        (empleado) => empleado.nombre,
      ),
    ).toEqual(expect.arrayContaining(['Natanael', 'Rony']));
    expect(
      calendario.buscarUnidadOperativa('TRUCK STOP CAJA')?.empleados.map(
        (empleado) => empleado.nombre,
      ),
    ).toEqual(expect.arrayContaining(['Norlan', 'Derlin']));
    expect(calendario.obtenerPeriodoOrigen()).toMatchObject({
      mes: 7,
      anio: 2026,
      fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
      fechaFin: new Date('2026-08-02T00:00:00.000Z'),
    });
  });

  it('usa la ultima fecha segura comun cuando una hoja termina antes', async () => {
    const workbook = await cargarWorkbook(
      'turnos-de-julio-pero-limpios-3.xlsx',
    );
    const classifier = new SheetClassifier();
    const detector = new WeekDetector();
    const hojaRecortada = workbook.worksheets.find(
      (worksheet) =>
        classifier.clasificar(worksheet) !== 'AUXILIAR' &&
        detector
          .detect(worksheet)
          .some((semana) =>
            semana.columnasDias.some((dia) =>
              /\b2\s*\/\s*8\b/.test(dia.encabezadoTexto),
            ),
          ),
    );

    expect(hojaRecortada).toBeDefined();

    let encabezadosRetirados = 0;

    for (const semana of detector.detect(hojaRecortada!)) {
      for (const dia of semana.columnasDias) {
        if (/\b2\s*\/\s*8\b/.test(dia.encabezadoTexto)) {
          hojaRecortada!
            .getRow(semana.filaEncabezado)
            .getCell(dia.columna).value = null;
          encabezadosRetirados += 1;
        }
      }
    }

    expect(encabezadosRetirados).toBeGreaterThan(0);

    const reader = new ExcelCalendarioReader({
      cargar: async () => workbook,
    });
    const calendario = await reader.leerCalendario('ruta-ignorada.xlsx');

    expect(calendario.obtenerPeriodoOrigen()?.fechaFin).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );

    for (const unidad of calendario.unidadesOperativas) {
      for (const empleado of unidad.empleados) {
        expect(empleado.totalDias()).toBe(32);
      }
    }
  });
});
