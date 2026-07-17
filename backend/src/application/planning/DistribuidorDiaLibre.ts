import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';
import type { RequerimientoCoberturaTurnos } from './PoliticaCoberturaOperativa.js';

type TurnoOperativo = 'TURNO A' | 'TURNO B';

export interface OpcionesDistribucionCoordinada {
  readonly posicionesDescansoPermitidas: ReadonlySet<number>;
  readonly requerimientoPorPosicion: ReadonlyMap<
    number,
    RequerimientoCoberturaTurnos
  >;
}

export class DistribuidorDiaLibre {
  public distribuir(
    empleados: ReadonlyArray<Empleado>,
  ): ReadonlyMap<string, number> {
    const distribucion = new Map<string, number>();

    empleados.forEach((empleado, indice) => {
      distribucion.set(empleado.nombre, (6 - (indice % 7) + 7) % 7);
    });

    return distribucion;
  }

  public distribuirConContinuidad(
    empleados: ReadonlyArray<Empleado>,
    limitesDescanso: ReadonlyMap<string, number>,
    turnosIniciales: ReadonlyMap<string, EstadoTurno> = new Map(),
  ): ReadonlyMap<string, number> {
    const distribucionCaja = this.distribuirParejaCaja(
      empleados,
      limitesDescanso,
      turnosIniciales,
    );

    if (distribucionCaja !== null) {
      return distribucionCaja;
    }

    const preferidos = this.distribuir(empleados);
    const disponibles = new Set(Array.from({ length: 7 }, (_, indice) => indice));
    const distribucion = new Map<string, number>();
    const ordenados = [...empleados].sort(
      (primero, segundo) =>
        this.obtenerLimite(primero.nombre, limitesDescanso) -
        this.obtenerLimite(segundo.nombre, limitesDescanso),
    );

    for (const empleado of ordenados) {
      const limite = this.obtenerLimite(empleado.nombre, limitesDescanso);
      const preferido = Math.min(
        preferidos.get(empleado.nombre) ?? limite,
        limite,
      );
      const posicion = this.buscarPosicionDisponible(
        disponibles,
        preferido,
        limite,
      );

      distribucion.set(empleado.nombre, posicion);
      disponibles.delete(posicion);
    }

    return distribucion;
  }

  /**
   * Distribuye los descansos de pista como un problema de cobertura semanal.
   * La búsqueda permite que varios empleados descansen el domingo, cuando el
   * mínimo baja a 2/2, y evita cualquier LIBRE en viernes o sábado.
   */
  public distribuirCoordinado(
    empleados: ReadonlyArray<Empleado>,
    turnosIniciales: ReadonlyMap<string, EstadoTurno>,
    coberturaMinimaPorTurno = 3,
    limitesDescanso: ReadonlyMap<string, number> = new Map(),
    opciones?: OpcionesDistribucionCoordinada,
  ): ReadonlyMap<string, number> {
    const turnoActual = new Map<string, TurnoOperativo>();

    for (const empleado of empleados) {
      const estado = turnosIniciales.get(empleado.nombre)?.valor;

      if (estado === 'TURNO A' || estado === 'TURNO B') {
        turnoActual.set(empleado.nombre, estado);
      }
    }

    const cantidadAInicial = this.contarTurno(turnoActual, 'TURNO A');
    const cantidadBInicial = this.contarTurno(turnoActual, 'TURNO B');
    const dotacionMinimaCoordinada = coberturaMinimaPorTurno * 2 + 1;

    if (
      turnoActual.size !== empleados.length ||
      empleados.length < dotacionMinimaCoordinada ||
      cantidadAInicial < coberturaMinimaPorTurno ||
      cantidadBInicial < coberturaMinimaPorTurno
    ) {
      return this.distribuirConContinuidad(
        empleados,
        limitesDescanso,
        turnosIniciales,
      );
    }

    if (opciones !== undefined) {
      const encontrada = this.buscarDistribucionSemanal(
        empleados,
        turnoActual,
        limitesDescanso,
        opciones,
      );

      if (encontrada !== null) {
        return encontrada;
      }
    }

    return this.distribuirCoordinadoClasico(
      empleados,
      turnoActual,
      coberturaMinimaPorTurno,
      limitesDescanso,
    );
  }

  public distribuirCajaEscalonada(
    empleados: ReadonlyArray<Empleado>,
    turnosIniciales: ReadonlyMap<string, EstadoTurno>,
    limitesDescanso: ReadonlyMap<string, number>,
    posicionTurnoA: number,
    posicionTurnoB: number,
  ): ReadonlyMap<string, number> {
    const empleadoA = empleados.find(
      (empleado) => turnosIniciales.get(empleado.nombre)?.valor === 'TURNO A',
    );
    const empleadoB = empleados.find(
      (empleado) => turnosIniciales.get(empleado.nombre)?.valor === 'TURNO B',
    );

    if (!empleadoA || !empleadoB || empleados.length !== 2) {
      return this.distribuirConContinuidad(
        empleados,
        limitesDescanso,
        turnosIniciales,
      );
    }

    // Los días se escalonan entre estaciones para que Celio pueda cubrir
    // un solo cajero por jornada. La regla operativa de día permitido tiene
    // prioridad sobre la preferencia histórica calculada por continuidad.
    return new Map([
      [empleadoA.nombre, posicionTurnoA],
      [empleadoB.nombre, posicionTurnoB],
    ]);
  }

