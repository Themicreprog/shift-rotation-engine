export class ValidacionPlanificacion {
  private constructor(
    public readonly esValida: boolean,
    public readonly errores: ReadonlyArray<string>,
  ) {}

  public static success(): ValidacionPlanificacion {
    return new ValidacionPlanificacion(true, []);
  }

  public static failure(errores: ReadonlyArray<string>): ValidacionPlanificacion {
    const erroresNormalizados = errores
      .map((error) => error.trim())
      .filter((error) => error.length > 0);

    if (erroresNormalizados.length === 0) {
      throw new Error('ValidacionPlanificacion.failure requiere al menos un error.');
    }

    return new ValidacionPlanificacion(false, [...erroresNormalizados]);
  }
}