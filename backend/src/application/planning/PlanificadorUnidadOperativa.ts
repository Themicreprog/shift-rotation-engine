import { AnalizadorEstadoFinalEmpleado } from './AnalizadorEstadoFinalEmpleado.js';
import { DecisorPrimerDiaContinuidadSimple } from './DecisorPrimerDiaContinuidadSimple.js';
import { DistribuidorDiaLibre } from './DistribuidorDiaLibre.js';
import { GeneradorRotacionSemanal } from './GeneradorRotacionSemanal.js';
import { PoliticaCoberturaOperativa } from './PoliticaCoberturaOperativa.js';
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
    private readonly politicaCobertura = new PoliticaCoberturaOperativa(),
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
    const distribucionDiasLibres = this.distribuirDiasLibres(
      unidadOperativaOrigen,
      periodoDestino,
      empleadosEnRotacion,
      turnosIniciales,
      limitesDescanso,
      eventos,
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

    const unidadPlanificada = this.ajustarPrioridadTurnoBFinDeSemana(
      UnidadOperativa.create({
        nombre: unidadOperativaOrigen.nombre,
        empleados: empleadosDestino,
      }),
      periodoDestino,
    );

    return this.repararCobertura(
      unidadPlanificada,
      comodines,
      new Map(),
      vacantes,
      periodoDestino,
    );
  }

  public repararCobertura(
    unidadPlanificada: UnidadOperativa,
    comodines: ComodinesPlanificacion = ComodinesPlanificacion.vacio(),
    exclusionesPorDia: ExclusionesCoberturaPorDia = new Map(),
    vacantes: ReadonlyArray<VacantePlanificacion> = [],
    periodoDestino?: PeriodoPlanificacion,
  ): ResultadoPlanificadorUnidadOperativa {
    const resultadoConCobertura = this.cubrirFaltantesConCobertura(
      unidadPlanificada,
      comodines,
      exclusionesPorDia,
      vacantes,
      periodoDestino,
    );

    const unidadFinal = periodoDestino === undefined
      ? resultadoConCobertura.unidadOperativa
      : this.ajustarPrioridadTurnoBFinDeSemana(
          resultadoConCobertura.unidadOperativa,
          periodoDestino,
        );

    return {
      unidadOperativa: unidadFinal,
      cambios: resultadoConCobertura.cambios,
      incidenciasCobertura: this.validadorCobertura.validar(
        unidadFinal,
        (dia) => this.obtenerRequerimientoCobertura(
          unidadFinal.nombre,
          periodoDestino,
          dia,
        ),
      ),
      incidenciasDescanso: this.validadorDescanso.validar(
        unidadFinal,
      ),
      reemplazos: resultadoConCobertura.reemplazos,
      vacantesPendientes: resultadoConCobertura.vacantesPendientes,
    };
  }

  private cubrirFaltantesConCobertura(
    unidadPlanificada: UnidadOperativa,
    comodines: ComodinesPlanificacion,
    exclusionesPorDia: ExclusionesCoberturaPorDia = new Map(),
    vacantes: ReadonlyArray<VacantePlanificacion> = [],
    periodoDestino?: PeriodoPlanificacion,
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
      const requerimiento = this.obtenerRequerimientoCobertura(
        unidadPlanificada.nombre,
        periodoDestino,
        dia,
      );
      const turnosAReparar = requerimiento.turnoB > requerimiento.turnoA
        ? (['TURNO B', 'TURNO A'] as const)
        : (['TURNO A', 'TURNO B'] as const);

      for (const turnoNecesitado of turnosAReparar) {
        const minimoNecesitado =
          turnoNecesitado === 'TURNO A'
            ? requerimiento.turnoA
            : requerimiento.turnoB;

        while (disponiblesPorTurno[turnoNecesitado] < minimoNecesitado) {
          const indiceVacante = this.buscarIndiceVacanteParaCobertura(
            vacantesPendientes,
            unidadPlanificada.nombre,
            dia,
            turnoNecesitado,
            this.fechaDelDia(periodoDestino, dia),
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
            this.fechaDelDia(periodoDestino, dia),
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

  private buscarIndiceVacanteParaCobertura(
    vacantes: ReadonlyArray<VacantePlanificacion>,
    nombreUnidadOperativa: string,
    dia: number,
    turnoNecesitado: 'TURNO A' | 'TURNO B',
    fecha: Date,
  ): number {
    const exacta = vacantes.findIndex(
      (vacante) =>
        vacante.dia === dia &&
        vacante.turno === turnoNecesitado &&
        vacante.empleadoTitular !== null &&
        vacante.motivo !== 'FALTANTE',
    );

    if (exacta >= 0) {
      return exacta;
    }

    // Viernes y sábado la prioridad operativa es garantizar cuatro personas
    // en TURNO B. Si una vacación dejó la dotación total en seis, la ausencia
    // puede ser cubierta por Lester directamente en B aunque el titular
    // perteneciera a A. No se inventa un faltante: se reutiliza la vacante
    // real de vacaciones y se conserva su trazabilidad.
    if (
      turnoNecesitado === 'TURNO B' &&
      this.esUnidadBomberos(nombreUnidadOperativa) &&
      this.politicaCobertura.esViernesOSabado(fecha)
    ) {
      return vacantes.findIndex(
        (vacante) =>
          vacante.dia === dia &&
          vacante.empleadoTitular !== null &&
          vacante.motivo === 'VACACIONES',
      );
    }

    return -1;
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
    fecha: Date,
  ): { nombre: string; prioridad: PrioridadCobertura } | null {
    for (const prioridad of ['FLEXIBLE', 'COMODIN'] as const) {
      const candidatos = empleados.filter((empleado) => {
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
          fecha,
        );
      });
      const candidato = this.ordenarCandidatosCobertura(
        candidatos,
        vacante,
        prioridad,
      )[0];

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
    fecha: Date,
  ): boolean {
    if (this.esEmpleadoFijo(nombreEmpleado)) {
      return false;
    }

    const nombreNormalizado = nombreEmpleado.trim().toUpperCase();
    const esCaja = this.politicaCobertura.esUnidadCaja(nombreUnidadOperativa);

    if (prioridad === 'FLEXIBLE') {
      return (
        esCaja &&
        vacante.motivo === 'VACACIONES' &&
        vacante.empleadoTitular !== null &&
        this.esReservaFlexibleDeCaja(
          nombreUnidadOperativa,
          nombreEmpleado,
        ) &&
        this.esEmpleadoFijoDeUnidad(
          nombreUnidadOperativa,
          vacante.empleadoTitular,
        )
      );
    }

    if (!comodines.esComodin(nombreUnidadOperativa, nombreEmpleado)) {
      return false;
    }

    if (nombreNormalizado === 'LESTER') {
      return (
        !esCaja &&
        (vacante.motivo === 'VACACIONES' ||
          vacante.motivo === 'TRANSFERENCIA_FLEXIBLE')
      );
    }

    if (nombreNormalizado !== 'CELIO' || this.politicaCobertura.esMartes(fecha)) {
      return false;
    }

    if (esCaja) {
      return vacante.motivo === 'DESCANSO';
    }

    return (
      vacante.motivo === 'DESCANSO' ||
      vacante.motivo === 'VACACIONES' ||
      vacante.motivo === 'FERIADO' ||
      vacante.motivo === 'FALTANTE' ||
      vacante.motivo === 'TRANSFERENCIA_FLEXIBLE'
    );
  }

  private ordenarCandidatosCobertura(
    candidatos: ReadonlyArray<Empleado>,
    vacante: VacantePlanificacion,
    prioridad: PrioridadCobertura,
  ): Empleado[] {
    if (prioridad !== 'COMODIN') {
      return [...candidatos];
    }

    return [...candidatos].sort((primero, segundo) => {
      const puntaje = (empleado: Empleado): number => {
        const nombre = empleado.nombre.trim().toUpperCase();

        if (
          vacante.motivo === 'VACACIONES' ||
          vacante.motivo === 'TRANSFERENCIA_FLEXIBLE'
        ) {
          return nombre === 'LESTER' ? 0 : nombre === 'CELIO' ? 1 : 10;
        }

        return nombre === 'CELIO' ? 0 : 10;
      };

      return puntaje(primero) - puntaje(segundo);
    });
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

  private normalizarEstacion(nombreUnidadOperativa: string): string {
    return nombreUnidadOperativa
      .trim()
      .toUpperCase()
      .replace(/^E\/S\s+/, '')
      .replace(/\s+ROD$/, '')
      .replace(/\s+(PISTA|CAJA|CAJEROS)$/, '')
      .trim();
  }


  private distribuirDiasLibres(
    unidadOperativa: UnidadOperativa,
    periodoDestino: PeriodoPlanificacion,
    empleados: ReadonlyArray<Empleado>,
    turnosIniciales: ReadonlyMap<string, EstadoTurno>,
    limitesDescanso: ReadonlyMap<string, number>,
    eventos: EventosPlanificacion,
  ): ReadonlyMap<string, number> {
    if (this.esUnidadBomberos(unidadOperativa.nombre)) {
      const posicionesDescansoPermitidas = new Set<number>();
      const requerimientoPorPosicion = new Map<
        number,
        { turnoA: number; turnoB: number }
      >();

      for (let posicion = 0; posicion < 7; posicion += 1) {
        const fecha = this.fechaPosicionSemanal(periodoDestino, posicion);

        if (this.politicaCobertura.esDiaDescansoPermitido(fecha)) {
          posicionesDescansoPermitidas.add(posicion);
        }

        const requerimiento = this.politicaCobertura.esViernesOSabado(fecha)
          ? { turnoA: 3, turnoB: 3 }
          : this.politicaCobertura.requerimiento(
              unidadOperativa.nombre,
              fecha,
            );
        requerimientoPorPosicion.set(posicion, requerimiento);
      }

      return this.distribuidorDiaLibre.distribuirCoordinado(
        empleados,
        turnosIniciales,
        3,
        limitesDescanso,
        {
          posicionesDescansoPermitidas,
          requerimientoPorPosicion,
        },
      );
    }

    const estacion = this.normalizarEstacion(unidadOperativa.nombre);

    if (
      empleados.length === 2 &&
      (estacion === 'CACAO' || estacion === 'TRUCK STOP')
    ) {
      let posicionTurnoA = this.posicionDeDiaSemana(
        periodoDestino,
        estacion === 'CACAO' ? 1 : 0,
      );
      let posicionTurnoB = this.posicionDeDiaSemana(
        periodoDestino,
        estacion === 'CACAO' ? 3 : 4,
      );
      const empleadoA = empleados.find(
        (empleado) => turnosIniciales.get(empleado.nombre)?.valor === 'TURNO A',
      );
      const empleadoB = empleados.find(
        (empleado) => turnosIniciales.get(empleado.nombre)?.valor === 'TURNO B',
      );

      if (empleadoA && empleadoB) {
        const eventoAChocaConDescansoB = this.eventoCoincideConPosicionSemanal(
          eventos,
          empleadoA.nombre,
          unidadOperativa.nombre,
          periodoDestino,
          posicionTurnoB,
        );
        const eventoBChocaConDescansoA = this.eventoCoincideConPosicionSemanal(
          eventos,
          empleadoB.nombre,
          unidadOperativa.nombre,
          periodoDestino,
          posicionTurnoA,
        );

        // Si las vacaciones de un cajero coinciden con el descanso del otro,
        // se intercambian los días base. Así Edwin/Jeferson cubren la vacación
        // y Celio queda libre para cubrir el descanso en otra fecha o apoyar
        // pista, sin crear dos ausencias simultáneas en caja.
        if (eventoAChocaConDescansoB !== eventoBChocaConDescansoA) {
          [posicionTurnoA, posicionTurnoB] = [
            posicionTurnoB,
            posicionTurnoA,
          ];
        }
      }

      return this.distribuidorDiaLibre.distribuirCajaEscalonada(
        empleados,
        turnosIniciales,
        limitesDescanso,
        posicionTurnoA,
        posicionTurnoB,
      );
    }

    return this.distribuidorDiaLibre.distribuirConContinuidad(
      empleados,
      limitesDescanso,
      turnosIniciales,
    );
  }

  private eventoCoincideConPosicionSemanal(
    eventos: EventosPlanificacion,
    nombreEmpleado: string,
    unidadOperativa: string,
    periodo: PeriodoPlanificacion,
    posicionSemanal: number,
  ): boolean {
    for (let dia = posicionSemanal + 1; dia <= periodo.totalDias(); dia += 7) {
      if (
        eventos.activosParaEmpleadoEn(
          nombreEmpleado,
          periodo.fechaDelDia(dia),
          unidadOperativa,
        ).length > 0
      ) {
        return true;
      }
    }

    return false;
  }

  private posicionDeDiaSemana(
    periodoDestino: PeriodoPlanificacion,
    diaSemanaBuscado: number,
  ): number {
    for (let posicion = 0; posicion < 7; posicion += 1) {
      if (
        this.fechaPosicionSemanal(periodoDestino, posicion).getUTCDay() ===
        diaSemanaBuscado
      ) {
        return posicion;
      }
    }

    return 0;
  }

  private ajustarPrioridadTurnoBFinDeSemana(
    unidad: UnidadOperativa,
    periodoDestino: PeriodoPlanificacion,
  ): UnidadOperativa {
    if (!this.esUnidadBomberos(unidad.nombre)) {
      return unidad;
    }

    const estadosPorEmpleado = new Map(
      unidad.empleados.map((empleado) => [
        empleado.nombre,
        Array.from(
          { length: empleado.totalDias() },
          (_, indice) => empleado.estadoDelDia(indice + 1),
        ),
      ]),
    );
    const totalDias = unidad.empleados.at(0)?.totalDias() ?? 0;

    for (let dia = 1; dia <= totalDias; dia += 1) {
      const fecha = periodoDestino.fechaDelDia(dia);

      if (!this.politicaCobertura.esViernesOSabado(fecha)) {
        continue;
      }

      const disponibles = this.contarDisponibles(estadosPorEmpleado, dia);

      while (disponibles['TURNO B'] < 4 && disponibles['TURNO A'] > 3) {
        const candidatos = unidad.empleados
          .filter((empleado) => {
            if (this.esNombreEmpleadoComodin(empleado.nombre)) {
              return false;
            }

            return estadosPorEmpleado.get(empleado.nombre)?.[dia - 1]?.valor ===
              'TURNO A';
          })
          .sort((primero, segundo) => {
            const puntaje = (empleado: Empleado): number => {
              const estados = estadosPorEmpleado.get(empleado.nombre);
              const anterior = estados?.[dia - 2]?.valor;
              const siguiente = estados?.[dia]?.valor;

              if (anterior === 'TURNO B') {
                return 0;
              }

              if (
                siguiente === 'LIBRE' ||
                siguiente === 'OTRO' ||
                siguiente === 'TURNO B' ||
                siguiente === undefined
              ) {
                return 1;
              }

              return 5;
            };

            return puntaje(primero) - puntaje(segundo);
          });
        const candidato = candidatos[0];

        if (!candidato) {
          break;
        }

        const estados = estadosPorEmpleado.get(candidato.nombre);

        if (!estados) {
          break;
        }

        estados[dia - 1] = EstadoTurno.create('TURNO B');
        disponibles['TURNO A'] -= 1;
        disponibles['TURNO B'] += 1;
      }
    }

    return UnidadOperativa.create({
      nombre: unidad.nombre,
      empleados: unidad.empleados.map((empleado) =>
        Empleado.create({
          nombre: empleado.nombre,
          estadosPorDia: estadosPorEmpleado.get(empleado.nombre) ?? [],
        }),
      ),
    });
  }

  private fechaPosicionSemanal(
    periodoDestino: PeriodoPlanificacion,
    posicion: number,
  ): Date {
    const fecha = new Date(periodoDestino.fechaInicio);
    fecha.setUTCDate(fecha.getUTCDate() + posicion);
    return fecha;
  }

  private obtenerRequerimientoCobertura(
    nombreUnidadOperativa: string,
    periodoDestino: PeriodoPlanificacion | undefined,
    dia: number,
  ): { turnoA: number; turnoB: number } {
    if (periodoDestino === undefined) {
      return this.politicaCobertura.esUnidadCaja(nombreUnidadOperativa)
        ? { turnoA: 1, turnoB: 1 }
        : { turnoA: 3, turnoB: 3 };
    }

    return this.politicaCobertura.requerimiento(
      nombreUnidadOperativa,
      periodoDestino.fechaDelDia(dia),
    );
  }

  private fechaDelDia(
    periodoDestino: PeriodoPlanificacion | undefined,
    dia: number,
  ): Date {
    return periodoDestino?.fechaDelDia(dia) ??
      new Date('2026-01-05T00:00:00.000Z');
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
          const estadoBaseDelDia = estadosBase[indiceAbsoluto];

          // VACACIONES y FERIADO ya cuentan como descanso semanal. Cuando el
          // evento coincide con el LIBRE que el empleado tenía programado, no
          // existe una jornada que reemplazar: crear una vacante en ese día
          // obligaba al comodín a trabajar siete días seguidos y generaba una
          // cobertura artificialmente imposible. En los demás días sí se
          // conserva la vacante del turno que el empleado habría trabajado.
          if (
            estadoBaseDelDia?.esAsignacionOperativa() ||
            !this.esUnidadBomberos(unidadOperativa)
          ) {
            vacantes.push({
              unidadOperativa,
              dia: indiceAbsoluto + 1,
              turno: turnoActual.valor as 'TURNO A' | 'TURNO B',
              empleadoTitular: nombreEmpleado,
              motivo: evento.tipo,
            });
          }

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
      const fecha = periodoDestino.fechaDelDia(indice + 1);
      const eventosActivos = eventos.activosParaEmpleadoEn(
        empleadoOrigen.nombre,
        fecha,
        unidadOperativa,
      );
      const evento = eventosActivos.at(-1);

      if (evento) {
        return EstadoTurno.create(evento.tipo);
      }

      // Los martes Celio realiza la ruta administrativa de facturas. No se
      // representa como turno ni como descanso: permanece en OTRO.
      if (
        empleadoOrigen.nombre.trim().toUpperCase() === 'CELIO' &&
        this.politicaCobertura.esMartes(fecha)
      ) {
        return EstadoTurno.create('OTRO');
      }

      return estado;
    });

    return Empleado.create({
      nombre: empleadoOrigen.nombre,
      estadosPorDia: estadosConEventos,
    });
  }
}