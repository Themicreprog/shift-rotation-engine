import { EventoPlanificacion } from './EventoPlanificacion.js';

export interface SolapamientoEventoPlanificacion {
  primero: EventoPlanificacion;
  segundo: EventoPlanificacion;
}

export class EventosPlanificacion {
  private constructor(
    private readonly eventos: ReadonlyArray<EventoPlanificacion>,
  ) {}

  public static create(
    eventos: ReadonlyArray<EventoPlanificacion> = [],
  ): EventosPlanificacion {
    return new EventosPlanificacion([...eventos]);
  }

  public static vacio(): EventosPlanificacion {
    return new EventosPlanificacion([]);
  }

  public listar(): ReadonlyArray<EventoPlanificacion> {
    return [...this.eventos];
  }

  public buscarPorEmpleado(
    nombreEmpleado: string,
    unidadOperativa?: string,
  ): ReadonlyArray<EventoPlanificacion> {
    const nombreNormalizado = nombreEmpleado.trim().toUpperCase();
    const unidadNormalizada = unidadOperativa?.trim().toUpperCase();

    return this.eventos.filter((evento) => {
      if (evento.empleado.toUpperCase() !== nombreNormalizado) {
        return false;
      }

      return (
        unidadNormalizada === undefined ||
        evento.unidadOperativa === null ||
        evento.unidadOperativa.toUpperCase() === unidadNormalizada
      );
    });
  }

  public activosEn(fecha: Date): ReadonlyArray<EventoPlanificacion> {
    return this.eventos.filter((evento) => evento.estaActivoEn(fecha));
  }

  public activosParaEmpleadoEn(
    nombreEmpleado: string,
    fecha: Date,
    unidadOperativa?: string,
  ): ReadonlyArray<EventoPlanificacion> {
    return this.buscarPorEmpleado(nombreEmpleado, unidadOperativa).filter((evento) =>
      evento.estaActivoEn(fecha),
    );
  }

  public solapamientos(): ReadonlyArray<SolapamientoEventoPlanificacion> {
    const solapamientos: SolapamientoEventoPlanificacion[] = [];

    for (let indice = 0; indice < this.eventos.length; indice += 1) {
      const primero = this.eventos[indice];

      if (!primero) {
        continue;
      }

      for (
        let siguienteIndice = indice + 1;
        siguienteIndice < this.eventos.length;
        siguienteIndice += 1
      ) {
        const segundo = this.eventos[siguienteIndice];

        if (segundo && primero.seSolapaCon(segundo)) {
          solapamientos.push({ primero, segundo });
        }
      }
    }

    return solapamientos;
  }

  public tieneSolapamientos(): boolean {
    return this.solapamientos().length > 0;
  }
}
