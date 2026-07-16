import { randomUUID } from 'node:crypto';

import { ValidadorDescanso } from './ValidadorDescanso.js';
import { ValidadorTransicionTurno } from './ValidadorTransicionTurno.js';

import { Calendario } from '../../domain/Calendario.js';
import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import {
  AjusteManualPlanificacion,
  EstadoIntercambiablePlanificacion,
  MovimientoAjusteManualPlanificacion,
  TurnoOperativoPlanificacion,
} from '../../domain/planning/AjusteManualPlanificacion.js';

const UNIDAD_PERMITIDA_POR_CAJERO_FIJO = new Map<string, string>([
  ['NATANAEL', 'CACAO CAJA'],
  ['RONY', 'CACAO CAJA'],
  ['NORLAN', 'TRUCK STOP CAJA'],
  ['DERLIN', 'TRUCK STOP CAJA'],
]);

export interface SolicitudAplicarAjusteManualPlanificacion {
  readonly calendario: Calendario;
  readonly historial: ReadonlyArray<AjusteManualPlanificacion>;
  readonly unidadOperativa: string;
  readonly dia: number;
  readonly titular: string;
  readonly reemplazo: string;
}

export interface SolicitudDeshacerAjusteManualPlanificacion {
  readonly calendario: Calendario;
  readonly historial: ReadonlyArray<AjusteManualPlanificacion>;
}

export interface ResultadoAjusteManualPlanificacion {
  readonly esExitoso: boolean;
  readonly calendario: Calendario;
  readonly historial: ReadonlyArray<AjusteManualPlanificacion>;
  readonly ajuste: AjusteManualPlanificacion | null;
  readonly conflictos: ReadonlyArray<string>;
}

/**
 * Aplica y deshace ediciones manuales sin conservar estado dentro del caso de
 * uso. El calendario y el historial recibidos nunca se modifican en sitio.
 */
export class AjustarAsignacionManualUseCase {
  public constructor(
    private readonly validadorDescanso = new ValidadorDescanso(),
    private readonly validadorTransicionTurno = new ValidadorTransicionTurno(),
  ) {}