  public obtenerDiaLibre(
    nombreEmpleado: string,
    distribucion: ReadonlyMap<string, number>,
  ): number {
    const posicion = distribucion.get(nombreEmpleado);

    if (posicion === undefined) {
      throw new Error(
        `No existe un día libre asignado para el empleado "${nombreEmpleado}".`,
      );
    }

    return posicion;
  }

  private buscarDistribucionSemanal(
    empleados: ReadonlyArray<Empleado>,
    turnosIniciales: ReadonlyMap<string, TurnoOperativo>,
    limitesDescanso: ReadonlyMap<string, number>,
    opciones: OpcionesDistribucionCoordinada,
  ): ReadonlyMap<string, number> | null {
    const posicionesPermitidas = [...opciones.posicionesDescansoPermitidas].sort(
      (a, b) => a - b,
    );
    const preferidos = this.distribuir(empleados);
    const empleadosOrdenados = [...empleados].sort(
      (primero, segundo) =>
        this.obtenerLimite(primero.nombre, limitesDescanso) -
          this.obtenerLimite(segundo.nombre, limitesDescanso) ||
        primero.nombre.localeCompare(segundo.nombre),
    );
    let mejor: Map<string, number> | null = null;
    let mejorPuntaje = Number.POSITIVE_INFINITY;
    const actual = new Map<string, number>();

    const buscar = (indice: number, puntaje: number): void => {
      if (puntaje >= mejorPuntaje) {
        return;
      }

      if (indice === empleadosOrdenados.length) {
        if (
          this.distribucionCumpleCobertura(
            empleados,
            turnosIniciales,
            actual,
            opciones.requerimientoPorPosicion,
          )
        ) {
          mejor = new Map(actual);
          mejorPuntaje = puntaje;
        }
        return;
      }

      const empleado = empleadosOrdenados[indice];

      if (!empleado) {
        return;
      }

      const limite = this.obtenerLimite(empleado.nombre, limitesDescanso);
      const candidatas = [...posicionesPermitidas].sort((primero, segundo) => {
        const preferido = preferidos.get(empleado.nombre) ?? 6;
        return (
          Math.abs(primero - preferido) - Math.abs(segundo - preferido) ||
          primero - segundo
        );
      });

      for (const posicion of candidatas) {
        actual.set(empleado.nombre, posicion);
        const preferido = preferidos.get(empleado.nombre) ?? posicion;
        const penalizacionLimite = posicion > limite ? 100 : 0;
        buscar(
          indice + 1,
          puntaje + Math.abs(posicion - preferido) + penalizacionLimite,
        );
        actual.delete(empleado.nombre);
      }
    };

    buscar(0, 0);

    return mejor;
  }

  private distribucionCumpleCobertura(
    empleados: ReadonlyArray<Empleado>,
    turnosIniciales: ReadonlyMap<string, TurnoOperativo>,
    distribucion: ReadonlyMap<string, number>,
    requerimientos: ReadonlyMap<number, RequerimientoCoberturaTurnos>,
  ): boolean {
    const turnos = new Map(turnosIniciales);

    for (let posicion = 0; posicion < 7; posicion += 1) {
      const descansan = empleados.filter(
        (empleado) => distribucion.get(empleado.nombre) === posicion,
      );
      let disponiblesA = this.contarTurno(turnos, 'TURNO A');
      let disponiblesB = this.contarTurno(turnos, 'TURNO B');

      for (const empleado of descansan) {
        const turno = turnos.get(empleado.nombre);

        if (turno === 'TURNO A') {
          disponiblesA -= 1;
        } else if (turno === 'TURNO B') {
          disponiblesB -= 1;
        }
      }

      const requerido = requerimientos.get(posicion) ?? {
        turnoA: 3,
        turnoB: 3,
      };

      if (
        disponiblesA < requerido.turnoA ||
        disponiblesB < requerido.turnoB
      ) {
        return false;
      }

      for (const empleado of descansan) {
        const turnoAnterior = turnos.get(empleado.nombre);

        if (turnoAnterior !== undefined) {
          turnos.set(
            empleado.nombre,
            turnoAnterior === 'TURNO A' ? 'TURNO B' : 'TURNO A',
          );
        }
      }
    }

    return true;
  }

