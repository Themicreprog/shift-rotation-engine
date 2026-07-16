// src/infrastructure/excel/excel-types.ts

// Tipos internos de lectura de Excel. NO forman parte del dominio.

export type TipoHoja = 'PISTA' | 'CAJA' | 'AUXILIAR';

export interface DiaColumna {
  encabezadoTexto: string; // ej. "Lunes 1/6"
  columna: number;
}

export interface FechaColumnaExcel {
  columna: number;
  dia: number;
  mes: number;
  anio: number;
  fecha: string;
}

export type TipoBloqueExcel =
  | 'TURNO_A'
  | 'TURNO_B'
  | 'LIBRE'
  | 'FERIADO'
  | 'VACACIONES'
  | 'OTRO'
  | 'DESCONOCIDO';

export interface WeekLayout {
  etiquetaSemana: string;
  filaEncabezado: number;
  filaInicioDatos: number;
  filaFinDatos: number;
  columnasDias: DiaColumna[];
}

export interface PeriodoExcel {
  mes: number;
  anio: number;
}

export interface RawAssignment {
  empleadoNombre: string;
  estadoTexto: string; // texto del estado (Turno A, Libre, Vacaciones, etc.)
  semanaEtiqueta: string; // ej. "SEMANA 1"
  dia: number;
  mes: number;
  anio: number;
  fecha: string; // ISO local del calendario: YYYY-MM-DD
}
