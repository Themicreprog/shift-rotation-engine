import { AnalizadorEstadoFinalCalendario } from './AnalizadorEstadoFinalCalendario.js';
import { PlanificacionInputValidator } from './PlanificacionInputValidator.js';
import { PoliticaCoberturaOperativa } from './PoliticaCoberturaOperativa.js';
import {
  PlanificadorUnidadOperativa,
  ResultadoPlanificadorUnidadOperativa,
} from './PlanificadorUnidadOperativa.js';
import { SolicitudPlanificacion } from './SolicitudPlanificacion.js';
import { ResultadoPlanificacion } from './ResultadoPlanificacion.js';
import { ValidadorCobertura } from './ValidadorCobertura.js';
import { ValidadorDescanso } from './ValidadorDescanso.js';
import { Calendario } from '../../domain/Calendario.js';
import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { ComodinesPlanificacion } from '../../domain/planning/ComodinesPlanificacion.js';
import { PeriodoPlanificacion } from '../../domain/planning/PeriodoPlanificacion.js';
import {
  ReemplazoPlanificacion,
  VacantePlanificacion,
} from '../../domain/planning/ReemplazoPlanificacion.js';

interface CoordinacionFlexible {
  readonly empleado: string;
  readonly unidadPista: string;
  readonly unidadCaja: string;
}

const COORDINACIONES_FLEXIBLES: ReadonlyArray<CoordinacionFlexible> = [
  {
    empleado: 'Edwin',
    unidadPista: 'CACAO PISTA',
    unidadCaja: 'CACAO CAJA',
  },
  {
    empleado: 'Jeferson',
    unidadPista: 'TRUCK STOP PISTA',
    unidadCaja: 'TRUCK STOP CAJA',
  },
];

export class PlanningEngine {
  constructor(
    private readonly planificacionInputValidator: PlanificacionInputValidator,
    private readonly analizadorEstadoFinalCalendario: AnalizadorEstadoFinalCalendario,
    private readonly planificadorUnidadOperativa: PlanificadorUnidadOperativa,
    private readonly validadorCobertura = new ValidadorCobertura(),
    private readonly validadorDescanso = new ValidadorDescanso(),
    private readonly politicaCobertura = new PoliticaCoberturaOperativa(),
  ) {}

