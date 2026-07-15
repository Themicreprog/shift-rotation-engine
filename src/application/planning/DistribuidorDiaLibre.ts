import { Empleado } from '../../domain/Empleado.js';

export class DistribuidorDiaLibre {
  /**
   * Temporalmente todos los empleados descansan el último día
   * de la semana (posición 6).
   *
   * Más adelante este algoritmo distribuirá automáticamente
   * los días libres respetando cobertura, comodines y vacaciones.
   */
  public distribuir(
    empleados: ReadonlyArray<Empleado>,
  ): ReadonlyMap<string, number> {
    const distribucion = new Map<string, number>();

    empleados.forEach((empleado) => {
      distribucion.set(empleado.nombre, 6);
    });

    return distribucion;
  }

  /**
   * Devuelve la posición del día libre asignada al empleado.
   */
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
}