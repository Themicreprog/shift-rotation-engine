export type TipoAjusteManualPlanificacion = 'SUSTITUCION' | 'INTERCAMBIO';

export type EstadoAjusteManualPlanificacion = 'APLICADO' | 'DESHECHO';

export type EstadoIntercambiablePlanificacion = 'TURNO A' | 'TURNO B' | 'LIBRE';

export type TurnoOperativoPlanificacion = 'TURNO A' | 'TURNO B';

export interface MovimientoAjusteManualPlanificacion {
  readonly turno: TurnoOperativoPlanificacion;
  readonly titularOriginal: string;
  readonly titular: string;
  readonly reemplazo: string;
}

export interface CrearAjusteManualPlanificacionInput {
  readonly id: string;
  readonly unidadOperativa: string;
  readonly dia: number;
  readonly titular: string;
  readonly reemplazo: string;
  readonly estadoTitularAnterior: TurnoOperativoPlanificacion;
  readonly estadoReemplazoAnterior: EstadoIntercambiablePlanificacion;
  readonly movimientos: ReadonlyArray<MovimientoAjusteManualPlanificacion>;
  readonly estado?: EstadoAjusteManualPlanificacion;
}

/**
 * Registro serializable de una edicion manual ya validada.
 *
 * El primer movimiento siempre representa la asignacion seleccionada por el
 * usuario. Un intercambio entre TURNOS conserva un segundo movimiento para
 * mantener la trazabilidad de las dos asignaciones originales.
 */
export class AjusteManualPlanificacion {
  public readonly id: string;
  public readonly tipo: TipoAjusteManualPlanificacion;
  public readonly unidadOperativa: string;
  public readonly dia: number;
  public readonly turno: TurnoOperativoPlanificacion;
  public readonly titularOriginal: string;
  public readonly titular: string;
  public readonly reemplazo: string;
  public readonly estadoTitularAnterior: TurnoOperativoPlanificacion;
  public readonly estadoReemplazoAnterior: EstadoIntercambiablePlanificacion;
  public readonly estadoTitularPosterior: EstadoIntercambiablePlanificacion;
  public readonly estadoReemplazoPosterior: TurnoOperativoPlanificacion;
  public readonly movimientos: ReadonlyArray<MovimientoAjusteManualPlanificacion>;
  public readonly estado: EstadoAjusteManualPlanificacion;

  private constructor(input: CrearAjusteManualPlanificacionInput) {
    const movimientoPrincipal = input.movimientos[0]!;

    this.id = input.id;
    this.tipo = input.estadoReemplazoAnterior === 'LIBRE' ? 'SUSTITUCION' : 'INTERCAMBIO';
    this.unidadOperativa = input.unidadOperativa;
    this.dia = input.dia;
    this.turno = movimientoPrincipal.turno;
    this.titularOriginal = movimientoPrincipal.titularOriginal;
    this.titular = input.titular;
    this.reemplazo = input.reemplazo;
    this.estadoTitularAnterior = input.estadoTitularAnterior;
    this.estadoReemplazoAnterior = input.estadoReemplazoAnterior;
    this.estadoTitularPosterior = input.estadoReemplazoAnterior;
    this.estadoReemplazoPosterior = input.estadoTitularAnterior;
    this.movimientos = Object.freeze(
      input.movimientos.map((movimiento) => Object.freeze({ ...movimiento })),
    );
    this.estado = input.estado ?? 'APLICADO';
  }