  execute(solicitud: SolicitudPlanificacion): ResultadoPlanificacion {
    const validacion = this.planificacionInputValidator.validate(solicitud);

    if (!validacion.esValida) {
      return ResultadoPlanificacion.conConflictos(
        solicitud.calendarioOrigen,
        validacion.errores,
      );
    }

    const mesDestino = solicitud.periodoDestino.fechaInicio.getUTCMonth() + 1;
    const anioDestino =
      solicitud.periodoDestino.fechaInicio.getUTCFullYear();
    const diasHeredados = this.calcularDiasHeredados(solicitud);
    const periodoGeneracion = this.crearPeriodoGeneracion(
      solicitud.periodoDestino,
      diasHeredados,
    );
    const comodinesOperativos = solicitud.comodines.combinar(
      ComodinesPlanificacion.reglasOperativas(),
    );
    const calendarioDestino = new Calendario(
      `PLANIFICACION-${anioDestino}-${String(mesDestino).padStart(2, '0')}-COMPLETO`,
      {
        mes: mesDestino,
        anio: anioDestino,
        fechaInicio: solicitud.periodoDestino.fechaInicio,
        fechaFin: solicitud.periodoDestino.fechaFin,
      },
    );

    const unidadesOrigen = solicitud.alcanceOperativo.unidadesOperativas.map(
      (nombreUnidadOperativa) => {
        const unidadOperativa =
          solicitud.calendarioOrigen.buscarUnidadOperativa(nombreUnidadOperativa);

        if (!unidadOperativa) {
          throw new Error(
            `La unidad operativa "${nombreUnidadOperativa}" no existe en el calendario origen.`,
          );
        }

        return unidadOperativa;
      },
    );

    this.analizadorEstadoFinalCalendario.analyze(solicitud.calendarioOrigen);

    const unidadesPreparadas = unidadesOrigen.map((unidadOrigen) =>
      this.prepararReservasEspeciales(unidadOrigen, unidadesOrigen),
    );
    const resultadosIniciales = unidadesPreparadas.map((unidadOrigen) =>
      this.planificadorUnidadOperativa.planificarConCobertura(
        unidadOrigen,
        periodoGeneracion,
        solicitud.eventos,
        comodinesOperativos,
      ),
    );
    const resultadosFlexibles = this.coordinarFlexiblesEntrePistaYCaja(
      resultadosIniciales,
      solicitud,
      periodoGeneracion,
      comodinesOperativos,
    );
    const resultadosUnidades = this.coordinarReservasEspeciales(
      resultadosFlexibles,
      periodoGeneracion,
      comodinesOperativos,
    );
    const cambios: string[] = [];
    const advertencias: string[] = [];
    const reemplazos: ReemplazoPlanificacion[] = [];

    for (const resultadoUnidad of resultadosUnidades) {
      const nombreUnidad = resultadoUnidad.unidadOperativa.nombre;
      const unidadOrigen = unidadesPreparadas.find((unidad) =>
        this.sonIguales(unidad.nombre, nombreUnidad),
      );
      const unidadCompleta =
        diasHeredados === 0 || unidadOrigen === undefined
          ? resultadoUnidad.unidadOperativa
          : this.combinarDiasHeredados(
              unidadOrigen,
              resultadoUnidad.unidadOperativa,
              solicitud,
              diasHeredados,
            );
      calendarioDestino.agregarUnidadOperativa(unidadCompleta);
      cambios.push(
        ...resultadoUnidad.cambios.map((cambio) =>
          this.desplazarDiasEnMensaje(cambio, diasHeredados),
        ),
      );
      reemplazos.push(
        ...resultadoUnidad.reemplazos.map((reemplazo) =>
          this.desplazarReemplazo(reemplazo, diasHeredados),
        ),
      );
    }

    for (const unidadCompleta of calendarioDestino.unidadesOperativas) {
      const nombreUnidad = unidadCompleta.nombre;
      const incidenciasCobertura = this.validadorCobertura.validar(
        unidadCompleta,
        (dia) => this.politicaCobertura.requerimiento(
          unidadCompleta.nombre,
          solicitud.periodoDestino.fechaDelDia(dia),
        ),
      );
      const unidadParaDescanso = this.integrarTrabajoFlexibleEntreRoles(
        unidadCompleta,
        calendarioDestino,
      );
      const incidenciasDescanso = this.validadorDescanso.validar(
        unidadParaDescanso,
        solicitud.periodoDestino.fechaInicio,
      );

      advertencias.push(
        ...incidenciasCobertura.map(
          (incidencia) =>
            `Cobertura insuficiente en ${nombreUnidad}: día ${incidencia.dia}, ${incidencia.turno} (${incidencia.disponibles}/${incidencia.requeridos}).`,
        ),
      );
      advertencias.push(
        ...incidenciasDescanso.map((incidencia) => {
          if (incidencia.tipo === 'DIA_LIBRE_SEMANAL') {
            return `Descanso semanal inválido para ${incidencia.empleado} en ${nombreUnidad}, semana ${incidencia.semana}: ${incidencia.diasLibres} días LIBRE.`;
          }

          return `Jornada excesiva para ${incidencia.empleado} en ${nombreUnidad}: ${incidencia.diasConsecutivos} días operativos consecutivos.`;
        }),
      );
    }

    advertencias.push(
      ...this.advertirAsignacionesSimultaneas(
        calendarioDestino,
        diasHeredados,
      ),
    );

    return ResultadoPlanificacion.exitoso(
      calendarioDestino,
      cambios,
      advertencias,
      reemplazos,
    );
  }

