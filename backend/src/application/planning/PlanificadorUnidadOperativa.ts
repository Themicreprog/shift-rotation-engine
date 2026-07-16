import { AnalizadorEstadoFinalEmpleado } from './AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from './DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from './DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from './GeneradorRotacionSemanal.js';
import {
  IncidenciaDescanso,
  ValidadorDescanso,
} from './ValidadorDescanso.js';
import {
  IncidenciaCobertura,
  ValidadorCobertura,
} from './ValidadorCobertura.js';

import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { ComodinesPlanificacion } from '../../domain/planning/ComodinesPlanificacion.js';
import { EventosPlanificacion } from '../../domain/planning/EventosPlanificacion.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';
import {
  ReemplazoPlanificacion,
  VacantePlanificacion,
} from '../../domain/planning/ReemplazoPlanificacion.js';

type PrioridadCobertura = 'FLEXIBLE' | 'COMODIN';

const EMPLEADOS_FIJOS_POR_UNIDAD = new Map<string, ReadonlySet<string>>([
  ['CACAO', new Set(['NATANAEL', 'RONY'])],
  ['TRUCK STOP', new Set(['NORLAN', 'DERLIN'])],
]);

const EMPLEADOS_FLEXIBLES_POR_UNIDAD = new Map<string, ReadonlySet<string>>([
  ['CACAO', new Set(['EDWIN'])],
  ['TRUCK STOP', new Set(['JEFERSON'])],
]);

const EMPLEADOS_COMODIN = new Set(['CELIO', 'LESTER']);
const ORDEN_BASE_CACAO_PISTA = [
  'JOSE',
  'MARIO',
  'EDWIN',
  'RENE',
  'LUIS D',
  'JULIO',
  'JOEL',
] as const;

export interface ResultadoPlanificadorUnidadOperativa {
  unidadOperativa: UnidadOperativa;
  cambios: ReadonlyArray<string>;
  incidenciasCobertura: ReadonlyArray<IncidenciaCobertura>;
  incidenciasDescanso: ReadonlyArray<IncidenciaDescanso>;
  reemplazos: ReadonlyArray<ReemplazoPlanificacion>;
  vacantesPendientes: ReadonlyArray<VacantePlanificacion>;
}

export type ExclusionesCoberturaPorDia = ReadonlyMap<
  number,
  ReadonlySet<string>
>;

export class PlanificadorUnidadOperativa {
  constructor(
    private readonly analizadorEstadoFinalEmpleado: AnalizadorEstadoFinalEmpleado,
    private readonly decisorPrimerDiaContinuidadSimple: DecisorPrimerDiaContinuidadSimple,
    private readonly generadorRotacionSemanal: GeneradorRotacionSemanal,
    private readonly distribuidorDiaLibre: DistribuidorDiaLibre,
    private readonly validadorCobertura: ValidadorCobertura,
    private readonly validadorDescanso = new ValidadorDescanso(),
  ) {}

  public planificar(
    unidadOperativaOrigen: UnidadOperativa,
    periodoDestino: PeriodoPlanificacion,
    eventos: EventosPlanificacion = EventosPlanificacion.vacio(),
    comodines: ComodinesPlanificacion = ComodinesPlanificacion.vacio(),
  ): UnidadOperativa {
    return this.planificarConCobertura(
      unidadOperativaOrigen,
      periodoDestino,
      eventos,
      comodines,
    ).unidadOperativa;
  }