  public aplicar(
    solicitud: SolicitudAplicarAjusteManualPlanificacion,
  ): ResultadoAjusteManualPlanificacion {
    const unidadSolicitada = solicitud.unidadOperativa.trim();
    const titularSolicitado = solicitud.titular.trim();
    const reemplazoSolicitado = solicitud.reemplazo.trim();

    if (unidadSolicitada.length === 0) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        'La unidad operativa del ajuste no puede estar vacia.',
      );
    }

    if (titularSolicitado.length === 0 || reemplazoSolicitado.length === 0) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        'El ajuste requiere titular y reemplazo.',
      );
    }

    if (this.sonIguales(titularSolicitado, reemplazoSolicitado)) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        'El titular y el reemplazo deben ser empleados diferentes.',
      );
    }

    if (!Number.isInteger(solicitud.dia) || solicitud.dia <= 0) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        'El dia del ajuste debe ser un entero mayor que cero.',
      );
    }

    const unidad = solicitud.calendario.buscarUnidadOperativa(unidadSolicitada);

    if (unidad === undefined) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `La unidad operativa "${unidadSolicitada}" no existe en el calendario.`,
      );
    }

    const titular = this.buscarEmpleado(unidad, titularSolicitado);
    const reemplazo = this.buscarEmpleado(unidad, reemplazoSolicitado);

    if (titular === undefined) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `El titular ${titularSolicitado} no pertenece a ${unidad.nombre}.`,
      );
    }

    if (reemplazo === undefined) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `El reemplazo ${reemplazoSolicitado} no pertenece a ${unidad.nombre}.`,
      );
    }

    const conflictosCajerosFijos = this.validarCajerosFijos(unidad.nombre, [
      titular.nombre,
      reemplazo.nombre,
    ]);

    if (conflictosCajerosFijos.length > 0) {
      return this.conflictos(solicitud.calendario, solicitud.historial, conflictosCajerosFijos);
    }

    if (solicitud.dia > titular.totalDias() || solicitud.dia > reemplazo.totalDias()) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `El dia ${solicitud.dia} no existe para ambos empleados en ${unidad.nombre}.`,
      );
    }

    const estadoTitular = titular.estadoDelDia(solicitud.dia).valor;
    const estadoReemplazo = reemplazo.estadoDelDia(solicitud.dia).valor;

    if (!this.esTurnoOperativo(estadoTitular)) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `${titular.nombre} no tiene una asignacion operativa el dia ${solicitud.dia}.`,
      );
    }

    if (!this.esEstadoIntercambiable(estadoReemplazo)) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `${reemplazo.nombre} no esta disponible el dia ${solicitud.dia}: su estado es ${estadoReemplazo}.`,
      );
    }

    if (estadoTitular === estadoReemplazo) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `El intercambio no produciria ningun cambio: ambos empleados tienen ${estadoTitular}.`,
      );
    }

    const conflictosDisponibilidad = this.validarDisponibilidadDelReemplazoEnOtrasUnidades(
      solicitud.calendario,
      unidad,
      reemplazo.nombre,
      solicitud.dia,
    );

    if (conflictosDisponibilidad.length > 0) {
      return this.conflictos(solicitud.calendario, solicitud.historial, conflictosDisponibilidad);
    }

    const unidadAjustada = this.reemplazarEstados(
      unidad,
      titular.nombre,
      estadoReemplazo,
      reemplazo.nombre,
      estadoTitular,
      solicitud.dia,
    );
    const calendarioAjustado = this.reemplazarUnidad(solicitud.calendario, unidadAjustada);
    const conflictosSeguridad = [
      ...this.validarDobleAsignacion(
        calendarioAjustado,
        [titular.nombre, reemplazo.nombre],
        solicitud.dia,
      ),
      ...this.validarDescanso(calendarioAjustado, [titular.nombre, reemplazo.nombre]),
      ...this.validarTransiciones(
        calendarioAjustado,
        [titular.nombre, reemplazo.nombre],
        solicitud.dia,
      ),
    ];

    if (conflictosSeguridad.length > 0) {
      return this.conflictos(solicitud.calendario, solicitud.historial, conflictosSeguridad);
    }

    const movimientos = this.construirMovimientos(
      solicitud.historial,
      unidad.nombre,
      solicitud.dia,
      titular,
      estadoTitular,
      reemplazo,
      estadoReemplazo,
    );
    const ajuste = AjusteManualPlanificacion.create({
      id: randomUUID(),
      unidadOperativa: unidad.nombre,
      dia: solicitud.dia,
      titular: titular.nombre,
      reemplazo: reemplazo.nombre,
      estadoTitularAnterior: estadoTitular,
      estadoReemplazoAnterior: estadoReemplazo,
      movimientos,
    });

    return {
      esExitoso: true,
      calendario: calendarioAjustado,
      historial: [...solicitud.historial, ajuste],
      ajuste,
      conflictos: [],
    };
  }

  public deshacerUltimo(
    solicitud: SolicitudDeshacerAjusteManualPlanificacion,
  ): ResultadoAjusteManualPlanificacion {
    const indiceAjuste = this.buscarIndiceUltimoAplicado(solicitud.historial);

    if (indiceAjuste < 0) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        'No hay ajustes manuales aplicados para deshacer.',
      );
    }

    const ajuste = solicitud.historial[indiceAjuste]!;
    const unidad = solicitud.calendario.buscarUnidadOperativa(ajuste.unidadOperativa);

    if (unidad === undefined) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `No se puede deshacer ${ajuste.id}: la unidad ${ajuste.unidadOperativa} ya no existe.`,
      );
    }

    const titular = this.buscarEmpleado(unidad, ajuste.titular);
    const reemplazo = this.buscarEmpleado(unidad, ajuste.reemplazo);

    if (
      titular === undefined ||
      reemplazo === undefined ||
      ajuste.dia > titular.totalDias() ||
      ajuste.dia > reemplazo.totalDias()
    ) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `No se puede deshacer ${ajuste.id}: sus empleados o su dia ya no existen.`,
      );
    }

    const estadoActualTitular = titular.estadoDelDia(ajuste.dia).valor;
    const estadoActualReemplazo = reemplazo.estadoDelDia(ajuste.dia).valor;

    if (
      estadoActualTitular !== ajuste.estadoTitularPosterior ||
      estadoActualReemplazo !== ajuste.estadoReemplazoPosterior
    ) {
      return this.conflicto(
        solicitud.calendario,
        solicitud.historial,
        `No se puede deshacer ${ajuste.id}: la asignacion fue modificada despues del ajuste.`,
      );
    }

    const unidadRestaurada = this.reemplazarEstados(
      unidad,
      titular.nombre,
      ajuste.estadoTitularAnterior,
      reemplazo.nombre,
      ajuste.estadoReemplazoAnterior,
      ajuste.dia,
    );
    const calendarioRestaurado = this.reemplazarUnidad(solicitud.calendario, unidadRestaurada);
    const ajusteDeshecho = ajuste.marcarDeshecho();
    const historial = solicitud.historial.map((registro, indice) =>
      indice === indiceAjuste ? ajusteDeshecho : registro,
    );

    return {
      esExitoso: true,
      calendario: calendarioRestaurado,
      historial,
      ajuste: ajusteDeshecho,
      conflictos: [],
    };
  }

  private construirMovimientos(
    historial: ReadonlyArray<AjusteManualPlanificacion>,
    unidadOperativa: string,
    dia: number,
    titular: Empleado,
    estadoTitular: TurnoOperativoPlanificacion,
    reemplazo: Empleado,
    estadoReemplazo: EstadoIntercambiablePlanificacion,
  ): MovimientoAjusteManualPlanificacion[] {
    const movimientos: MovimientoAjusteManualPlanificacion[] = [
      {
        turno: estadoTitular,
        titularOriginal: this.buscarTitularOriginal(
          historial,
          unidadOperativa,
          dia,
          estadoTitular,
          titular.nombre,
        ),
        titular: titular.nombre,
        reemplazo: reemplazo.nombre,
      },
    ];

    if (this.esTurnoOperativo(estadoReemplazo)) {
      movimientos.push({
        turno: estadoReemplazo,
        titularOriginal: this.buscarTitularOriginal(
          historial,
          unidadOperativa,
          dia,
          estadoReemplazo,
          reemplazo.nombre,
        ),
        titular: reemplazo.nombre,
        reemplazo: titular.nombre,
      });
    }

    return movimientos;
  }

  private buscarTitularOriginal(
    historial: ReadonlyArray<AjusteManualPlanificacion>,
    unidadOperativa: string,
    dia: number,
    turno: TurnoOperativoPlanificacion,
    titularActual: string,
  ): string {
    for (let indice = historial.length - 1; indice >= 0; indice -= 1) {
      const ajuste = historial[indice];

      if (
        ajuste === undefined ||
        !ajuste.estaAplicado() ||
        !this.sonIguales(ajuste.unidadOperativa, unidadOperativa) ||
        ajuste.dia !== dia
      ) {
        continue;
      }

      const movimiento = ajuste.movimientos.find(
        (candidato) =>
          candidato.turno === turno && this.sonIguales(candidato.reemplazo, titularActual),
      );

      if (movimiento !== undefined) {
        return movimiento.titularOriginal;
      }
    }

    return titularActual;
  }

  private validarDisponibilidadDelReemplazoEnOtrasUnidades(
    calendario: Calendario,
    unidadObjetivo: UnidadOperativa,
    nombreReemplazo: string,
    dia: number,
  ): string[] {
    const conflictos: string[] = [];

    for (const unidad of calendario.unidadesOperativas) {
      if (unidad === unidadObjetivo) {
        continue;
      }

      const coincidencia = this.buscarEmpleado(unidad, nombreReemplazo);

      if (coincidencia === undefined) {
        continue;
      }

      if (dia > coincidencia.totalDias()) {
        conflictos.push(
          `${coincidencia.nombre} no tiene informacion para el dia ${dia} en ${unidad.nombre}.`,
        );
        continue;
      }

      const estado = coincidencia.estadoDelDia(dia).valor;

      if (estado !== 'LIBRE') {
        conflictos.push(
          `${coincidencia.nombre} no puede cubrir ${unidadObjetivo.nombre} el dia ${dia}: tiene ${estado} en ${unidad.nombre}.`,
        );
      }
    }

    return conflictos;
  }

  private validarCajerosFijos(unidadOperativa: string, empleados: ReadonlyArray<string>): string[] {
    const unidadNormalizada = this.normalizarUnidad(unidadOperativa);

    return empleados.flatMap((empleado) => {
      const unidadPermitida = UNIDAD_PERMITIDA_POR_CAJERO_FIJO.get(this.normalizarNombre(empleado));

      if (unidadPermitida === undefined || unidadNormalizada === unidadPermitida) {
        return [];
      }

      return [
        `${empleado} es cajero fijo de ${unidadPermitida} y no puede participar en un ajuste de ${unidadOperativa}.`,
      ];
    });
  }

  private validarDobleAsignacion(
    calendario: Calendario,
    empleados: ReadonlyArray<string>,
    dia: number,
  ): string[] {
    const conflictos: string[] = [];

    for (const nombreEmpleado of empleados) {
      const asignaciones: string[] = [];

      for (const unidad of calendario.unidadesOperativas) {
        const empleado = this.buscarEmpleado(unidad, nombreEmpleado);

        if (empleado === undefined || dia > empleado.totalDias()) {
          continue;
        }

        if (empleado.estadoDelDia(dia).esAsignacionOperativa()) {
          asignaciones.push(unidad.nombre);
        }
      }

      if (asignaciones.length > 1) {
        conflictos.push(
          `${nombreEmpleado} quedaria asignado mas de una vez el dia ${dia}: ${asignaciones.join(', ')}.`,
        );
      }
    }

    return conflictos;
  }

  private validarDescanso(calendario: Calendario, empleados: ReadonlyArray<string>): string[] {
    const empleadosGlobales = empleados.flatMap((nombreEmpleado) => {
      const empleado = this.construirEmpleadoGlobal(calendario, nombreEmpleado);

      return empleado === null ? [] : [empleado];
    });

    if (empleadosGlobales.length === 0) {
      return [];
    }

    const unidadGlobal = UnidadOperativa.create({
      nombre: 'VALIDACION GLOBAL AJUSTE MANUAL',
      empleados: empleadosGlobales,
    });
    const incidencias = this.validadorDescanso.validar(unidadGlobal);

    return incidencias.map((incidencia) => {
      if (incidencia.tipo === 'DIA_LIBRE_SEMANAL') {
        return `${incidencia.empleado} perderia su dia LIBRE en la semana ${incidencia.semana}.`;
      }

      return `${incidencia.empleado} superaria seis dias operativos consecutivos.`;
    });
  }

  private validarTransiciones(
    calendario: Calendario,
    empleados: ReadonlyArray<string>,
    dia: number,
  ): string[] {
    return empleados.flatMap((nombreEmpleado) => {
      const conflictos: string[] = [];

      for (const diaTurnoB of [dia - 1, dia]) {
        const diaTurnoA = diaTurnoB + 1;

        if (diaTurnoB < 1) {
          continue;
        }

        const estadosAnteriores = this.estadosOperativosGlobales(
          calendario,
          nombreEmpleado,
          diaTurnoB,
        );
        const estadosSiguientes = this.estadosOperativosGlobales(
          calendario,
          nombreEmpleado,
          diaTurnoA,
        );
        const esInsegura = estadosAnteriores.some((estadoAnterior) =>
          estadosSiguientes.some((estadoSiguiente) =>
            this.validadorTransicionTurno.esInsegura(estadoAnterior, estadoSiguiente),
          ),
        );

        if (esInsegura) {
          conflictos.push(
            `${nombreEmpleado} tendria una transicion insegura de TURNO B el dia ${diaTurnoB} a TURNO A el dia ${diaTurnoA}.`,
          );
        }
      }

      return conflictos;
    });
  }

  private construirEmpleadoGlobal(calendario: Calendario, nombreEmpleado: string): Empleado | null {
    const coincidencias = calendario.unidadesOperativas.flatMap((unidad) => {
      const empleado = this.buscarEmpleado(unidad, nombreEmpleado);

      return empleado === undefined ? [] : [empleado];
    });
    const totalDias = Math.max(0, ...coincidencias.map((empleado) => empleado.totalDias()));

    if (coincidencias.length === 0 || totalDias === 0) {
      return null;
    }

    return Empleado.create({
      nombre: coincidencias[0]!.nombre,
      estadosPorDia: Array.from({ length: totalDias }, (_, indice) => {
        const dia = indice + 1;
        const estados = coincidencias
          .filter((empleado) => dia <= empleado.totalDias())
          .map((empleado) => empleado.estadoDelDia(dia));
        const operativo = estados.find((estado) => estado.esAsignacionOperativa());
        const ausencia = estados.find((estado) => estado.valor !== 'LIBRE');

        return operativo ?? ausencia ?? EstadoTurno.create('LIBRE');
      }),
    });
  }

  private estadosOperativosGlobales(
    calendario: Calendario,
    nombreEmpleado: string,
    dia: number,
  ): string[] {
    return calendario.unidadesOperativas.flatMap((unidad) => {
      const empleado = this.buscarEmpleado(unidad, nombreEmpleado);

      if (empleado === undefined || dia < 1 || dia > empleado.totalDias()) {
        return [];
      }

      const estado = empleado.estadoDelDia(dia);

      return estado.esAsignacionOperativa() ? [estado.valor] : [];
    });
  }

  private reemplazarEstados(
    unidad: UnidadOperativa,
    primerEmpleado: string,
    primerEstado: EstadoIntercambiablePlanificacion,
    segundoEmpleado: string,
    segundoEstado: EstadoIntercambiablePlanificacion,
    dia: number,
  ): UnidadOperativa {
    return UnidadOperativa.create({
      nombre: unidad.nombre,
      empleados: unidad.empleados.map((empleado) => {
        let estadoNuevo: EstadoIntercambiablePlanificacion | null = null;

        if (this.sonIguales(empleado.nombre, primerEmpleado)) {
          estadoNuevo = primerEstado;
        } else if (this.sonIguales(empleado.nombre, segundoEmpleado)) {
          estadoNuevo = segundoEstado;
        }

        if (estadoNuevo === null) {
          return empleado;
        }

        return Empleado.create({
          nombre: empleado.nombre,
          estadosPorDia: Array.from({ length: empleado.totalDias() }, (_, indice) =>
            indice + 1 === dia
              ? EstadoTurno.create(estadoNuevo)
              : empleado.estadoDelDia(indice + 1),
          ),
        });
      }),
    });
  }

  private reemplazarUnidad(calendario: Calendario, unidadNueva: UnidadOperativa): Calendario {
    const resultado = new Calendario(
      calendario.nombre,
      calendario.obtenerPeriodoOrigen(),
    );

    for (const unidad of calendario.unidadesOperativas) {
      resultado.agregarUnidadOperativa(
        this.sonIguales(unidad.nombre, unidadNueva.nombre) ? unidadNueva : unidad,
      );
    }

    return resultado;
  }

  private buscarEmpleado(unidad: UnidadOperativa, nombreEmpleado: string): Empleado | undefined {
    return unidad.empleados.find((empleado) => this.sonIguales(empleado.nombre, nombreEmpleado));
  }

  private buscarIndiceUltimoAplicado(historial: ReadonlyArray<AjusteManualPlanificacion>): number {
    for (let indice = historial.length - 1; indice >= 0; indice -= 1) {
      if (historial[indice]?.estaAplicado()) {
        return indice;
      }
    }

    return -1;
  }

  private conflicto(
    calendario: Calendario,
    historial: ReadonlyArray<AjusteManualPlanificacion>,
    mensaje: string,
  ): ResultadoAjusteManualPlanificacion {
    return this.conflictos(calendario, historial, [mensaje]);
  }

  private conflictos(
    calendario: Calendario,
    historial: ReadonlyArray<AjusteManualPlanificacion>,
    mensajes: ReadonlyArray<string>,
  ): ResultadoAjusteManualPlanificacion {
    return {
      esExitoso: false,
      calendario,
      historial: [...historial],
      ajuste: null,
      conflictos: [...new Set(mensajes)],
    };
  }

  private esTurnoOperativo(estado: string): estado is TurnoOperativoPlanificacion {
    return estado === 'TURNO A' || estado === 'TURNO B';
  }

  private esEstadoIntercambiable(estado: string): estado is EstadoIntercambiablePlanificacion {
    return this.esTurnoOperativo(estado) || estado === 'LIBRE';
  }

  private sonIguales(primero: string, segundo: string): boolean {
    return this.normalizarNombre(primero) === this.normalizarNombre(segundo);
  }

  private normalizarNombre(valor: string): string {
    return valor.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private normalizarUnidad(unidadOperativa: string): string {
    return this.normalizarNombre(unidadOperativa)
      .replace(/^E\s*\/\s*S\s+/, '')
      .replace(/\s+CAJEROS$/, ' CAJA');
  }
}
