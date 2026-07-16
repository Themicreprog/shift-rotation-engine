import { UnidadOperativa } from './UnidadOperativa.js';

export interface PeriodoOrigenCalendario {
  mes: number;
  anio: number;
  fechaInicio: Date;
  fechaFin: Date;
}

export class Calendario {
  public nombre: string;
  public unidadesOperativas: UnidadOperativa[] = [];

  private readonly periodoOrigen: PeriodoOrigenCalendario | null;

  constructor(
    nombre: string,
    periodoOrigen: PeriodoOrigenCalendario | null = null,
  ) {
    this.nombre = nombre;
    this.periodoOrigen = this.validarPeriodoOrigen(periodoOrigen);
  }

  agregarUnidadOperativa(unidad: UnidadOperativa): void {
    if (this.buscarUnidadOperativa(unidad.nombre)) {
      throw new Error(
        `El calendario ya contiene la unidad operativa "${unidad.nombre}".`,
      );
    }

    this.unidadesOperativas.push(unidad);
  }

  buscarUnidadOperativa(nombreEstacion: string): UnidadOperativa | undefined {
    return this.unidadesOperativas.find(
      (u) => u.nombre.toUpperCase() === nombreEstacion.toUpperCase(),
    );
  }

  public obtenerPeriodoOrigen(): PeriodoOrigenCalendario | null {
    if (this.periodoOrigen === null) {
      return null;
    }

    return {
      ...this.periodoOrigen,
      fechaInicio: new Date(this.periodoOrigen.fechaInicio),
      fechaFin: new Date(this.periodoOrigen.fechaFin),
    };
  }

  private validarPeriodoOrigen(
    periodo: PeriodoOrigenCalendario | null,
  ): PeriodoOrigenCalendario | null {
    if (periodo === null) {
      return null;
    }

    if (!Number.isInteger(periodo.mes) || periodo.mes < 1 || periodo.mes > 12) {
      throw new Error('Calendario.periodoOrigen.mes debe estar entre 1 y 12.');
    }

    if (!Number.isInteger(periodo.anio) || periodo.anio < 1900) {
      throw new Error('Calendario.periodoOrigen.anio no es valido.');
    }

    if (
      !(periodo.fechaInicio instanceof Date) ||
      Number.isNaN(periodo.fechaInicio.getTime()) ||
      !(periodo.fechaFin instanceof Date) ||
      Number.isNaN(periodo.fechaFin.getTime())
    ) {
      throw new Error('Calendario.periodoOrigen debe contener fechas validas.');
    }

    const fechaInicio = this.inicioUtc(periodo.fechaInicio);
    const fechaFin = this.inicioUtc(periodo.fechaFin);

    if (fechaFin.getTime() < fechaInicio.getTime()) {
      throw new Error(
        'Calendario.periodoOrigen.fechaFin no puede ser menor que fechaInicio.',
      );
    }

    if (
      fechaInicio.getUTCFullYear() !== periodo.anio ||
      fechaInicio.getUTCMonth() + 1 !== periodo.mes ||
      fechaInicio.getUTCDate() !== 1
    ) {
      throw new Error(
        'Calendario.periodoOrigen.fechaInicio debe ser el primer dia del mes declarado.',
      );
    }

    return {
      mes: periodo.mes,
      anio: periodo.anio,
      fechaInicio,
      fechaFin,
    };
  }

  private inicioUtc(fecha: Date): Date {
    return new Date(
      Date.UTC(
        fecha.getUTCFullYear(),
        fecha.getUTCMonth(),
        fecha.getUTCDate(),
      ),
    );
  }
}