  public planificarConCobertura(
    unidadOperativaOrigen: UnidadOperativa,
    periodoDestino: PeriodoPlanificacion,
    eventos: EventosPlanificacion = EventosPlanificacion.vacio(),
    comodines: ComodinesPlanificacion = ComodinesPlanificacion.vacio(),
  ): ResultadoPlanificadorUnidadOperativa {
    const empleadosEnRotacion = this.ordenarEmpleadosParaRotacion(
      unidadOperativaOrigen.nombre,
      unidadOperativaOrigen.empleados.filter(
        (empleado) =>
          !this.esNombreEmpleadoComodin(empleado.nombre) &&
          !this.esReservaFlexibleDeCaja(
            unidadOperativaOrigen.nombre,
            empleado.nombre,
          ),
      ),
    );
    const turnosIniciales = this.obtenerTurnosIniciales(
      unidadOperativaOrigen,
      empleadosEnRotacion,
    );
    const limitesDescanso = this.obtenerLimitesDescanso(empleadosEnRotacion);
    const distribucionDiasLibres = this.esUnidadBomberos(
      unidadOperativaOrigen.nombre,
    )
      ? this.distribuidorDiaLibre.distribuirCoordinado(
          empleadosEnRotacion,
          turnosIniciales,
          3,
          limitesDescanso,
        )
      : this.distribuidorDiaLibre.distribuirConContinuidad(
          empleadosEnRotacion,
          limitesDescanso,
          turnosIniciales,
        );

    // El orden y los nombres recibidos desde el calendario son la fuente de
    // verdad: así una sustitución manual no queda reemplazada por una lista
    // rígida de empleados. Los comodines, en cambio, quedan fuera de la
    // rotación normal hasta que realmente haga falta cobertura.
    const resultadosEmpleados = unidadOperativaOrigen.empleados.map((empleado) => {
      if (
        this.esNombreEmpleadoComodin(empleado.nombre) ||
        this.esReservaFlexibleDeCaja(
          unidadOperativaOrigen.nombre,
          empleado.nombre,
        )
      ) {
        return {
          empleado: this.planificarComodin(
            unidadOperativaOrigen.nombre,
            empleado,
            periodoDestino,
            eventos,
          ),
          vacantes: [] as VacantePlanificacion[],
        };
      }

      return this.planificarEmpleado(
        unidadOperativaOrigen,
        empleado,
        periodoDestino,
        distribucionDiasLibres,
        eventos,
      );
    });
    const empleadosDestino = resultadosEmpleados.map(({ empleado }) => empleado);
    const vacantes = resultadosEmpleados.flatMap(({ vacantes }) => vacantes);

    const unidadPlanificada = UnidadOperativa.create({
      nombre: unidadOperativaOrigen.nombre,
      empleados: empleadosDestino,
    });

    return this.repararCobertura(
      unidadPlanificada,
      comodines,
      new Map(),
      vacantes,
    );
  }

  public repararCobertura(
    unidadPlanificada: UnidadOperativa,
    comodines: ComodinesPlanificacion = ComodinesPlanificacion.vacio(),
    exclusionesPorDia: ExclusionesCoberturaPorDia = new Map(),
    vacantes: ReadonlyArray<VacantePlanificacion> = [],
  ): ResultadoPlanificadorUnidadOperativa {
    const coberturaMinima = this.obtenerCoberturaMinima(unidadPlanificada);
    const resultadoConCobertura = this.cubrirFaltantesConCobertura(
      unidadPlanificada,
      coberturaMinima,
      comodines,
      exclusionesPorDia,
      vacantes,
    );

    return {
      unidadOperativa: resultadoConCobertura.unidadOperativa,
      cambios: resultadoConCobertura.cambios,
      incidenciasCobertura: this.validadorCobertura.validar(
        resultadoConCobertura.unidadOperativa,
        coberturaMinima,
      ),
      incidenciasDescanso: this.validadorDescanso.validar(
        resultadoConCobertura.unidadOperativa,
      ),
      reemplazos: resultadoConCobertura.reemplazos,
      vacantesPendientes: resultadoConCobertura.vacantesPendientes,
    };
  }

