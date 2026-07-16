import axios from 'axios'

export type EstadoTurno =
  | 'TURNO A'
  | 'TURNO B'
  | 'LIBRE'
  | 'VACACIONES'
  | 'FERIADO'
  | 'OTRO'

export interface EmpleadoDto {
  nombre: string
  estadosPorDia: EstadoTurno[]
}

export interface UnidadOperativaDto {
  nombre: string
  empleados: EmpleadoDto[]
}

export interface PeriodoOrigenDto {
  mes: number
  anio: number
  fechaInicio: string
  fechaFin: string
}

export interface CalendarioDto {
  nombre: string
  unidadesOperativas: UnidadOperativaDto[]
  periodoOrigen?: PeriodoOrigenDto
}

export interface ResumenImportacionDto {
  unidadesOperativas: number
  empleados: number
  periodoOrigen: { mes: number; anio: number } | null
  ultimaFechaDetectada: string | null
  diasContinuidad: number
  periodoDestinoSugerido: { mes: number; anio: number } | null
}

export interface ImportarCalendarioResponseDto {
  calendario: CalendarioDto
  resumen: ResumenImportacionDto
}

export interface EventoPlanificacionDto {
  empleado: string
  tipo: 'VACACIONES' | 'FERIADO'
  fechaInicio: string
  fechaFin: string
  unidadOperativa?: string
}

export interface AsignacionComodinDto {
  unidadOperativa: string
  empleado: 'Celio' | 'Lester'
}

export interface ReemplazoPlanificacionDto {
  unidadOperativa: string
  dia: number
  turno: 'TURNO A' | 'TURNO B'
  empleadoTitular: string | null
  empleadoReemplazo: string
  tipoCobertura: 'BASE' | 'FLEXIBLE' | 'COMODIN' | 'MANUAL'
  motivo:
    | 'VACACIONES'
    | 'FERIADO'
    | 'DESCANSO'
    | 'FALTANTE'
    | 'TRANSFERENCIA_FLEXIBLE'
    | 'AJUSTE_MANUAL'
}

export interface ResultadoPlanificacionDto {
  calendario: CalendarioDto
  cambios: string[]
  advertencias: string[]
  conflictos: string[]
  reemplazos: ReemplazoPlanificacionDto[]
  exportable: boolean
}

interface ErrorApiDto {
  error?: {
    code?: string
    message?: string
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
})

export async function importarCalendario(
  archivo: File,
): Promise<ImportarCalendarioResponseDto> {
  try {
    const contenidoBase64 = await archivoABase64(archivo)
    const response = await api.post<ImportarCalendarioResponseDto>(
      '/calendarios/importar',
      {
        nombreArchivo: archivo.name,
        contenidoBase64,
      },
    )

    return response.data
  } catch (error) {
    throw normalizarError(error)
  }
}

export async function generarPlanificacion(input: {
  calendarioOrigen: CalendarioDto
  mes: number
  anio: number
  eventos: EventoPlanificacionDto[]
  comodines: AsignacionComodinDto[]
}): Promise<ResultadoPlanificacionDto> {
  try {
    const response = await api.post<ResultadoPlanificacionDto>(
      '/planificaciones/generar',
      input,
    )

    return response.data
  } catch (error) {
    if (
      axios.isAxiosError<ResultadoPlanificacionDto>(error) &&
      error.response?.status === 422 &&
      error.response.data?.calendario !== undefined
    ) {
      return error.response.data
    }

    throw normalizarError(error)
  }
}

export async function exportarPlanificacion(input: {
  calendario: CalendarioDto
  mes: number
  anio: number
  reemplazos: ReemplazoPlanificacionDto[]
}): Promise<{ archivo: Blob; nombre: string }> {
  try {
    const response = await api.post<Blob>(
      '/planificaciones/exportar',
      input,
      { responseType: 'blob' },
    )
    const disposition = response.headers['content-disposition'] as
      | string
      | undefined
    const nombre =
      disposition?.match(/filename="?([^";]+)"?/i)?.[1] ??
      `turnos-${input.anio}-${String(input.mes).padStart(2, '0')}.xlsx`

    return { archivo: response.data, nombre }
  } catch (error) {
    if (axios.isAxiosError<Blob>(error) && error.response?.data instanceof Blob) {
      const texto = await error.response.data.text()
      let detalle: ErrorApiDto | null = null

      try {
        detalle = JSON.parse(texto) as ErrorApiDto
      } catch {
        detalle = null
      }

      if (detalle?.error?.message) {
        throw new Error(detalle.error.message)
      }
    }

    throw normalizarError(error)
  }
}

function archivoABase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No fue posible leer el archivo seleccionado.'))
        return
      }

      const separador = reader.result.indexOf(',')
      resolve(separador >= 0 ? reader.result.slice(separador + 1) : reader.result)
    })
    reader.addEventListener('error', () => {
      reject(new Error('No fue posible leer el archivo seleccionado.'))
    })
    reader.readAsDataURL(archivo)
  })
}

function normalizarError(error: unknown): Error {
  if (axios.isAxiosError<ErrorApiDto>(error)) {
    const mensaje = error.response?.data?.error?.message

    if (mensaje) {
      return new Error(mensaje)
    }

    if (error.code === 'ECONNABORTED') {
      return new Error('El servidor tardó demasiado en responder.')
    }

    if (error.request && !error.response) {
      return new Error(
        'No se pudo conectar con el backend. Confirma que FireSchedule esté iniciado.',
      )
    }
  }

  return error instanceof Error
    ? error
    : new Error('Ocurrió un error inesperado.')
}
