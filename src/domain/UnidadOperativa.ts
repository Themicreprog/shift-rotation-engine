import { Empleado } from './Empleado.js';

export class UnidadOperativa {
  private constructor(
    public readonly nombre: string,
    public readonly empleados: ReadonlyArray<Empleado>,
  ) {}

  public static create(input: {
    nombre: string;
    empleados: ReadonlyArray<Empleado>;
  }): UnidadOperativa {
    const nombre = input.nombre.trim();

    if (nombre.length === 0) {
      throw new Error('UnidadOperativa.nombre no puede estar vacío.');
    }

    const nombresRepetidos = input.empleados
      .map((empleado) => empleado.nombre)
      .filter(
        (nombreEmpleado, index, nombres) =>
          nombres.indexOf(nombreEmpleado) !== index,
      );

    if (nombresRepetidos.length > 0) {
      throw new Error(
        `UnidadOperativa "${nombre}" contiene empleados duplicados: ${nombresRepetidos.join(', ')}.`,
      );
    }

    return new UnidadOperativa(nombre, [...input.empleados]);
  }

  public cantidadEmpleados(): number {
    return this.empleados.length;
  }
}