  private cubrirFaltantesConCobertura(
    unidadPlanificada: UnidadOperativa,
    coberturaMinima: number,
    comodines: ComodinesPlanificacion,
    exclusionesPorDia: ExclusionesCoberturaPorDia = new Map(),
    vacantes: ReadonlyArray<VacantePlanificacion> = [],
  ): {
    unidadOperativa: UnidadOperativa;
    cambios: string[];
    reemplazos: ReemplazoPlanificacion[];
    vacantesPendientes: VacantePlanificacion[];
  } {
    const estadosPorEmpleado = new Map(
      unidadPlanificada.empleados.map((empleado) => [
        empleado.nombre,
        Array.from(
          { length: empleado.totalDias() },
          (_, indice) => empleado.estadoDelDia(indice + 1),
        ),
      ]),
    );
    const cambios: string[] = [];
    const reemplazos: ReemplazoPlanificacion[] = [];
    const vacantesPendientes = [...vacantes];
    const totalDias = unidadPlanificada.empleados.at(0)?.totalDias() ?? 0;

    for (let dia = 1; dia <= totalDias; dia += 1) {
      const disponiblesPorTurno = this.contarDisponibles(
        estadosPorEmpleado,
        dia,
      );

      for (const turnoNecesitado of ['TURNO A', 'TURNO B'] as const) {
        while (disponiblesPorTurno[turnoNecesitado] < coberturaMinima) {
          const indiceVacante = vacantesPendientes.findIndex(
            (vacante) =>
              vacante.dia === dia &&
              vacante.turno === turnoNecesitado &&
              vacante.empleadoTitular !== null &&
              vacante.motivo !== 'FALTANTE',
          );

          if (indiceVacante < 0) {
            break;
          }

          const vacante = vacantesPendientes[indiceVacante];

          if (!vacante) {
            break;
          }

          const candidato = this.seleccionarCandidatoCobertura(
            unidadPlanificada.nombre,
            unidadPlanificada.empleados,
            estadosPorEmpleado,
            dia,
            turnoNecesitado,
            comodines,
            exclusionesPorDia,
            vacante,
          );

          if (!candidato) {
            break;
          }

          const estadosCandidato = estadosPorEmpleado.get(candidato.nombre);

          if (!estadosCandidato) {
            break;
          }

          estadosCandidato[dia - 1] = EstadoTurno.create(turnoNecesitado);

          disponiblesPorTurno[turnoNecesitado] += 1;
          vacantesPendientes.splice(indiceVacante, 1);

          reemplazos.push(
            ReemplazoPlanificacion.create({
              unidadOperativa: unidadPlanificada.nombre,
              dia,
              turno: turnoNecesitado,
              empleadoTitular: vacante.empleadoTitular,
              empleadoReemplazo: candidato.nombre,
              tipoCobertura: candidato.prioridad,
              motivo: vacante.motivo,
            }),
          );
          cambios.push(
            this.construirMensajeCobertura(
              candidato.prioridad,
              candidato.nombre,
              turnoNecesitado,
              dia,
              unidadPlanificada.nombre,
            ),
          );
        }
      }
    }

    return {
      unidadOperativa: UnidadOperativa.create({
        nombre: unidadPlanificada.nombre,
        empleados: unidadPlanificada.empleados.map((empleado) =>
          Empleado.create({
            nombre: empleado.nombre,
            estadosPorDia: estadosPorEmpleado.get(empleado.nombre) ?? [],
          }),
        ),
      }),
      cambios,
      reemplazos,
      vacantesPendientes,
    };
  }