  public static create(input: CrearAjusteManualPlanificacionInput): AjusteManualPlanificacion {
    const id = input.id.trim();
    const unidadOperativa = input.unidadOperativa.trim();
    const titular = input.titular.trim();
    const reemplazo = input.reemplazo.trim();

    if (id.length === 0) {
      throw new Error('AjusteManualPlanificacion.id no puede estar vacio.');
    }

    if (unidadOperativa.length === 0) {
      throw new Error('AjusteManualPlanificacion.unidadOperativa no puede estar vacia.');
    }

    if (!Number.isInteger(input.dia) || input.dia <= 0) {
      throw new Error('AjusteManualPlanificacion.dia debe ser un entero mayor que cero.');
    }

    if (titular.length === 0 || reemplazo.length === 0) {
      throw new Error('AjusteManualPlanificacion requiere titular y reemplazo.');
    }

    if (this.sonIguales(titular, reemplazo)) {
      throw new Error('AjusteManualPlanificacion requiere dos empleados diferentes.');
    }

    if (!this.esTurnoOperativo(input.estadoTitularAnterior)) {
      throw new Error('El estado anterior del titular debe ser TURNO A o TURNO B.');
    }

    if (!this.esEstadoIntercambiable(input.estadoReemplazoAnterior)) {
      throw new Error('El estado anterior del reemplazo debe ser TURNO A, TURNO B o LIBRE.');
    }

    const cantidadEsperada = input.estadoReemplazoAnterior === 'LIBRE' ? 1 : 2;

    if (input.movimientos.length !== cantidadEsperada) {
      throw new Error(`El ajuste requiere ${cantidadEsperada} movimiento(s) de trazabilidad.`);
    }

    const movimientos = input.movimientos.map((movimiento) => ({
      turno: movimiento.turno,
      titularOriginal: movimiento.titularOriginal.trim(),
      titular: movimiento.titular.trim(),
      reemplazo: movimiento.reemplazo.trim(),
    }));

    if (
      movimientos.some(
        (movimiento) =>
          movimiento.titularOriginal.length === 0 ||
          movimiento.titular.length === 0 ||
          movimiento.reemplazo.length === 0 ||
          this.sonIguales(movimiento.titular, movimiento.reemplazo),
      )
    ) {
      throw new Error('Los movimientos del ajuste contienen empleados invalidos.');
    }

    const movimientoPrincipal = movimientos[0];

    if (
      movimientoPrincipal === undefined ||
      movimientoPrincipal.turno !== input.estadoTitularAnterior ||
      !this.sonIguales(movimientoPrincipal.titular, titular) ||
      !this.sonIguales(movimientoPrincipal.reemplazo, reemplazo)
    ) {
      throw new Error('El movimiento principal no coincide con los participantes del ajuste.');
    }

    if (input.estadoReemplazoAnterior !== 'LIBRE') {
      const movimientoInverso = movimientos[1];

      if (
        movimientoInverso === undefined ||
        movimientoInverso.turno !== input.estadoReemplazoAnterior ||
        !this.sonIguales(movimientoInverso.titular, reemplazo) ||
        !this.sonIguales(movimientoInverso.reemplazo, titular)
      ) {
        throw new Error('El movimiento inverso no coincide con el intercambio de turnos.');
      }
    }

    return new AjusteManualPlanificacion({
      id,
      unidadOperativa,
      dia: input.dia,
      titular,
      reemplazo,
      estadoTitularAnterior: input.estadoTitularAnterior,
      estadoReemplazoAnterior: input.estadoReemplazoAnterior,
      movimientos,
      estado: input.estado ?? 'APLICADO',
    });
  }

  public estaAplicado(): boolean {
    return this.estado === 'APLICADO';
  }

  public marcarDeshecho(): AjusteManualPlanificacion {
    if (!this.estaAplicado()) {
      return this;
    }

    return AjusteManualPlanificacion.create({
      id: this.id,
      unidadOperativa: this.unidadOperativa,
      dia: this.dia,
      titular: this.titular,
      reemplazo: this.reemplazo,
      estadoTitularAnterior: this.estadoTitularAnterior,
      estadoReemplazoAnterior: this.estadoReemplazoAnterior,
      movimientos: this.movimientos,
      estado: 'DESHECHO',
    });
  }

  private static esTurnoOperativo(estado: string): estado is TurnoOperativoPlanificacion {
    return estado === 'TURNO A' || estado === 'TURNO B';
  }

  private static esEstadoIntercambiable(
    estado: string,
  ): estado is EstadoIntercambiablePlanificacion {
    return this.esTurnoOperativo(estado) || estado === 'LIBRE';
  }

  private static sonIguales(primero: string, segundo: string): boolean {
    return primero.trim().toUpperCase() === segundo.trim().toUpperCase();
  }
}
