export interface AsignacionComodinPlanificacion {
  unidadOperativa: string;
  empleado: string;
}

const NOMBRES_COMODINES = new Set(['CELIO', 'LESTER']);
const UNIDAD_GLOBAL = '*';

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

    const claves = normalizadas.map(
      (asignacion) =>
        `${asignacion.unidadOperativa.replace(/\s+/g, ' ').toUpperCase()}::${asignacion.empleado.replace(/\s+/g, ' ').toUpperCase()}`,
    );

    if (new Set(claves).size !== claves.length) {
      throw new Error(
        'Un empleado no puede registrarse dos veces como comodín en la misma unidad.',
      );
    }

    return new ComodinesPlanificacion(normalizadas);
  }

  /** Reglas fijas confirmadas: Celio y Lester son reservas globales. */
  public static reglasOperativas(): ComodinesPlanificacion {
    return new ComodinesPlanificacion([
      { unidadOperativa: UNIDAD_GLOBAL, empleado: 'Celio' },
      { unidadOperativa: UNIDAD_GLOBAL, empleado: 'Lester' },
    ]);
  }

  public static vacio(): ComodinesPlanificacion {
    return new ComodinesPlanificacion([]);
  }

  public listar(): ReadonlyArray<AsignacionComodinPlanificacion> {
    return this.asignaciones.map((asignacion) => ({ ...asignacion }));
  }

  public combinar(otro: ComodinesPlanificacion): ComodinesPlanificacion {
    const unicas = new Map<string, AsignacionComodinPlanificacion>();

    for (const asignacion of [...this.listar(), ...otro.listar()]) {
      const clave = `${asignacion.unidadOperativa.toUpperCase()}::${asignacion.empleado.toUpperCase()}`;
      unicas.set(clave, asignacion);
    }

    return new ComodinesPlanificacion([...unicas.values()]);
  }

  public empleadosDeUnidad(nombreUnidadOperativa: string): ReadonlyArray<string> {
    const unidadNormalizada = nombreUnidadOperativa.trim().toUpperCase();

    return [...new Set(
      this.asignaciones
        .filter((asignacion) => {
          const unidadAsignada = asignacion.unidadOperativa.toUpperCase();
          return unidadAsignada === UNIDAD_GLOBAL || unidadAsignada === unidadNormalizada;
        })
        .map((asignacion) => asignacion.empleado),
    )];
  }

  public esComodin(nombreUnidadOperativa: string, nombreEmpleado: string): boolean {
    const unidadNormalizada = nombreUnidadOperativa.trim().toUpperCase();
    const empleadoNormalizado = nombreEmpleado.trim().toUpperCase();

    return this.asignaciones.some((asignacion) => {
      const unidadAsignada = asignacion.unidadOperativa.toUpperCase();
      return (
        (unidadAsignada === UNIDAD_GLOBAL || unidadAsignada === unidadNormalizada) &&
        asignacion.empleado.toUpperCase() === empleadoNormalizado
      );
    });
  }
}