  private integrarTrabajoFlexibleEntreRoles(
    unidadOperativa: UnidadOperativa,
    calendario: Calendario,
  ): UnidadOperativa {
    const coordinacion = COORDINACIONES_FLEXIBLES.find((candidata) =>
      this.sonIguales(candidata.unidadPista, unidadOperativa.nombre),
    );

    if (coordinacion === undefined) {
      return unidadOperativa;
    }

    const unidadCaja = calendario.buscarUnidadOperativa(
      coordinacion.unidadCaja,
    );
    const flexibleCaja = unidadCaja
      ? this.buscarEmpleado(unidadCaja, coordinacion.empleado)
      : undefined;

    if (flexibleCaja === undefined) {
      return unidadOperativa;
    }

    return UnidadOperativa.create({
      nombre: unidadOperativa.nombre,
      empleados: unidadOperativa.empleados.map((empleado) => {
        if (!this.sonIguales(empleado.nombre, coordinacion.empleado)) {
          return empleado;
        }

        return Empleado.create({
          nombre: empleado.nombre,
          estadosPorDia: Array.from(
            { length: empleado.totalDias() },
            (_, indice) => {
              const estadoPista = empleado.estadoDelDia(indice + 1);
              const estadoCaja = flexibleCaja.estadoDelDia(indice + 1);
              const evento = [estadoPista, estadoCaja].find(
                (estado) =>
                  estado.valor === 'VACACIONES' ||
                  estado.valor === 'FERIADO',
              );

              if (evento !== undefined) {
                return evento;
              }

              return (
                [estadoPista, estadoCaja].find((estado) =>
                  estado.esAsignacionOperativa(),
                ) ?? EstadoTurno.create('LIBRE')
              );
            },
          ),
        });
      }),
    });
  }

  private advertirAsignacionesSimultaneas(
    calendario: Calendario,
    diasHeredados: number,
  ): string[] {
    const advertencias: string[] = [];

    for (const coordinacion of COORDINACIONES_FLEXIBLES) {
      const unidadPista = calendario.buscarUnidadOperativa(
        coordinacion.unidadPista,
      );
      const unidadCaja = calendario.buscarUnidadOperativa(
        coordinacion.unidadCaja,
      );
      const empleadoPista = unidadPista
        ? this.buscarEmpleado(unidadPista, coordinacion.empleado)
        : undefined;
      const empleadoCaja = unidadCaja
        ? this.buscarEmpleado(unidadCaja, coordinacion.empleado)
        : undefined;

      if (empleadoPista === undefined || empleadoCaja === undefined) {
        continue;
      }

      const totalDias = Math.min(
        empleadoPista.totalDias(),
        empleadoCaja.totalDias(),
      );

      for (let dia = 1; dia <= totalDias; dia += 1) {
        if (
          !empleadoPista.estadoDelDia(dia).esAsignacionOperativa() ||
          !empleadoCaja.estadoDelDia(dia).esAsignacionOperativa()
        ) {
          continue;
        }

        const origen =
          dia <= diasHeredados
            ? ' El día se conserva porque fue heredado del Excel confirmado.'
            : '';
        advertencias.push(
          `Asignación simultánea no permitida para ${coordinacion.empleado}: día ${dia} en ${coordinacion.unidadPista} y ${coordinacion.unidadCaja}.${origen}`,
        );
      }
    }

    return advertencias;
  }

  private calcularDiasHeredados(solicitud: SolicitudPlanificacion): number {
    const periodoOrigen = solicitud.calendarioOrigen.obtenerPeriodoOrigen();

    if (periodoOrigen === null) {
      return 0;
    }

    const periodoSiguiente =
      periodoOrigen.mes === 12
        ? { mes: 1, anio: periodoOrigen.anio + 1 }
        : { mes: periodoOrigen.mes + 1, anio: periodoOrigen.anio };
    const mesDestino = solicitud.periodoDestino.fechaInicio.getUTCMonth() + 1;
    const anioDestino =
      solicitud.periodoDestino.fechaInicio.getUTCFullYear();

    if (
      periodoSiguiente.mes !== mesDestino ||
      periodoSiguiente.anio !== anioDestino
    ) {
      return 0;
    }

    const inicioDestino = this.inicioUtc(
      solicitud.periodoDestino.fechaInicio,
    );
    const finDestino = this.inicioUtc(solicitud.periodoDestino.fechaFin);
    const ultimaFechaHeredada = new Date(
      Math.min(periodoOrigen.fechaFin.getTime(), finDestino.getTime()),
    );

    if (ultimaFechaHeredada.getTime() < inicioDestino.getTime()) {
      return 0;
    }

    return this.diferenciaDias(inicioDestino, ultimaFechaHeredada) + 1;
  }