  private seleccionarCandidatoCobertura(
    nombreUnidadOperativa: string,
    empleados: ReadonlyArray<Empleado>,
    estadosPorEmpleado: ReadonlyMap<string, ReadonlyArray<EstadoTurno>>,
    dia: number,
    turnoNecesitado: 'TURNO A' | 'TURNO B',
    comodines: ComodinesPlanificacion,
    exclusionesPorDia: ExclusionesCoberturaPorDia,
    vacante: VacantePlanificacion,
  ): { nombre: string; prioridad: PrioridadCobertura } | null {
    for (const prioridad of ['FLEXIBLE', 'COMODIN'] as const) {
      const candidato = empleados.find((empleado) => {
        const estados = estadosPorEmpleado.get(empleado.nombre);

        if (
          this.estaExcluidoDeCobertura(
            empleado.nombre,
            dia,
            exclusionesPorDia,
          )
        ) {
          return false;
        }

        if (!estados) {
          return false;
        }

        const estadoReserva = estados[dia - 1]?.valor;

        if (estadoReserva !== 'LIBRE' && estadoReserva !== 'OTRO') {
          return false;
        }

        if (!this.puedeActivarComodin(estados, dia)) {
          return false;
        }

        if (
          !this.respetaTransicionTurno(
            estados,
            dia,
            turnoNecesitado,
          )
        ) {
          return false;
        }

        return this.esElegibleParaCobertura(
          nombreUnidadOperativa,
          empleado.nombre,
          prioridad,
          comodines,
          vacante,
        );
      });

      if (candidato) {
        return {
          nombre: candidato.nombre,
          prioridad,
        };
      }
    }

    return null;
  }

  private respetaTransicionTurno(
    estados: ReadonlyArray<EstadoTurno>,
    dia: number,
    turnoNuevo: 'TURNO A' | 'TURNO B',
  ): boolean {
    const estadoAnterior = estados[dia - 2]?.valor;
    const estadoSiguiente = estados[dia]?.valor;

    if (estadoAnterior === 'TURNO B' && turnoNuevo === 'TURNO A') {
      return false;
    }

    return !(turnoNuevo === 'TURNO B' && estadoSiguiente === 'TURNO A');
  }

  private esElegibleParaCobertura(
    nombreUnidadOperativa: string,
    nombreEmpleado: string,
    prioridad: PrioridadCobertura,
    comodines: ComodinesPlanificacion,
    vacante: VacantePlanificacion,
  ): boolean {
    if (this.esEmpleadoFijo(nombreEmpleado)) {
      return false;
    }

    if (prioridad === 'FLEXIBLE') {
      return (
        this.esReservaFlexibleDeCaja(
          nombreUnidadOperativa,
          nombreEmpleado,
        ) &&
        (vacante.motivo === 'DESCANSO' ||
          vacante.motivo === 'VACACIONES') &&
        vacante.empleadoTitular !== null &&
        this.esEmpleadoFijoDeUnidad(
          nombreUnidadOperativa,
          vacante.empleadoTitular,
        )
      );
    }

    return this.esEmpleadoComodin(
      nombreUnidadOperativa,
      nombreEmpleado,
      comodines,
    );
  }

  private esEmpleadoFijo(nombreEmpleado: string): boolean {
    return [...EMPLEADOS_FIJOS_POR_UNIDAD.values()].some((empleados) =>
      empleados.has(nombreEmpleado.trim().toUpperCase()),
    );
  }

  private esEmpleadoFijoDeUnidad(
    nombreUnidadOperativa: string,
    nombreEmpleado: string,
  ): boolean {
    const esUnidadCaja = /\b(?:CAJA|CAJEROS?)\b/i.test(nombreUnidadOperativa);

    return (
      esUnidadCaja &&
      this.perteneceALista(
        EMPLEADOS_FIJOS_POR_UNIDAD,
        nombreUnidadOperativa,
        nombreEmpleado,
      )
    );
  }

  private esEmpleadoFlexible(
    nombreUnidadOperativa: string,
    nombreEmpleado: string,
  ): boolean {
    return this.perteneceALista(
      EMPLEADOS_FLEXIBLES_POR_UNIDAD,
      nombreUnidadOperativa,
      nombreEmpleado,
    );
  }

  private esReservaFlexibleDeCaja(
    nombreUnidadOperativa: string,
    nombreEmpleado: string,
  ): boolean {
    return (
      nombreUnidadOperativa.trim().toUpperCase().includes('CAJA') &&
      this.esEmpleadoFlexible(nombreUnidadOperativa, nombreEmpleado)
    );
  }

