export interface AsignacionComodinPlanificacion {
  unidadOperativa: string;
  empleado: string;
}

const NOMBRES_COMODINES = new Set(['CELIO', 'LESTER']);

export class ComodinesPlanificacion {
  private constructor(
    private readonly asignaciones: ReadonlyArray<AsignacionComodinPlanificacion>,
  ) {}

  public static create(
    asignaciones: ReadonlyArray<AsignacionComodinPlanificacion> = [],
  ): ComodinesPlanificacion {
    const normalizadas = asignaciones.map((asignacion) => {
      const unidadOperativa = asignacion.unidadOperativa.trim();
      const empleado = asignacion.empleado.trim();

      if (unidadOperativa.length === 0 || empleado.length === 0) {
        throw new Error(
          'Cada comodín debe indicar una unidad operativa y un empleado.',
        );
      }

      if (!NOMBRES_COMODINES.has(empleado.toUpperCase())) {
        throw new Error(
          `El empleado ${empleado} no está autorizado como comodín.`,
        );
      }

      return { unidadOperativa, empleado };
    });

    const claves = normalizadas.map((asignacion) =>
      asignacion.empleado.replace(/\s+/g, ' ').toUpperCase(),
    );

    if (new Set(claves).size !== claves.length) {
      throw new Error('Un empleado no puede registrarse dos veces como comodín.');
    }

    return new ComodinesPlanificacion(normalizadas);
  }

  public static vacio(): ComodinesPlanificacion {
    return new ComodinesPlanificacion([]);
  }

  public listar(): ReadonlyArray<AsignacionComodinPlanificacion> {
    return this.asignaciones.map((asignacion) => ({ ...asignacion }));
  }

  public empleadosDeUnidad(nombreUnidadOperativa: string): ReadonlyArray<string> {
    const unidadNormalizada = nombreUnidadOperativa.trim().toUpperCase();

    return this.asignaciones
      .filter(
        (asignacion) =>
          asignacion.unidadOperativa.toUpperCase() === unidadNormalizada,
      )
      .map((asignacion) => asignacion.empleado);
  }

  public esComodin(nombreUnidadOperativa: string, nombreEmpleado: string): boolean {
    const unidadNormalizada = nombreUnidadOperativa.trim().toUpperCase();
    const empleadoNormalizado = nombreEmpleado.trim().toUpperCase();

    return this.asignaciones.some(
      (asignacion) =>
        asignacion.unidadOperativa.toUpperCase() === unidadNormalizada &&
        asignacion.empleado.toUpperCase() === empleadoNormalizado,
    );
  }
}
