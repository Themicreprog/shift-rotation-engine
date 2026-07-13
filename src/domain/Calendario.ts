import { UnidadOperativa } from './UnidadOperativa.js';

export class Calendario {
  private constructor(
    public readonly nombre: string,
    public readonly unidadesOperativas: ReadonlyArray<UnidadOperativa>,
  ) {}

  public static create(input: {
    nombre: string;
    unidadesOperativas: ReadonlyArray<UnidadOperativa>;
  }): Calendario {
    const nombre = input.nombre.trim();

    if (nombre.length === 0) {
      throw new Error('Calendario.nombre no puede estar vacío.');
    }

    const nombresRepetidos = input.unidadesOperativas
      .map((unidad) => unidad.nombre)
      .filter((nombreUnidad, index, nombres) => nombres.indexOf(nombreUnidad) !== index);

    if (nombresRepetidos.length > 0) {
      throw new Error(
        `Calendario "${nombre}" contiene unidades operativas duplicadas: ${nombresRepetidos.join(', ')}.`,
      );
    }

    return new Calendario(nombre, [...input.unidadesOperativas]);
  }

  public buscarUnidadOperativa(nombre: string): UnidadOperativa | undefined {
    return this.unidadesOperativas.find((unidad) => unidad.nombre === nombre);
  }
}