  private estaExcluidoDeCobertura(
    nombreEmpleado: string,
    dia: number,
    exclusionesPorDia: ExclusionesCoberturaPorDia,
  ): boolean {
    const empleadosExcluidos = exclusionesPorDia.get(dia);
    const nombreNormalizado = nombreEmpleado.trim().toUpperCase();

    return (
      empleadosExcluidos !== undefined &&
      [...empleadosExcluidos].some(
        (empleado) => empleado.trim().toUpperCase() === nombreNormalizado,
      )
    );
  }

  private esEmpleadoComodin(
    nombreUnidadOperativa: string,
    nombreEmpleado: string,
    comodines: ComodinesPlanificacion,
  ): boolean {
    const empleadoNormalizado = nombreEmpleado.trim().toUpperCase();

    return (
      this.esNombreEmpleadoComodin(empleadoNormalizado) &&
      comodines.esComodin(nombreUnidadOperativa, nombreEmpleado)
    );
  }

  private esNombreEmpleadoComodin(nombreEmpleado: string): boolean {
    return EMPLEADOS_COMODIN.has(nombreEmpleado.trim().toUpperCase());
  }

  private perteneceALista(
    listaPorUnidad: ReadonlyMap<string, ReadonlySet<string>>,
    nombreUnidadOperativa: string,
    nombreEmpleado: string,
  ): boolean {
    const unidadNormalizada = this.normalizarEstacion(nombreUnidadOperativa);
    const empleadoNormalizado = nombreEmpleado.trim().toUpperCase();

    return (
      listaPorUnidad.get(unidadNormalizada)?.has(empleadoNormalizado) ?? false
    );
  }

  private construirMensajeCobertura(
    prioridad: PrioridadCobertura,
    nombreEmpleado: string,
    turnoNecesitado: 'TURNO A' | 'TURNO B',
    dia: number,
    nombreUnidadOperativa: string,
  ): string {
    if (prioridad === 'COMODIN') {
      return `Comodín ${nombreEmpleado} reasignado a ${turnoNecesitado} el día ${dia} en ${nombreUnidadOperativa}.`;
    }

    return `Flexible ${nombreEmpleado} reasignado a ${turnoNecesitado} el día ${dia} en ${nombreUnidadOperativa}.`;
  }

  private contarDisponibles(
    estadosPorEmpleado: ReadonlyMap<string, ReadonlyArray<EstadoTurno>>,
    dia: number,
  ): Record<'TURNO A' | 'TURNO B', number> {
    const disponibles = { 'TURNO A': 0, 'TURNO B': 0 };

    for (const estados of estadosPorEmpleado.values()) {
      const estado = estados[dia - 1]?.valor;

      if (estado === 'TURNO A' || estado === 'TURNO B') {
        disponibles[estado] += 1;
      }
    }

    return disponibles;
  }

  private obtenerCoberturaMinima(unidadOperativa: UnidadOperativa): number {
    const nombre = unidadOperativa.nombre.toUpperCase();

    return nombre.includes('CAJA') || nombre.includes('CAJER')
      ? 1
      : 3;
  }

  private normalizarEstacion(nombreUnidadOperativa: string): string {
    return nombreUnidadOperativa
      .trim()
      .toUpperCase()
      .replace(/^E\/S\s+/, '')
      .replace(/\s+ROD$/, '')
      .replace(/\s+(PISTA|CAJA|CAJEROS)$/, '')
      .trim();
  }


