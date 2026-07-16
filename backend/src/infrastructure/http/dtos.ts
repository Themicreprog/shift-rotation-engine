export interface EmpleadoDto {
  nombre: string;
  estadosPorDia: string[];
}

export interface UnidadOperativaDto {
  nombre: string;
  empleados: EmpleadoDto[];
}

export interface CalendarioDto {
  nombre: string;
  unidadesOperativas: UnidadOperativaDto[];
  periodoOrigen?: PeriodoOrigenCalendarioDto;
}

export interface PeriodoOrigenCalendarioDto {
  mes: number;
  anio: number;
  fechaInicio: string;
  fechaFin: string;
}

export interface EventoPlanificacionDto {
  empleado: string;
  tipo: 'VACACIONES' | 'FERIADO';
  fechaInicio: string;
  fechaFin: string;
  unidadOperativa?: string;
}

export interface AsignacionComodinDto {
  unidadOperativa: string;
  empleado: string;
}

export interface ReemplazoPlanificacionDto {
  unidadOperativa: string;
  dia: number;
  turno: 'TURNO A' | 'TURNO B';
  empleadoTitular: string | null;
  empleadoReemplazo: string;
  tipoCobertura: 'BASE' | 'FLEXIBLE' | 'COMODIN' | 'MANUAL';
  motivo:
    | 'VACACIONES'
    | 'FERIADO'
    | 'DESCANSO'
    | 'FALTANTE'
    | 'TRANSFERENCIA_FLEXIBLE'
    | 'AJUSTE_MANUAL';
}

export interface MovimientoAjusteManualDto {
  turno: 'TURNO A' | 'TURNO B';
  titularOriginal: string;
  titular: string;
  reemplazo: string;
}

export interface AjusteManualPlanificacionDto {
  id: string;
  tipo: 'SUSTITUCION' | 'INTERCAMBIO';
  unidadOperativa: string;
  dia: number;
  turno: 'TURNO A' | 'TURNO B';
  titularOriginal: string;
  titular: string;
  reemplazo: string;
  estadoTitularAnterior: 'TURNO A' | 'TURNO B';
  estadoReemplazoAnterior: 'TURNO A' | 'TURNO B' | 'LIBRE';
  estadoTitularPosterior: 'TURNO A' | 'TURNO B' | 'LIBRE';
  estadoReemplazoPosterior: 'TURNO A' | 'TURNO B';
  movimientos: MovimientoAjusteManualDto[];
  estado: 'APLICADO' | 'DESHECHO';
}

export interface ResultadoAjusteManualDto {
  calendario: CalendarioDto;
  historial: AjusteManualPlanificacionDto[];
  ajuste: AjusteManualPlanificacionDto | null;
  conflictos: string[];
  reemplazos: ReemplazoPlanificacionDto[];
}

export interface ImportarCalendarioResponseDto {
  calendario: CalendarioDto;
  resumen: {
    unidadesOperativas: number;
    empleados: number;
    periodoOrigen: { mes: number; anio: number } | null;
    ultimaFechaDetectada: string | null;
    diasContinuidad: number;
    periodoDestinoSugerido: { mes: number; anio: number } | null;
  };
}

export interface ResultadoPlanificacionDto {
  calendario: CalendarioDto;
  cambios: string[];
  advertencias: string[];
  conflictos: string[];
  reemplazos: ReemplazoPlanificacionDto[];
  exportable: boolean;
}

export interface ArchivoExcelDto {
  contenido: Buffer;
  nombreArchivo: string;
}
