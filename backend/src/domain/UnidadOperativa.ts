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

    const clavesEmpleados = input.empleados.map((empleado) =>
      empleado.nombre.trim().replace(/\s+/g, ' ').toUpperCase(),
    );
    const nombresRepetidos = input.empleados
      .map((empleado) => empleado.nombre)
      .filter(
        (_nombreEmpleado, index) =>
          clavesEmpleados.indexOf(clavesEmpleados[index]!) !== index,
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