  private obtenerTurnosIniciales(
    unidadOperativa: UnidadOperativa,
    empleados: ReadonlyArray<Empleado>,
  ): ReadonlyMap<string, EstadoTurno> {
    return new Map(
      empleados.map((empleado) => {
        const resumen = this.analizadorEstadoFinalEmpleado.analyze(
          unidadOperativa,
          empleado,
        );
        const estadoCalculado = this.decisorPrimerDiaContinuidadSimple.decide(
          resumen,
        );

        // La distribución coordinada debe usar exactamente el turno con el
        // que el empleado iniciará el período. Si el último día fue LIBRE,
        // el decisor ya aplica el cambio al turno opuesto. Usar aquí la
        // última asignación operativa anterior descoordina el grupo: el
        // distribuidor calcula los descansos con un turno, pero el generador
        // empieza al empleado en otro. Ese desfase era el origen de los
        // patrones 1/5 y 2/4 observados en pista.
        const mantieneTurnoFijo = this.esEmpleadoFijoDeUnidad(
          unidadOperativa.nombre,
          empleado.nombre,
        );
        const estado =
          mantieneTurnoFijo && resumen.ultimaAsignacionOperativaValida !== null
            ? resumen.ultimaAsignacionOperativaValida
            : estadoCalculado.esAsignacionOperativa()
              ? estadoCalculado
              : resumen.ultimaAsignacionOperativaValida ?? estadoCalculado;

        return [empleado.nombre, estado] as const;
      }),
    );
  }

  private esUnidadBomberos(nombreUnidadOperativa: string): boolean {
    const nombre = nombreUnidadOperativa.trim().toUpperCase();

    return !nombre.includes('CAJA') && !nombre.includes('CAJER');
  }

  private ordenarEmpleadosParaRotacion(
    nombreUnidadOperativa: string,
    empleados: ReadonlyArray<Empleado>,
  ): Empleado[] {
    const esPistaCacao =
      this.normalizarEstacion(nombreUnidadOperativa) === 'CACAO' &&
      nombreUnidadOperativa.toUpperCase().includes('PISTA');

    if (!esPistaCacao) {
      return [...empleados];
    }

    const posicionPorEmpleado = new Map<string, number>(
      ORDEN_BASE_CACAO_PISTA.map((nombre, indice) => [nombre, indice]),
    );

    return empleados
      .map((empleado, indiceOriginal) => ({ empleado, indiceOriginal }))
      .sort((primero, segundo) => {
        const posicionPrimero =
          posicionPorEmpleado.get(primero.empleado.nombre.toUpperCase()) ??
          Number.MAX_SAFE_INTEGER;
        const posicionSegundo =
          posicionPorEmpleado.get(segundo.empleado.nombre.toUpperCase()) ??
          Number.MAX_SAFE_INTEGER;

        return (
          posicionPrimero - posicionSegundo ||
          primero.indiceOriginal - segundo.indiceOriginal
        );
      })
      .map(({ empleado }) => empleado);
  }

  private puedeActivarComodin(
    estados: ReadonlyArray<EstadoTurno>,
    dia: number,
  ): boolean {
    const inicioVentana = Math.max(0, dia - 7);
    const diasOperativosPrevios = estados
      .slice(inicioVentana, dia - 1)
      .filter((estado) => estado.esAsignacionOperativa()).length;

    return diasOperativosPrevios < 6;
  }

  private planificarEmpleado(
    unidadOperativaOrigen: UnidadOperativa,
    empleadoOrigen: Empleado,
    periodoDestino: PeriodoPlanificacion,
    distribucionDiasLibres: ReadonlyMap<string, number>,
    eventos: EventosPlanificacion,
  ): { empleado: Empleado; vacantes: VacantePlanificacion[] } {
    const resumen =
      this.analizadorEstadoFinalEmpleado.analyze(
        unidadOperativaOrigen,
        empleadoOrigen,
      );

    const estadoInicialCalculado =
      this.decisorPrimerDiaContinuidadSimple.decide(
        resumen,
      );
    const estadoInicial =
      this.esEmpleadoFijoDeUnidad(
        unidadOperativaOrigen.nombre,
        empleadoOrigen.nombre,
      ) && resumen.ultimaAsignacionOperativaValida !== null
        ? resumen.ultimaAsignacionOperativaValida
        : estadoInicialCalculado;

    const posicionLibre = this.distribuidorDiaLibre.obtenerDiaLibre(
      empleadoOrigen.nombre,
      distribucionDiasLibres,
    );

    const planificacion = this.generarEstadosConEventos(
      unidadOperativaOrigen.nombre,
      empleadoOrigen.nombre,
      estadoInicial,
      periodoDestino,
      posicionLibre,
      eventos,
    );

    return {
      empleado: Empleado.create({
        nombre: empleadoOrigen.nombre,
        estadosPorDia: planificacion.estados,
      }),
      vacantes: planificacion.vacantes,
    };
  }