  private crearPeriodoGeneracion(
    periodoDestino: PeriodoPlanificacion,
    diasHeredados: number,
  ): PeriodoPlanificacion {
    const fechaInicio = this.inicioUtc(periodoDestino.fechaInicio);
    fechaInicio.setUTCDate(fechaInicio.getUTCDate() + diasHeredados);

    return PeriodoPlanificacion.create({
      fechaInicio,
      fechaFin: periodoDestino.fechaFin,
    });
  }

  private combinarDiasHeredados(
    unidadOrigen: UnidadOperativa,
    unidadGenerada: UnidadOperativa,
    solicitud: SolicitudPlanificacion,
    diasHeredados: number,
  ): UnidadOperativa {
    const periodoOrigen = solicitud.calendarioOrigen.obtenerPeriodoOrigen();

    if (periodoOrigen === null) {
      return unidadGenerada;
    }

    const desplazamientoOrigen = this.diferenciaDias(
      periodoOrigen.fechaInicio,
      solicitud.periodoDestino.fechaInicio,
    );

    return UnidadOperativa.create({
      nombre: unidadGenerada.nombre,
      empleados: unidadGenerada.empleados.map((empleadoGenerado) => {
        const empleadoOrigen = this.buscarEmpleado(
          unidadOrigen,
          empleadoGenerado.nombre,
        );

        if (empleadoOrigen === undefined) {
          throw new Error(
            `No se encontraron los días heredados de ${empleadoGenerado.nombre} en ${unidadOrigen.nombre}.`,
          );
        }

        const estadosHeredados = Array.from(
          { length: diasHeredados },
          (_, indice) =>
            empleadoOrigen.estadoDelDia(
              desplazamientoOrigen + indice + 1,
            ),
        );
        const estadosGenerados = Array.from(
          { length: empleadoGenerado.totalDias() },
          (_, indice) => empleadoGenerado.estadoDelDia(indice + 1),
        );

        return Empleado.create({
          nombre: empleadoGenerado.nombre,
          estadosPorDia: [...estadosHeredados, ...estadosGenerados],
        });
      }),
    });
  }

  private desplazarReemplazo(
    reemplazo: ReemplazoPlanificacion,
    diasHeredados: number,
  ): ReemplazoPlanificacion {
    if (diasHeredados === 0) {
      return reemplazo;
    }

    return ReemplazoPlanificacion.create({
      unidadOperativa: reemplazo.unidadOperativa,
      dia: reemplazo.dia + diasHeredados,
      turno: reemplazo.turno,
      empleadoTitular: reemplazo.empleadoTitular,
      empleadoReemplazo: reemplazo.empleadoReemplazo,
      tipoCobertura: reemplazo.tipoCobertura,
      motivo: reemplazo.motivo,
    });
  }

  private desplazarDiasEnMensaje(
    mensaje: string,
    diasHeredados: number,
  ): string {
    if (diasHeredados === 0) {
      return mensaje;
    }

    return mensaje.replace(
      /(\bdía\s+)(\d+)/giu,
      (_coincidencia, prefijo: string, dia: string) =>
        `${prefijo}${Number(dia) + diasHeredados}`,
    );
  }

  private diferenciaDias(fechaInicio: Date, fechaFin: Date): number {
    return Math.round(
      (this.inicioUtc(fechaFin).getTime() -
        this.inicioUtc(fechaInicio).getTime()) /
        (24 * 60 * 60 * 1000),
    );
  }

  private inicioUtc(fecha: Date): Date {
    return new Date(
      Date.UTC(
        fecha.getUTCFullYear(),
        fecha.getUTCMonth(),
        fecha.getUTCDate(),
      ),
    );
  }

