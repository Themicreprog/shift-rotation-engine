// src/infrastructure/excel/SheetReader.ts

import type { Worksheet } from 'exceljs';
import { RawAssignment, TipoHoja, WeekLayout } from './excel-types.js';
import { WeekDetector } from './WeekDetector.js';
import { BlockExtractor } from './BlockExtractor.js';

import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';

export class SheetReader {
  constructor(
    private readonly weekDetector = new WeekDetector(),
    private readonly blockExtractor = new BlockExtractor(),
  ) {}

  public leerUnidadOperativa(
    worksheet: Worksheet,
    tipoHoja: TipoHoja,
  ): UnidadOperativa | null {
    if (tipoHoja === 'AUXILIAR') return null;

    // ──────────────────────────────────────────────
    // 1) WeekDetector.detect() + log
    // ──────────────────────────────────────────────
    const layouts: WeekLayout[] = this.weekDetector.detect(worksheet);

    console.log(
      `[WeekDetector] Hoja "${worksheet.name}" - semanas detectadas: ${layouts.length}`,
    ); // LOG 1

    if (layouts.length === 0) return null;

    for (const layout of layouts) {
  const dias = layout.columnasDias.map((d) => d.encabezadoTexto).join(', ');
  console.log(
    `[WeekDetector] Hoja "${worksheet.name}" - ${layout.etiquetaSemana} - dias detectados (${layout.columnasDias.length}): ${dias}`,
  );
} // LOG 1b

    const nombreEstacion = this.extraerNombreEstacion(worksheet);
    const esHojaDeCaja = tipoHoja === 'CAJA';

    const rawAssignments: RawAssignment[] = [];

    // ──────────────────────────────────────────────
    // 2) BlockExtractor.extractAssignments() + log
    // ──────────────────────────────────────────────
    for (const layout of layouts) {
      const asignacionesSemana = this.blockExtractor.extractAssignments(
        worksheet,
        layout,
        esHojaDeCaja,
      );

      console.log(
        `[BlockExtractor] Hoja "${worksheet.name}" - ${layout.etiquetaSemana} - RawAssignment encontrados: ${asignacionesSemana.length}`,
      ); // LOG 2

      rawAssignments.push(...asignacionesSemana);
    }

    // ──────────────────────────────────────────────
    // 3) Antes de construir la UnidadOperativa
    // ──────────────────────────────────────────────
    console.log(
      `[SheetReader] Construyendo UnidadOperativa para estación "${nombreEstacion}" - total RawAssignment: ${rawAssignments.length}`,
    ); // LOG 3

    // Agrupar por empleado y construir EstadosTurno por orden de aparición
    const estadosPorEmpleado = new Map<string, string[]>();

    for (const raw of rawAssignments) {
      const existentes = estadosPorEmpleado.get(raw.empleadoNombre) ?? [];
      existentes.push(raw.estadoTexto);
      estadosPorEmpleado.set(raw.empleadoNombre, existentes);
    }

    const empleados: Empleado[] = [];

    for (const [nombreEmpleado, estadosTexto] of estadosPorEmpleado.entries()) {
      const estados = estadosTexto.map((valor) => EstadoTurno.create(valor));
      const empleado = Empleado.create({
        nombre: nombreEmpleado,
        estadosPorDia: estados,
      });
      empleados.push(empleado);
    }

    const unidad = UnidadOperativa.create({
      nombre: nombreEstacion,
      empleados,
    });

    // ──────────────────────────────────────────────
    // 4) Después de crear la UnidadOperativa
    // ──────────────────────────────────────────────
    console.log(
      `[SheetReader] UnidadOperativa creada "${unidad.nombre}" - empleados: ${unidad.cantidadEmpleados()} - asignaciones (RawAssignment): ${rawAssignments.length}`,
    ); // LOG 4

    return unidad;
  }

  private extraerNombreEstacion(worksheet: Worksheet): string {
    const limiteFilas = Math.min(10, worksheet.rowCount);

    for (let fila = 1; fila <= limiteFilas; fila += 1) {
      const row = worksheet.getRow(fila);
      const valores = Array.isArray(row.values) ? row.values : [];

      for (const v of valores) {
        if (v == null) continue;
        const texto = String(v).trim();
        const textoMay = texto.toUpperCase();

        if (textoMay.includes('CORPORACION ROD')) continue;
        if (textoMay.includes('CUADRO DE TURNOS')) continue;

        if (texto.length > 0) {
          return texto;
        }
      }
    }

    return worksheet.name;
  }
}