  private generarEstadosConEventos(
    unidadOperativa: string,
    nombreEmpleado: string,
    estadoInicial: EstadoTurno,
    periodoDestino: PeriodoPlanificacion,
    posicionLibre: number,
    eventos: EventosPlanificacion,
  ): { estados: EstadoTurno[]; vacantes: VacantePlanificacion[] } {
    const totalDias = periodoDestino.totalDias();
    const mantieneTurnoFijo = this.esEmpleadoFijoDeUnidad(
      unidadOperativa,
      nombreEmpleado,
    );
    const estadosBase = mantieneTurnoFijo
      ? this.generarEstadosTurnoFijo(
          estadoInicial,
          totalDias,
          posicionLibre,
        )
      : this.generadorRotacionSemanal.generar(
          estadoInicial,
          totalDias,
          posicionLibre,
        );
    const eventosPorDia = Array.from({ length: totalDias }, (_, indice) =>
      eventos
        .activosParaEmpleadoEn(
          nombreEmpleado,
          periodoDestino.fechaDelDia(indice + 1),
          unidadOperativa,
        )
        .at(-1),
    );
    const vacantes: VacantePlanificacion[] = [];

    if (!estadoInicial.esAsignacionOperativa()) {
      const estados = estadosBase.map((estado, indice) => {
        const evento = eventosPorDia[indice];

        return evento ? EstadoTurno.create(evento.tipo) : estado;
      });

      return { estados, vacantes };
    }

    const estados: EstadoTurno[] = [];

    for (let inicioSemana = 0; inicioSemana < totalDias; inicioSemana += 7) {
      const cantidadDiasSemana = Math.min(7, totalDias - inicioSemana);
      const indicesSemana = Array.from(
        { length: cantidadDiasSemana },
        (_, indice) => indice,
      );
      const indiceLibreBase = indicesSemana.find(
        (indice) => estadosBase[inicioSemana + indice]?.valor === 'LIBRE',
      );
      const primerIndiceEvento = indicesSemana.find(
        (indice) => eventosPorDia[inicioSemana + indice] !== undefined,
      );

      if (primerIndiceEvento === undefined) {
        estados.push(
          ...estadosBase.slice(
            inicioSemana,
            inicioSemana + cantidadDiasSemana,
          ),
        );
        continue;
      }

      const indiceEventoPausa =
        indiceLibreBase !== undefined &&
        eventosPorDia[inicioSemana + indiceLibreBase] !== undefined
          ? indiceLibreBase
          : primerIndiceEvento;

      let turnoActual =
        mantieneTurnoFijo || Math.floor(inicioSemana / 7) % 2 === 0
          ? EstadoTurno.create(estadoInicial.valor)
          : this.alternarTurno(estadoInicial);

      for (let indice = 0; indice < cantidadDiasSemana; indice += 1) {
        const indiceAbsoluto = inicioSemana + indice;
        const evento = eventosPorDia[indiceAbsoluto];

        if (evento) {
          vacantes.push({
            unidadOperativa,
            dia: indiceAbsoluto + 1,
            turno: turnoActual.valor as 'TURNO A' | 'TURNO B',
            empleadoTitular: nombreEmpleado,
            motivo: evento.tipo,
          });

          estados.push(EstadoTurno.create(evento.tipo));
        } else {
          // El evento ya protege el descanso de la semana. El LIBRE base se
          // convierte en jornada y el cambio de turno ocurre tras el primer
          // evento, evitando duplicar dias no laborados.
          estados.push(EstadoTurno.create(turnoActual.valor));
        }

        if (indice === indiceEventoPausa && !mantieneTurnoFijo) {
          turnoActual = this.alternarTurno(turnoActual);
        }
      }
    }

    this.registrarVacantesDescanso(
      vacantes,
      estados,
      estadosBase,
      estadoInicial,
      unidadOperativa,
      nombreEmpleado,
    );

    return { estados, vacantes };
  }