  private prepararReservasEspeciales(
    unidadOrigen: UnidadOperativa,
    unidadesOrigen: ReadonlyArray<UnidadOperativa>,
  ): UnidadOperativa {
    let preparada = this.agregarReservaFlexibleDeCaja(
      unidadOrigen,
      unidadesOrigen,
    );
    const esCaja = this.politicaCobertura.esUnidadCaja(preparada.nombre);
    const reservas = esCaja ? ['Celio'] : ['Celio', 'Lester'];

    for (const nombreReserva of reservas) {
      if (this.buscarEmpleado(preparada, nombreReserva)) {
        continue;
      }

      const empleadoOrigen = unidadesOrigen
        .map((unidad) => this.buscarEmpleado(unidad, nombreReserva))
        .find((empleado) => empleado !== undefined);

      if (!empleadoOrigen) {
        continue;
      }

      preparada = UnidadOperativa.create({
        nombre: preparada.nombre,
        empleados: [...preparada.empleados, empleadoOrigen],
      });
    }

    return preparada;
  }

  private coordinarReservasEspeciales(
    resultadosIniciales: ReadonlyArray<ResultadoPlanificadorUnidadOperativa>,
    periodoGeneracion: PeriodoPlanificacion,
    comodines: ComodinesPlanificacion,
  ): ResultadoPlanificadorUnidadOperativa[] {
    const resultados = [...resultadosIniciales];

    for (let pasada = 0; pasada < 2; pasada += 1) {
      for (const nombreReserva of ['Celio', 'Lester'] as const) {
        const totalDias = resultados
          .map((resultado) =>
            this.buscarEmpleado(resultado.unidadOperativa, nombreReserva)
              ?.totalDias() ?? 0,
          )
          .reduce((maximo, actual) => Math.max(maximo, actual), 0);

        for (let dia = 1; dia <= totalDias; dia += 1) {
          const usos = resultados.flatMap((resultado, indiceResultado) =>
            resultado.reemplazos
              .filter(
                (reemplazo) =>
                  reemplazo.dia === dia &&
                  this.sonIguales(reemplazo.empleadoReemplazo, nombreReserva),
              )
              .map((reemplazo) => ({ indiceResultado, reemplazo })),
          );

          if (usos.length <= 1) {
            continue;
          }

          const ordenados = [...usos].sort(
            (primero, segundo) =>
              this.prioridadUsoReserva(nombreReserva, primero.reemplazo) -
              this.prioridadUsoReserva(nombreReserva, segundo.reemplazo),
          );
          const conservar = ordenados[0];

          for (const uso of ordenados.slice(1)) {
            if (
              conservar &&
              uso.indiceResultado === conservar.indiceResultado &&
              uso.reemplazo === conservar.reemplazo
            ) {
              continue;
            }

            const resultadoActual = resultados[uso.indiceResultado];

            if (!resultadoActual) {
              continue;
            }

            const unidadSinReserva = this.reemplazarEstado(
              resultadoActual.unidadOperativa,
              nombreReserva,
              dia,
              EstadoTurno.create('OTRO'),
            );
            const vacante: VacantePlanificacion = {
              unidadOperativa: uso.reemplazo.unidadOperativa,
              dia,
              turno: uso.reemplazo.turno,
              empleadoTitular: uso.reemplazo.empleadoTitular,
              motivo: uso.reemplazo.motivo,
            };
            const reparacion = this.planificadorUnidadOperativa.repararCobertura(
              unidadSinReserva,
              comodines,
              new Map([[dia, new Set([nombreReserva])]]),
              [...resultadoActual.vacantesPendientes, vacante],
              periodoGeneracion,
            );

            resultados[uso.indiceResultado] = {
              ...reparacion,
              cambios: [
                ...resultadoActual.cambios.filter(
                  (cambio) =>
                    !(
                      cambio.includes(nombreReserva) &&
                      cambio.includes(`día ${dia}`)
                    ),
                ),
                `Cobertura duplicada de ${nombreReserva} cancelada el día ${dia} en ${resultadoActual.unidadOperativa.nombre}.`,
                ...reparacion.cambios,
              ],
              reemplazos: [
                ...resultadoActual.reemplazos.filter(
                  (reemplazo) => reemplazo !== uso.reemplazo,
                ),
                ...reparacion.reemplazos,
              ],
            };
          }
        }
      }
    }

    return resultados;
  }

