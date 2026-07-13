// src/infrastructure/excel/excel-types.ts

// Tipos internos de lectura de Excel. NO forman parte del dominio.

export type TipoHoja = 'PISTA' | 'CAJA' | 'AUXILIAR';

export interface DiaColumna {
  encabezadoTexto: string; // ej. "Lunes 1/6"
  columna: number;
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

export interface RawAssignment {
  empleadoNombre: string;
  estadoTexto: string;      // texto del estado (Turno A, Libre, Vacaciones, etc.)
  semanaEtiqueta: string;   // ej. "SEMANA 1"
}