  private registrarVacantesDescanso(
    vacantes: VacantePlanificacion[],
    estados: ReadonlyArray<EstadoTurno>,
    estadosBase: ReadonlyArray<EstadoTurno>,
    estadoInicial: EstadoTurno,
    unidadOperativa: string,
    nombreEmpleado: string,
  ): void {
    for (let indice = 0; indice < estados.length; indice += 1) {
      if (estados[indice]?.valor !== 'LIBRE') {
        continue;
      }

      let turnoDescanso = estadoInicial;

      for (let anterior = indice - 1; anterior >= 0; anterior -= 1) {
        const estadoAnterior = estadosBase[anterior];

        if (estadoAnterior?.esAsignacionOperativa()) {
          turnoDescanso = estadoAnterior;
          break;
        }
      }

      vacantes.push({
        unidadOperativa,
        dia: indice + 1,
        turno: turnoDescanso.valor as 'TURNO A' | 'TURNO B',
        empleadoTitular: nombreEmpleado,
        motivo: 'DESCANSO',
      });
    }
  }

  private alternarTurno(turno: EstadoTurno): EstadoTurno {
    return EstadoTurno.create(
      turno.valor === 'TURNO A' ? 'TURNO B' : 'TURNO A',
    );
  }

  private generarEstadosTurnoFijo(
    turno: EstadoTurno,
    cantidadDias: number,
    posicionLibre: number,
  ): EstadoTurno[] {
    return Array.from({ length: cantidadDias }, (_, indice) =>
      indice % 7 === posicionLibre
        ? EstadoTurno.create('LIBRE')
        : EstadoTurno.create(turno.valor),
    );
  }

  private obtenerLimitesDescanso(
    empleados: ReadonlyArray<Empleado>,
  ): ReadonlyMap<string, number> {
    return new Map(
      empleados.map((empleado) => {
        let diasOperativosConsecutivos = 0;

        for (let dia = empleado.totalDias(); dia >= 1; dia -= 1) {
          if (!empleado.estadoDelDia(dia).esAsignacionOperativa()) {
            break;
          }

          diasOperativosConsecutivos += 1;
        }

        return [
          empleado.nombre,
          Math.max(0, 6 - diasOperativosConsecutivos),
        ] as const;
      }),
    );
  }

  private planificarComodin(
    unidadOperativa: string,
    empleadoOrigen: Empleado,
    periodoDestino: PeriodoPlanificacion,
    eventos: EventosPlanificacion,
  ): Empleado {
    const estados = Array.from(
      { length: periodoDestino.totalDias() },
      () => EstadoTurno.create('OTRO'),
    );

    const estadosConEventos = estados.map((estado, indice) => {
      const eventosActivos = eventos.activosParaEmpleadoEn(
        empleadoOrigen.nombre,
        periodoDestino.fechaDelDia(indice + 1),
        unidadOperativa,
      );
      const evento = eventosActivos.at(-1);

      return evento ? EstadoTurno.create(evento.tipo) : estado;
    });

    return Empleado.create({
      nombre: empleadoOrigen.nombre,
      estadosPorDia: estadosConEventos,
    });
  }
}