  private distribuirCoordinadoClasico(
    empleados: ReadonlyArray<Empleado>,
    turnosIniciales: ReadonlyMap<string, TurnoOperativo>,
    coberturaMinimaPorTurno: number,
    limitesDescanso: ReadonlyMap<string, number>,
  ): ReadonlyMap<string, number> {
    const distribucion = new Map<string, number>();
    const pendientes = new Set(empleados.map((empleado) => empleado.nombre));
    const turnoActual = new Map(turnosIniciales);

    for (
      let posicionDia = 0;
      posicionDia < 7 && pendientes.size > 0;
      posicionDia += 1
    ) {
      const cantidadA = this.contarTurno(turnoActual, 'TURNO A');
      const cantidadB = this.contarTurno(turnoActual, 'TURNO B');
      const turnoPreferido: TurnoOperativo =
        cantidadA >= cantidadB ? 'TURNO A' : 'TURNO B';
      const turnoAlternativo: TurnoOperativo =
        turnoPreferido === 'TURNO A' ? 'TURNO B' : 'TURNO A';
      const candidato =
        this.buscarCandidato(
          empleados,
          pendientes,
          turnoActual,
          turnoPreferido,
          coberturaMinimaPorTurno,
          limitesDescanso,
        ) ??
        this.buscarCandidato(
          empleados,
          pendientes,
          turnoActual,
          turnoAlternativo,
          coberturaMinimaPorTurno,
          limitesDescanso,
        );

      if (!candidato) {
        break;
      }

      distribucion.set(candidato.nombre, posicionDia);
      pendientes.delete(candidato.nombre);

      const turnoAnterior = turnoActual.get(candidato.nombre)!;
      turnoActual.set(
        candidato.nombre,
        turnoAnterior === 'TURNO A' ? 'TURNO B' : 'TURNO A',
      );
    }

    let indiceRestante = 0;
    for (const empleado of empleados) {
      if (!pendientes.has(empleado.nombre)) {
        continue;
      }

      distribucion.set(empleado.nombre, indiceRestante % 7);
      indiceRestante += 1;
    }

    return distribucion;
  }

  private contarTurno(
    turnos: ReadonlyMap<string, TurnoOperativo>,
    turno: TurnoOperativo,
  ): number {
    return [...turnos.values()].filter((actual) => actual === turno).length;
  }

  private buscarCandidato(
    empleados: ReadonlyArray<Empleado>,
    pendientes: ReadonlySet<string>,
    turnos: ReadonlyMap<string, TurnoOperativo>,
    turno: TurnoOperativo,
    coberturaMinima: number,
    limitesDescanso: ReadonlyMap<string, number>,
  ): Empleado | undefined {
    const cantidadTurno = this.contarTurno(turnos, turno);

    if (cantidadTurno - 1 < coberturaMinima) {
      return undefined;
    }

    return empleados
      .filter(
        (empleado) =>
          pendientes.has(empleado.nombre) &&
          turnos.get(empleado.nombre) === turno,
      )
      .sort(
        (primero, segundo) =>
          this.obtenerLimite(primero.nombre, limitesDescanso) -
          this.obtenerLimite(segundo.nombre, limitesDescanso),
      )[0];
  }

  private distribuirParejaCaja(
    empleados: ReadonlyArray<Empleado>,
    limitesDescanso: ReadonlyMap<string, number>,
    turnosIniciales: ReadonlyMap<string, EstadoTurno>,
  ): ReadonlyMap<string, number> | null {
    if (empleados.length !== 2) {
      return null;
    }

    const empleadoA = empleados.find(
      (empleado) => turnosIniciales.get(empleado.nombre)?.valor === 'TURNO A',
    );
    const empleadoB = empleados.find(
      (empleado) => turnosIniciales.get(empleado.nombre)?.valor === 'TURNO B',
    );

    if (!empleadoA || !empleadoB) {
      return null;
    }

    const posicionB = Math.max(
      1,
      Math.min(6, this.obtenerLimite(empleadoB.nombre, limitesDescanso)),
    );
    const posicionA = Math.max(
      0,
      Math.min(
        posicionB - 1,
        this.obtenerLimite(empleadoA.nombre, limitesDescanso),
      ),
    );

    return new Map([
      [empleadoA.nombre, posicionA],
      [empleadoB.nombre, posicionB],
    ]);
  }

  private buscarPosicionDisponible(
    disponibles: ReadonlySet<number>,
    preferido: number,
    limite: number,
  ): number {
    if (disponibles.has(preferido)) {
      return preferido;
    }

    for (let posicion = limite; posicion >= 0; posicion -= 1) {
      if (disponibles.has(posicion)) {
        return posicion;
      }
    }

    return [...disponibles].sort((a, b) => a - b)[0] ?? 0;
  }

  private obtenerLimite(
    nombreEmpleado: string,
    limitesDescanso: ReadonlyMap<string, number>,
  ): number {
    return Math.max(
      0,
      Math.min(6, limitesDescanso.get(nombreEmpleado) ?? 6),
    );
  }
}