  private prioridadUsoReserva(
    nombreReserva: string,
    reemplazo: ReemplazoPlanificacion,
  ): number {
    const esCaja = this.politicaCobertura.esUnidadCaja(
      reemplazo.unidadOperativa,
    );

    if (nombreReserva.toUpperCase() === 'CELIO') {
      if (esCaja && reemplazo.motivo === 'DESCANSO') {
        return 0;
      }

      if (!esCaja && reemplazo.motivo === 'VACACIONES') {
        return 1;
      }

      return esCaja ? 4 : 2;
    }

    return !esCaja && reemplazo.motivo === 'VACACIONES' ? 0 : 10;
  }

  private agregarReservaFlexibleDeCaja(
    unidadOrigen: UnidadOperativa,
    unidadesOrigen: ReadonlyArray<UnidadOperativa>,
  ): UnidadOperativa {
    const coordinacion = COORDINACIONES_FLEXIBLES.find((candidata) =>
      this.sonIguales(candidata.unidadCaja, unidadOrigen.nombre),
    );

    if (
      !coordinacion ||
      this.buscarEmpleado(unidadOrigen, coordinacion.empleado)
    ) {
      return unidadOrigen;
    }

    const unidadPista = unidadesOrigen.find((unidad) =>
      this.sonIguales(unidad.nombre, coordinacion.unidadPista),
    );
    const empleadoPista = unidadPista
      ? this.buscarEmpleado(unidadPista, coordinacion.empleado)
      : undefined;

    if (!empleadoPista) {
      return unidadOrigen;
    }

    return UnidadOperativa.create({
      nombre: unidadOrigen.nombre,
      empleados: [...unidadOrigen.empleados, empleadoPista],
    });
  }

  private coordinarFlexiblesEntrePistaYCaja(
    resultadosIniciales: ReadonlyArray<ResultadoPlanificadorUnidadOperativa>,
    solicitud: SolicitudPlanificacion,
    periodoGeneracion: PeriodoPlanificacion,
    comodines: ComodinesPlanificacion,
  ): ResultadoPlanificadorUnidadOperativa[] {
    const resultados = [...resultadosIniciales];

    for (const coordinacion of COORDINACIONES_FLEXIBLES) {
      const indicePista = resultados.findIndex((resultado) =>
        this.sonIguales(
          resultado.unidadOperativa.nombre,
          coordinacion.unidadPista,
        ),
      );
      const indiceCaja = resultados.findIndex((resultado) =>
        this.sonIguales(
          resultado.unidadOperativa.nombre,
          coordinacion.unidadCaja,
        ),
      );

      if (indicePista < 0 || indiceCaja < 0) {
        continue;
      }

      const resultadoPista = resultados[indicePista];
      const resultadoCaja = resultados[indiceCaja];

      if (!resultadoPista || !resultadoCaja) {
        continue;
      }

      const coordinadas = this.coordinarFlexible(
        resultadoPista,
        resultadoCaja,
        coordinacion,
        solicitud,
        periodoGeneracion,
        comodines,
      );

      resultados[indicePista] = coordinadas.pista;
      resultados[indiceCaja] = coordinadas.caja;
    }

    return resultados;
  }

