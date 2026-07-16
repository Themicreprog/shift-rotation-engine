import { Empleado } from '../../domain/Empleado.js';

export class DistribuidorDiaLibre {
  public distribuir(
    empleados: ReadonlyArray<Empleado>,
  ): ReadonlyMap<string, number> {
    const distribucion = new Map<string, number>();

    empleados.forEach((empleado, indice) => {
      // El primer empleado conserva el domingo como descanso para mantener
      // continuidad con los calendarios existentes; los demás se reparten
      // hacia atrás durante la semana de forma determinista.
      distribucion.set(empleado.nombre, (6 - (indice % 7) + 7) % 7);
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
