import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

import {
  exportarPlanificacion,
  generarPlanificacion,
  importarCalendario,
} from './api/planningApi'
import type {
  AsignacionComodinDto,
  EventoPlanificacionDto,
  ImportarCalendarioResponseDto,
  ResultadoPlanificacionDto,
} from './api/planningApi'
import './App.css'

type Operacion = 'IMPORTAR' | 'GENERAR' | 'EXPORTAR' | null

interface BorradorEvento {
  objetivo: string
  tipo: EventoPlanificacionDto['tipo']
  fechaInicio: string
  fechaFin: string
}

type NombreComodin = AsignacionComodinDto['empleado']

const MESES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

const BORRADOR_VACIO: BorradorEvento = {
  objetivo: '',
  tipo: 'VACACIONES',
  fechaInicio: '',
  fechaFin: '',
}

const NOMBRES_COMODINES: ReadonlyArray<NombreComodin> = ['Celio', 'Lester']
const UNIDADES_COMODIN_VACIAS: Record<NombreComodin, string> = {
  Celio: '',
  Lester: '',
}
const UNIDAD_BASE_FLEXIBLE: Readonly<Record<string, string>> = {
  EDWIN: 'CACAO C1',
  JEFERSON: 'TRUCK STOP',
}

function App() {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [importado, setImportado] =
    useState<ImportarCalendarioResponseDto | null>(null)
  const [resultado, setResultado] =
    useState<ResultadoPlanificacionDto | null>(null)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [eventos, setEventos] = useState<EventoPlanificacionDto[]>([])
  const [unidadesComodin, setUnidadesComodin] = useState<
    Record<NombreComodin, string>
  >({ ...UNIDADES_COMODIN_VACIAS })
  const [borrador, setBorrador] = useState<BorradorEvento>(BORRADOR_VACIO)
  const [operacion, setOperacion] = useState<Operacion>(null)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const controlesBloqueados = operacion !== null

  const opcionesEmpleado = useMemo(() => {
    if (!importado) return []

    return importado.calendario.unidadesOperativas
      .flatMap((unidad) =>
        unidad.empleados.map((empleado) => ({
          id: `${unidad.nombre}::${empleado.nombre}`,
          empleado: empleado.nombre,
          unidad: unidad.nombre,
        })),
      )
      .filter((opcion) => {
        const unidadBase = UNIDAD_BASE_FLEXIBLE[opcion.empleado.toUpperCase()]

        return unidadBase === undefined || opcion.unidad.toUpperCase() === unidadBase
      })
      .sort((a, b) =>
        `${a.empleado} ${a.unidad}`.localeCompare(
          `${b.empleado} ${b.unidad}`,
          'es',
        ),
      )
  }, [importado])

  const opcionesComodin = useMemo(
    () => obtenerUnidadesComodin(importado),
    [importado],
  )
  const comodinesConfigurados = NOMBRES_COMODINES.flatMap((empleado) => {
    const unidadOperativa = unidadesComodin[empleado]

    return unidadOperativa ? [{ empleado, unidadOperativa }] : []
  })

  const periodoTexto = `${MESES[mes]} ${anio}`
  const periodoSugerido = importado?.resumen.periodoDestinoSugerido
  const periodoFijadoPorContinuidad = periodoSugerido !== null && periodoSugerido !== undefined
  const usaContinuidadImportada =
    periodoSugerido?.mes === mes && periodoSugerido.anio === anio
  const primerDiaEditable = usaContinuidadImportada
    ? (importado?.resumen.diasContinuidad ?? 0) + 1
    : 1
  const fechaMinima = `${anio}-${String(mes).padStart(2, '0')}-${String(
    primerDiaEditable,
  ).padStart(2, '0')}`
  const fechaMaxima = `${anio}-${String(mes).padStart(2, '0')}-${String(
    new Date(anio, mes, 0).getDate(),
  ).padStart(2, '0')}`

  function seleccionarArchivo(candidato: File | null) {
    if (controlesBloqueados) return

    setError(null)

    if (!candidato) return

    if (!candidato.name.toLowerCase().endsWith('.xlsx')) {
      setArchivo(null)
      setImportado(null)
      setResultado(null)
      setEventos([])
      setUnidadesComodin({ ...UNIDADES_COMODIN_VACIAS })
      setBorrador(BORRADOR_VACIO)
      setError('Selecciona un archivo de Excel con extensión .xlsx.')
      return
    }

    setArchivo(candidato)
    setImportado(null)
    setResultado(null)
    setEventos([])
    setUnidadesComodin({ ...UNIDADES_COMODIN_VACIAS })
    setBorrador(BORRADOR_VACIO)
  }

  async function procesarImportacion() {
    if (!archivo) return

    setOperacion('IMPORTAR')
    setError(null)

    try {
      const respuesta = await importarCalendario(archivo)
      const sugerido = respuesta.resumen.periodoDestinoSugerido

      setImportado(respuesta)
      setResultado(null)
      setEventos([])
      setUnidadesComodin(
        unidadesComodinIniciales(obtenerUnidadesComodin(respuesta)),
      )

      if (sugerido) {
        setMes(sugerido.mes)
        setAnio(sugerido.anio)
      }
    } catch (causa) {
      setError(mensajeDe(causa))
    } finally {
      setOperacion(null)
    }
  }

  function agregarEvento() {
    if (controlesBloqueados) return

    const opcion = opcionesEmpleado.find(
      (candidata) => candidata.id === borrador.objetivo,
    )

    if (!opcion || !borrador.fechaInicio || !borrador.fechaFin) {
      setError('Selecciona una persona y completa las fechas del evento.')
      return
    }

    if (borrador.fechaFin < borrador.fechaInicio) {
      setError('La fecha final no puede ser anterior a la fecha inicial.')
      return
    }

    if (
      borrador.fechaInicio < fechaMinima ||
      borrador.fechaFin > fechaMaxima
    ) {
      setError(
        `Las fechas deben estar dentro del período editable: ${formatearRango(fechaMinima, fechaMaxima)}.`,
      )
      return
    }

    const eventoBase = {
      empleado: opcion.empleado,
      tipo: borrador.tipo,
      fechaInicio: borrador.fechaInicio,
      fechaFin: borrador.fechaFin,
    }
    const nuevoEvento: EventoPlanificacionDto = esEmpleadoFlexible(
      opcion.empleado,
    )
      ? eventoBase
      : { ...eventoBase, unidadOperativa: opcion.unidad }

    setEventos((actuales) => [...actuales, nuevoEvento])
    setBorrador(BORRADOR_VACIO)
    setError(null)
    setResultado(null)
  }

  async function generar() {
    if (!importado) return

    setOperacion('GENERAR')
    setError(null)

    try {
      const propuesta = await generarPlanificacion({
        calendarioOrigen: importado.calendario,
        mes,
        anio,
        eventos,
        comodines: comodinesConfigurados,
      })

      setResultado(propuesta)
    } catch (causa) {
      setError(mensajeDe(causa))
    } finally {
      setOperacion(null)
    }
  }

  async function descargar() {
    if (!resultado?.exportable) return

    setOperacion('EXPORTAR')
    setError(null)

    try {
      const exportado = await exportarPlanificacion({
        calendario: resultado.calendario,
        mes,
        anio,
        reemplazos: resultado.reemplazos,
      })
      const url = URL.createObjectURL(exportado.archivo)
      const enlace = document.createElement('a')

      enlace.href = url
      enlace.download = exportado.nombre
      document.body.append(enlace)
      enlace.click()
      enlace.remove()
      URL.revokeObjectURL(url)
    } catch (causa) {
      setError(mensajeDe(causa))
    } finally {
      setOperacion(null)
    }
  }

  function soltarArchivo(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setArrastrando(false)
    if (controlesBloqueados) return
    seleccionarArchivo(event.dataTransfer.files.item(0))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="FireSchedule, inicio">
          <span className="brand-mark">FS</span>
          <span>
            <strong>FireSchedule</strong>
            <small>Planificación operativa</small>
          </span>
        </a>
        <div className="topbar-status">
          <ShieldCheck size={17} />
          Reglas de descanso activas
        </div>
      </header>

      <main id="inicio" aria-busy={controlesBloqueados}>
        <div className="sr-only" role="status" aria-live="polite">
          {operacion === 'IMPORTAR'
            ? 'Analizando el archivo Excel.'
            : operacion === 'GENERAR'
              ? 'Generando la propuesta mensual.'
              : operacion === 'EXPORTAR'
                ? 'Preparando el archivo Excel.'
                : resultado
                  ? 'La propuesta está lista para revisión.'
                  : importado
                    ? 'El archivo Excel fue analizado correctamente.'
                    : ''}
        </div>
        <section className="intro">
          <div>
            <span className="eyebrow">Planificador de estaciones y caja</span>
            <h1>Del turno anterior al próximo mes, sin perder continuidad.</h1>
            <p>
              Carga el Excel aprobado, confirma vacaciones y feriados, revisa
              las advertencias y genera el nuevo archivo listo para supervisión.
            </p>
          </div>
          <ol className="steps" aria-label="Flujo de planificación">
            <li className={importado ? 'done' : 'active'}>
              <span>{importado ? <CheckCircle2 size={17} /> : '1'}</span>
              Importar
            </li>
            <li className={importado && !resultado ? 'active' : resultado ? 'done' : ''}>
              <span>{resultado ? <CheckCircle2 size={17} /> : '2'}</span>
              Configurar
            </li>
            <li className={resultado ? 'active' : ''}>
              <span>3</span>
              Revisar y exportar
            </li>
          </ol>
        </section>

        {error && (
          <div className="global-message error" role="alert">
            <AlertTriangle size={20} />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              Cerrar
            </button>
          </div>
        )}

        <section className="workspace-grid">
          <article className="panel import-panel">
            <div className="panel-heading">
              <span className="panel-icon orange">
                <FileSpreadsheet size={21} />
              </span>
              <div>
                <span className="panel-kicker">Paso 1</span>
                <h2>Turno anterior</h2>
              </div>
            </div>

            <div
              className={`dropzone ${arrastrando ? 'dragging' : ''} ${archivo ? 'has-file' : ''} ${controlesBloqueados ? 'locked' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault()
                if (!controlesBloqueados) setArrastrando(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setArrastrando(false)}
              onDrop={soltarArchivo}
            >
              <UploadCloud size={32} />
              {archivo ? (
                <>
                  <strong>{archivo.name}</strong>
                  <span>{formatearBytes(archivo.size)}</span>
                </>
              ) : (
                <>
                  <strong>Arrastra aquí el Excel aprobado</strong>
                  <span>o selecciónalo desde tu computadora</span>
                </>
              )}
              <label className="secondary-button" htmlFor="archivo-turnos">
                {archivo ? 'Cambiar archivo' : 'Seleccionar .xlsx'}
              </label>
              <input
                id="archivo-turnos"
                type="file"
                disabled={controlesBloqueados}
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  seleccionarArchivo(event.target.files?.item(0) ?? null)
                }
              />
            </div>

            {!importado ? (
              <button
                type="button"
                className="primary-button full"
                disabled={!archivo || operacion !== null}
                onClick={() => void procesarImportacion()}
              >
                {operacion === 'IMPORTAR' ? (
                  <LoaderCircle className="spin" size={19} />
                ) : (
                  <ArrowRight size={19} />
                )}
                Analizar continuidad
              </button>
            ) : (
              <ResumenImportacion importado={importado} />
            )}
          </article>

          <article className={`panel configuration-panel ${!importado ? 'disabled-panel' : ''}`}>
            <div className="panel-heading">
              <span className="panel-icon blue">
                <CalendarDays size={21} />
              </span>
              <div>
                <span className="panel-kicker">Paso 2</span>
                <h2>Configurar {periodoTexto}</h2>
              </div>
            </div>

            {!importado ? (
              <div className="empty-state">
                <CalendarDays size={34} />
                <p>Primero analiza el Excel para detectar el siguiente mes.</p>
              </div>
            ) : (
              <>
                <div className="period-fields">
                  <label>
                    Mes
                    <select
                      disabled={controlesBloqueados || periodoFijadoPorContinuidad}
                      value={mes}
                      onChange={(event) => {
                        setMes(Number(event.target.value))
                        setEventos([])
                        setBorrador(BORRADOR_VACIO)
                        setResultado(null)
                      }}
                    >
                      {MESES.slice(1).map((nombre, indice) => (
                        <option key={nombre} value={indice + 1}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Año
                    <input
                      type="number"
                      min="2020"
                      max="2100"
                      disabled={controlesBloqueados || periodoFijadoPorContinuidad}
                      value={anio}
                      onChange={(event) => {
                        setAnio(Number(event.target.value))
                        setEventos([])
                        setBorrador(BORRADOR_VACIO)
                        setResultado(null)
                      }}
                    />
                  </label>
                </div>

                <div className="subsection-heading">
                  <div>
                    <h3>Vacaciones y feriados</h3>
                    <p>Agrega solamente las novedades del mes a generar.</p>
                  </div>
                  <span>{eventos.length}</span>
                </div>

                <div className="event-form">
                  <label className="wide-field">
                    Persona y unidad
                    <select
                      disabled={controlesBloqueados}
                      value={borrador.objetivo}
                      onChange={(event) =>
                        setBorrador((actual) => ({
                          ...actual,
                          objetivo: event.target.value,
                        }))
                      }
                    >
                      <option value="">Seleccionar empleado</option>
                      {opcionesEmpleado.map((opcion) => (
                        <option key={opcion.id} value={opcion.id}>
                          {opcion.empleado} · {opcion.unidad}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Motivo
                    <select
                      disabled={controlesBloqueados}
                      value={borrador.tipo}
                      onChange={(event) =>
                        setBorrador((actual) => ({
                          ...actual,
                          tipo: event.target.value as BorradorEvento['tipo'],
                        }))
                      }
                    >
                      <option value="VACACIONES">Vacaciones</option>
                      <option value="FERIADO">Día feriado</option>
                    </select>
                  </label>
                  <label>
                    Desde
                    <input
                      type="date"
                      disabled={controlesBloqueados}
                      min={fechaMinima}
                      max={fechaMaxima}
                      value={borrador.fechaInicio}
                      onChange={(event) =>
                        setBorrador((actual) => ({
                          ...actual,
                          fechaInicio: event.target.value,
                          fechaFin: actual.fechaFin || event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      type="date"
                      disabled={controlesBloqueados}
                      min={borrador.fechaInicio || fechaMinima}
                      max={fechaMaxima}
                      value={borrador.fechaFin}
                      onChange={(event) =>
                        setBorrador((actual) => ({
                          ...actual,
                          fechaFin: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button add-event"
                    aria-label="Agregar evento"
                    disabled={controlesBloqueados}
                    onClick={agregarEvento}
                  >
                    <Plus size={20} />
                  </button>
                </div>

                {eventos.length > 0 && (
                  <div className="event-list">
                    {eventos.map((evento, indice) => (
                      <div
                        className="event-item"
                        key={`${evento.empleado}-${evento.unidadOperativa}-${evento.fechaInicio}-${indice}`}
                      >
                        <span className={`event-dot ${evento.tipo.toLowerCase()}`} />
                        <div>
                          <strong>{evento.empleado}</strong>
                          <small>
                            {evento.tipo === 'VACACIONES'
                              ? 'Vacaciones'
                              : 'Feriado'}{' '}
                            · {formatearRango(evento.fechaInicio, evento.fechaFin)}
                          </small>
                        </div>
                        <button
                          type="button"
                          disabled={controlesBloqueados}
                          aria-label={`Eliminar evento de ${evento.empleado}`}
                          onClick={() => {
                            setEventos((actuales) =>
                              actuales.filter((_, posicion) => posicion !== indice),
                            )
                            setResultado(null)
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="subsection-heading wildcard-heading">
                  <div>
                    <h3>Comodines disponibles</h3>
                    <p>
                      Indica su unidad actual; solo entrarán si existe un
                      faltante real.
                    </p>
                  </div>
                  <span>{comodinesConfigurados.length}</span>
                </div>

                <div className="wildcard-grid">
                  {NOMBRES_COMODINES.map((empleado) => (
                    <label className="wildcard-field" key={empleado}>
                      <span>{empleado}</span>
                      <select
                        disabled={controlesBloqueados}
                        value={unidadesComodin[empleado]}
                        onChange={(event) => {
                          setUnidadesComodin((actuales) => ({
                            ...actuales,
                            [empleado]: event.target.value,
                          }))
                          setResultado(null)
                        }}
                      >
                        <option value="">No disponible este mes</option>
                        {opcionesComodin[empleado].map((unidad) => (
                          <option key={unidad} value={unidad}>
                            {unidad}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <p className="business-note">
                  Edwin y Jeferson solo se asignan a caja cuando cubren el
                  descanso o las vacaciones de un cajero fijo. El sistema
                  coordina automáticamente su salida del puesto habitual.
                </p>

                <button
                  type="button"
                  className="primary-button full"
                  disabled={operacion !== null}
                  onClick={() => void generar()}
                >
                  {operacion === 'GENERAR' ? (
                    <LoaderCircle className="spin" size={19} />
                  ) : (
                    <CalendarDays size={19} />
                  )}
                  Generar propuesta de {periodoTexto}
                </button>
              </>
            )}
          </article>
        </section>

        {resultado && (
          <ResultadoPlanificacion
            resultado={resultado}
            periodo={periodoTexto}
            exportando={operacion === 'EXPORTAR'}
            onDescargar={() => void descargar()}
          />
        )}
      </main>

      <footer>
        <span>FireSchedule</span>
        <span>Continuidad, cobertura y descanso en una sola revisión.</span>
      </footer>
    </div>
  )
}

function ResumenImportacion({
  importado,
}: {
  importado: ImportarCalendarioResponseDto
}) {
  const { resumen } = importado

  return (
    <div className="import-summary">
      <div className="success-line">
        <CheckCircle2 size={20} />
        <div>
          <strong>Excel entendido correctamente</strong>
          <span>
            Última fecha segura: {formatearFecha(resumen.ultimaFechaDetectada)}
          </span>
        </div>
      </div>
      <div className="summary-metrics">
        <div>
          <MapPin size={18} />
          <strong>{resumen.unidadesOperativas}</strong>
          <span>unidades</span>
        </div>
        <div>
          <Users size={18} />
          <strong>{resumen.empleados}</strong>
          <span>registros</span>
        </div>
        <div>
          <CalendarDays size={18} />
          <strong>{resumen.diasContinuidad}</strong>
          <span>días heredados</span>
        </div>
      </div>
      <p>
        Los {resumen.diasContinuidad} días ya definidos del mes siguiente se
        conservarán sin regenerarse.
      </p>
    </div>
  )
}

function ResultadoPlanificacion({
  resultado,
  periodo,
  exportando,
  onDescargar,
}: {
  resultado: ResultadoPlanificacionDto
  periodo: string
  exportando: boolean
  onDescargar: () => void
}) {
  return (
    <section className="results-section" aria-label="Resultado de planificación">
      <div className="results-heading">
        <div>
          <span className="eyebrow">Paso 3 · Revisión</span>
          <h2>Propuesta de {periodo}</h2>
          <p>
            {resultado.exportable
              ? 'La propuesta puede exportarse. Revisa las advertencias antes de aprobarla.'
              : 'Hay conflictos que deben resolverse antes de crear el Excel.'}
          </p>
        </div>
        <button
          type="button"
          className="primary-button download-button"
          disabled={!resultado.exportable || exportando}
          onClick={onDescargar}
        >
          {exportando ? (
            <LoaderCircle className="spin" size={19} />
          ) : (
            <Download size={19} />
          )}
          Descargar Excel
        </button>
      </div>

      <div className="result-metrics">
        <Metric
          label="Unidades"
          value={resultado.calendario.unidadesOperativas.length}
          tone="neutral"
        />
        <Metric label="Cambios" value={resultado.cambios.length} tone="blue" />
        <Metric
          label="Reemplazos"
          value={resultado.reemplazos.length}
          tone="orange"
        />
        <Metric
          label="Advertencias"
          value={resultado.advertencias.length}
          tone={resultado.advertencias.length ? 'yellow' : 'green'}
        />
        <Metric
          label="Conflictos"
          value={resultado.conflictos.length}
          tone={resultado.conflictos.length ? 'red' : 'green'}
        />
      </div>

      {(resultado.conflictos.length > 0 || resultado.advertencias.length > 0) && (
        <div className="review-grid">
          {resultado.conflictos.length > 0 && (
            <ReviewList
              title="Conflictos"
              items={resultado.conflictos}
              tone="danger"
            />
          )}
          {resultado.advertencias.length > 0 && (
            <ReviewList
              title="Advertencias"
              items={resultado.advertencias}
              tone="warning"
            />
          )}
        </div>
      )}

      <div className="replacement-card">
        <div className="subsection-heading">
          <div>
            <h3>Coberturas y reemplazos</h3>
            <p>Quién cubre, a quién reemplaza y por qué.</p>
          </div>
          <span>{resultado.reemplazos.length}</span>
        </div>
        {resultado.reemplazos.length === 0 ? (
          <div className="empty-table">No se generaron reemplazos.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Unidad</th>
                  <th>Turno</th>
                  <th>Titular</th>
                  <th>Reemplazo</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {resultado.reemplazos.map((reemplazo, indice) => (
                  <tr
                    key={`${reemplazo.unidadOperativa}-${reemplazo.dia}-${reemplazo.empleadoReemplazo}-${indice}`}
                  >
                    <td>{reemplazo.dia}</td>
                    <td>{reemplazo.unidadOperativa}</td>
                    <td>{reemplazo.turno.replace('TURNO ', '')}</td>
                    <td>{reemplazo.empleadoTitular ?? 'Vacante'}</td>
                    <td>
                      <strong>{reemplazo.empleadoReemplazo}</strong>
                      <small>{reemplazo.tipoCobertura}</small>
                    </td>
                    <td>
                      <span className={`reason ${reemplazo.motivo.toLowerCase()}`}>
                        {etiquetaMotivo(reemplazo.motivo)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'blue' | 'orange' | 'yellow' | 'red' | 'green'
}) {
  return (
    <div className={`metric ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function ReviewList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'warning' | 'danger'
}) {
  return (
    <article className={`review-list ${tone}`}>
      <h3>
        <AlertTriangle size={18} /> {title}
      </h3>
      <ul>
        {items.map((item, indice) => (
          <li key={`${item}-${indice}`}>{item}</li>
        ))}
      </ul>
    </article>
  )
}

function mensajeDe(causa: unknown): string {
  return causa instanceof Error ? causa.message : 'Ocurrió un error inesperado.'
}

function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatearFecha(fecha: string | null): string {
  if (!fecha) return 'No detectada'
  return new Intl.DateTimeFormat('es-HN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T00:00:00.000Z`))
}

function formatearRango(inicio: string, fin: string): string {
  if (inicio === fin) return formatearFecha(inicio)
  return `${formatearFecha(inicio)} – ${formatearFecha(fin)}`
}

function etiquetaMotivo(motivo: string): string {
  const etiquetas: Record<string, string> = {
    VACACIONES: 'Vacaciones',
    FERIADO: 'Feriado',
    DESCANSO: 'Descanso',
    FALTANTE: 'Faltante',
    TRANSFERENCIA_FLEXIBLE: 'Cambio de rol',
    AJUSTE_MANUAL: 'Ajuste manual',
  }

  return etiquetas[motivo] ?? motivo
}

function obtenerUnidadesComodin(
  importado: ImportarCalendarioResponseDto | null,
): Record<NombreComodin, string[]> {
  const unidades: Record<NombreComodin, string[]> = {
    Celio: [],
    Lester: [],
  }

  if (!importado) return unidades

  for (const unidad of importado.calendario.unidadesOperativas) {
    for (const empleado of NOMBRES_COMODINES) {
      const existe = unidad.empleados.some(
        (candidato) =>
          candidato.nombre.trim().toUpperCase() === empleado.toUpperCase(),
      )

      if (existe) unidades[empleado].push(unidad.nombre)
    }
  }

  return unidades
}

function unidadesComodinIniciales(
  opciones: Record<NombreComodin, string[]>,
): Record<NombreComodin, string> {
  return {
    Celio: opciones.Celio.length === 1 ? (opciones.Celio[0] ?? '') : '',
    Lester: opciones.Lester.length === 1 ? (opciones.Lester[0] ?? '') : '',
  }
}

function esEmpleadoFlexible(nombre: string): boolean {
  return UNIDAD_BASE_FLEXIBLE[nombre.trim().toUpperCase()] !== undefined
}

export default App