  private coordinarFlexible(
    resultadoPista: ResultadoPlanificadorUnidadOperativa,
    resultadoCaja: ResultadoPlanificadorUnidadOperativa,
    coordinacion: CoordinacionFlexible,
    solicitud: SolicitudPlanificacion,
    periodoGeneracion: PeriodoPlanificacion,
    comodines: ComodinesPlanificacion,
  ): {
    pista: ResultadoPlanificadorUnidadOperativa;
    caja: ResultadoPlanificadorUnidadOperativa;
  } {
    let unidadPista = resultadoPista.unidadOperativa;
    let unidadCaja = resultadoCaja.unidadOperativa;
    const empleadoPista = this.buscarEmpleado(unidadPista, coordinacion.empleado);
    const empleadoCaja = this.buscarEmpleado(unidadCaja, coordinacion.empleado);

    if (!empleadoPista || !empleadoCaja) {
      return { pista: resultadoPista, caja: resultadoCaja };
    }

    const exclusionesCaja = new Map<number, ReadonlySet<string>>();
    const cambiosInicialesCajaCancelados = new Set<string>();
    const reemplazosPistaCancelados = new Set<ReemplazoPlanificacion>();
    const reemplazosCajaCancelados = new Set<ReemplazoPlanificacion>();
    const cambiosCoordinacion: string[] = [];
    const vacantesPista: VacantePlanificacion[] = [
      ...resultadoPista.vacantesPendientes,
    ];
    const vacantesCaja: VacantePlanificacion[] = [
      ...resultadoCaja.vacantesPendientes,
    ];
    const totalDias = Math.min(
      empleadoPista.totalDias(),
      empleadoCaja.totalDias(),
    );

    for (let dia = 1; dia <= totalDias; dia += 1) {
      const estadoCaja = this.buscarEmpleado(
        unidadCaja,
        coordinacion.empleado,
      )?.estadoDelDia(dia);

      if (!estadoCaja?.esAsignacionOperativa()) {
        continue;
      }

      const estadoPista = this.buscarEmpleado(
        unidadPista,
        coordinacion.empleado,
      )?.estadoDelDia(dia);

      if (
        estadoPista?.esAsignacionOperativa() &&
        (this.puedeCederFlexible(
          unidadPista,
          dia,
          estadoPista.valor,
          periodoGeneracion,
        ) ||
          comodines.empleadosDeUnidad(coordinacion.unidadPista).length > 0)
      ) {
        const reemplazoPistaCancelado = resultadoPista.reemplazos.find(
          (reemplazo) =>
            reemplazo.dia === dia &&
            this.sonIguales(
              reemplazo.empleadoReemplazo,
              coordinacion.empleado,
            ) &&
            reemplazo.turno === estadoPista.valor,
        );

        if (reemplazoPistaCancelado) {
          reemplazosPistaCancelados.add(reemplazoPistaCancelado);
          vacantesPista.push({
            unidadOperativa: coordinacion.unidadPista,
            dia,
            turno: reemplazoPistaCancelado.turno,
            empleadoTitular: reemplazoPistaCancelado.empleadoTitular,
            motivo: reemplazoPistaCancelado.motivo,
          });
        } else {
          vacantesPista.push({
            unidadOperativa: coordinacion.unidadPista,
            dia,
            turno: estadoPista.valor as 'TURNO A' | 'TURNO B',
            empleadoTitular: coordinacion.empleado,
            motivo: 'TRANSFERENCIA_FLEXIBLE',
          });
        }
        unidadPista = this.reemplazarEstado(
          unidadPista,
          coordinacion.empleado,
          dia,
          EstadoTurno.create('OTRO'),
        );
        cambiosCoordinacion.push(
          `Flexible ${coordinacion.empleado} transferido de ${coordinacion.unidadPista} a ${coordinacion.unidadCaja} el día ${dia}.`,
        );
        continue;
      }

      unidadCaja = this.reemplazarEstado(
        unidadCaja,
        coordinacion.empleado,
        dia,
        EstadoTurno.create('OTRO'),
      );
      exclusionesCaja.set(dia, new Set([coordinacion.empleado]));
      const reemplazoCancelado = resultadoCaja.reemplazos.find(
        (reemplazo) =>
          reemplazo.dia === dia &&
          this.sonIguales(
            reemplazo.empleadoReemplazo,
            coordinacion.empleado,
          ) &&
          reemplazo.turno === estadoCaja.valor,
      );

      if (reemplazoCancelado) {
        reemplazosCajaCancelados.add(reemplazoCancelado);
        vacantesCaja.push({
          unidadOperativa: coordinacion.unidadCaja,
          dia,
          turno: reemplazoCancelado.turno,
          empleadoTitular: reemplazoCancelado.empleadoTitular,
          motivo: reemplazoCancelado.motivo,
        });
      } else {
        vacantesCaja.push({
          unidadOperativa: coordinacion.unidadCaja,
          dia,
          turno: estadoCaja.valor as 'TURNO A' | 'TURNO B',
          empleadoTitular: null,
          motivo: 'FALTANTE',
        });
      }
      cambiosInicialesCajaCancelados.add(
        `Flexible ${empleadoCaja.nombre} reasignado a ${estadoCaja.valor} el día ${dia} en ${unidadCaja.nombre}.`,
      );
      cambiosCoordinacion.push(
        estadoPista?.esAsignacionOperativa()
          ? `Cobertura de ${coordinacion.empleado} cancelada en ${coordinacion.unidadCaja} el día ${dia} porque ${coordinacion.unidadPista} no puede cederlo sin bajar de 3 bomberos por turno.`
          : `Cobertura de ${coordinacion.empleado} cancelada en ${coordinacion.unidadCaja} el día ${dia} para respetar su descanso o evento en ${coordinacion.unidadPista}.`,
      );
    }

    if (cambiosCoordinacion.length === 0) {
      return { pista: resultadoPista, caja: resultadoCaja };
    }

    const reparacionPista = this.planificadorUnidadOperativa.repararCobertura(
      unidadPista,
      comodines,
      new Map(),
      vacantesPista,
      periodoGeneracion,
    );
    const reparacionCaja = this.planificadorUnidadOperativa.repararCobertura(
      unidadCaja,
      comodines,
      exclusionesCaja,
      vacantesCaja,
      periodoGeneracion,
    );

    return {
      pista: {
        ...reparacionPista,
        cambios: [...resultadoPista.cambios, ...reparacionPista.cambios],
        reemplazos: [
          ...resultadoPista.reemplazos.filter(
            (reemplazo) => !reemplazosPistaCancelados.has(reemplazo),
          ),
          ...reparacionPista.reemplazos,
        ],
      },
      caja: {
        ...reparacionCaja,
        cambios: [
          ...resultadoCaja.cambios.filter(
            (cambio) => !cambiosInicialesCajaCancelados.has(cambio),
          ),
          ...cambiosCoordinacion,
          ...reparacionCaja.cambios,
        ],
        reemplazos: [
          ...resultadoCaja.reemplazos.filter(
            (reemplazo) => !reemplazosCajaCancelados.has(reemplazo),
          ),
          ...reparacionCaja.reemplazos,
        ],
      },
    };
  }

