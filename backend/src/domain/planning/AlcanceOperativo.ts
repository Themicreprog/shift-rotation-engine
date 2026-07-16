export class AlcanceOperativo {
  private constructor(
    public readonly unidadesOperativas: ReadonlyArray<string>,
  ) {}

  public static create(input: {
    unidadesOperativas: ReadonlyArray<string>;
  }): AlcanceOperativo {
    const unidadesNormalizadas = input.unidadesOperativas
      .map((unidad) => unidad.trim())
      .filter((unidad) => unidad.length > 0);

    if (unidadesNormalizadas.length === 0) {
      throw new Error('AlcanceOperativo debe incluir al menos una unidad operativa.');
    }

    const clavesNormalizadas = unidadesNormalizadas.map((unidad) =>
      unidad.replace(/\s+/g, ' ').toUpperCase(),
    );
    const repetidas = unidadesNormalizadas.filter(
      (_unidad, index) =>
        clavesNormalizadas.indexOf(clavesNormalizadas[index]!) !== index,
    );

    if (repetidas.length > 0) {
      throw new Error(
        `AlcanceOperativo contiene unidades operativas repetidas: ${repetidas.join(', ')}.`,
      );
    }

    return new AlcanceOperativo([...unidadesNormalizadas]);
  }
}
