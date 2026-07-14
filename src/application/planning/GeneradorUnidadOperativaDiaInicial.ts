import { Empleado } from '../../domain/Empleado.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { GeneradorEstadoInicialEmpleado } from './GeneradorEstadoInicialEmpleado.js';

export class GeneradorUnidadOperativaDiaInicial {
  public constructor(
    private readonly generadorEstadoInicialEmpleado: GeneradorEstadoInicialEmpleado,
  ) {}

  public execute(unidadOperativaOrigen: UnidadOperativa): UnidadOperativa {
    const empleadosDestino = unidadOperativaOrigen.empleados.map((empleadoOrigen) =>
      this.crearEmpleadoDestino(empleadoOrigen),
    );

    return UnidadOperativa.create({
      nombre: unidadOperativaOrigen.nombre,
      empleados: empleadosDestino,
    });
  }

  private crearEmpleadoDestino(empleadoOrigen: Empleado): Empleado {
    const estadoPlanificado =
      this.generadorEstadoInicialEmpleado.execute(empleadoOrigen);

    return Empleado.create({
      nombre: empleadoOrigen.nombre,
      estadosPorDia: [estadoPlanificado.estadoInicial],
    });
  }
}