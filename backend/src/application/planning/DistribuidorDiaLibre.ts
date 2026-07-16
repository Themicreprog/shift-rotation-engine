import { Empleado } from '../../domain/Empleado.js';
import { EstadoTurno } from '../../domain/EstadoTurno.js';

type TurnoOperativo = 'TURNO A' | 'TURNO B';

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

  /**
   * Distribuye descansos distintos respetando la continuidad histórica.
   * Evita que dos cajeros terminen descansando el mismo día después de que
   * sus posiciones preferidas sean adelantadas por jornadas consecutivas.
   */
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
   * Distribuye el descanso de bomberos manteniendo la cobertura 3/3.
   * Cada día descansa una persona del grupo que tiene cuatro integrantes y,
   * entre los candidatos válidos, se prioriza a quien lleva más días
   * consecutivos trabajando.
   */
  public distribuirCoordinado(
    empleados: ReadonlyArray<Empleado>,
    turnosIniciales: ReadonlyMap<string, EstadoTurno>,
    coberturaMinimaPorTurno = 3,
    limitesDescanso: ReadonlyMap<string, number> = new Map(),
  ): ReadonlyMap<string, number> {
    const distribucion = new Map<string, number>();
    const pendientes = new Set(empleados.map((empleado) => empleado.nombre));
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