  private puedeCederFlexible(
    unidadPista: UnidadOperativa,
    dia: number,
    turno: string,
    periodoGeneracion: PeriodoPlanificacion,
  ): boolean {
    const disponiblesEnTurno = unidadPista.empleados.filter(
      (empleado) => empleado.estadoDelDia(dia).valor === turno,
    ).length;
    const requerimiento = this.politicaCobertura.requerimiento(
      unidadPista.nombre,
      periodoGeneracion.fechaDelDia(dia),
    );
    const minimo = turno === 'TURNO A'
      ? requerimiento.turnoA
      : requerimiento.turnoB;

    return disponiblesEnTurno - 1 >= minimo;
  }

  private reemplazarEstado(
    unidad: UnidadOperativa,
    nombreEmpleado: string,
    dia: number,
    estadoNuevo: EstadoTurno,
  ): UnidadOperativa {
    return UnidadOperativa.create({
      nombre: unidad.nombre,
      empleados: unidad.empleados.map((empleado) => {
        if (!this.sonIguales(empleado.nombre, nombreEmpleado)) {
          return empleado;
        }

        return Empleado.create({
          nombre: empleado.nombre,
          estadosPorDia: Array.from(
            { length: empleado.totalDias() },
            (_, indice) =>
              indice + 1 === dia
                ? estadoNuevo
                : empleado.estadoDelDia(indice + 1),
          ),
        });
      }),
    });
  }

  private buscarEmpleado(
    unidad: UnidadOperativa,
    nombreEmpleado: string,
  ): Empleado | undefined {
    return unidad.empleados.find((empleado) =>
      this.sonIguales(empleado.nombre, nombreEmpleado),
    );
  }

  private sonIguales(primero: string, segundo: string): boolean {
    return primero.trim().toUpperCase() === segundo.trim().toUpperCase();
  }
}