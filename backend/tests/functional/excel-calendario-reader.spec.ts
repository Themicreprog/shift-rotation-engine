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
  'TURNOS-PISTA-Y-CAJA-JUNIO-2026.xlsx',        // Junio real
  'TURNOS-PISTA-Y-CAJA-JULIO-2026-2.xlsx',      // Julio con fórmulas
  'turnos-de-julio-pero-limpios-3.xlsx',        // Julio limpio sin fórmulas
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
});