// Tipos internos de infraestructura (DTO) usados por el Reader.
// El dominio real puede envolver o adaptar estos tipos.

export type TipoHoja = 'PISTA' | 'CAJA' | 'AUXILIAR';

export interface DiaColumna {
  encabezadoTexto: string; // ej. "Lunes 1/6"
  columna: number;
}

export type TipoBloque =
  | 'TURNO_A'
  | 'TURNO_B'
  | 'LIBRE'
  | 'FERIADO'
  | 'VACACIONES'
  | 'OTRO'
  | 'DESCONOCIDO';

export interface WeekLayout {
  etiquetaSemana: string;      // "SEMANA 1"
  filaEncabezado: number;      // índice de fila del encabezado de semana
  filaInicioDatos: number;     // primera fila debajo del encabezado
  filaFinDatos: number;        // última fila de datos antes de la siguiente semana o resumen
  columnasDias: DiaColumna[];  // columnas de días detectadas
}

export interface AsignacionDiaDTO {
  empleadoNombre: string;
  tipoBloque: TipoBloque;
  dia: DiaColumna;
  fila: number;
}

export interface SemanaDTO {
  layout: WeekLayout;
  asignaciones: AsignacionDiaDTO[];
}

export interface HojaOperacionDTO {
  tipoHoja: TipoHoja;     // PISTA o CAJA
  estacionNombre: string; // texto extraído del encabezado
  semanas: SemanaDTO[];
}