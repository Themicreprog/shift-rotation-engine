import { Empleado } from '../../domain/Empleado.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';

const DIAS_POR_SEMANA = 7;
const EMPLEADOS_COMODIN = new Set(['CELIO', 'LESTER']);
const FLEXIBLES_DE_CAJA = new Set(['EDWIN', 'JEFERSON']);

export interface IncidenciaDescanso {
  empleado: string;
  tipo: 'DIA_LIBRE_SEMANAL' | 'DIAS_CONSECUTIVOS';
  semana?: number;
  diasLibres?: number;
  diasConsecutivos?: number;
}

export class ValidadorDescanso {
  public validar(
    unidadOperativa: UnidadOperativa,
    fechaInicio?: Date,
  ): IncidenciaDescanso[] {
    return unidadOperativa.empleados.flatMap((empleado) => [
      ...this.validarDiaLibreSemanal(
        empleado,
        unidadOperativa.nombre,
        fechaInicio,
      ),
      ...this.validarDiasConsecutivos(empleado),
    ]);
  }

  private validarDiaLibreSemanal(
    empleado: Empleado,
    nombreUnidad: string,
    fechaInicio?: Date,
  ): IncidenciaDescanso[] {
    if (this.esReservaFueraDeRotacion(nombreUnidad, empleado.nombre)) {
      return [];
    }

    const incidencias: IncidenciaDescanso[] = [];

    for (const { inicioSemana, numeroSemana } of this.semanasCompletas(
      empleado.totalDias(),
      fechaInicio,
    )) {
      const estadosSemana = Array.from(
        { length: DIAS_POR_SEMANA },
        (_, indice) => empleado.estadoDelDia(inicioSemana + indice),
      );
      const diasLibres = estadosSemana.filter(
        (estado) => estado.valor === 'LIBRE',
      ).length;
      const tieneEvento = estadosSemana.some(
        (estado) =>
          estado.valor === 'VACACIONES' || estado.valor === 'FERIADO',
      );
      const descansosEfectivos = diasLibres + (tieneEvento ? 1 : 0);

      // VACACIONES o FERIADO ya interrumpen la jornada durante esa semana.
      // No se agrega otro LIBRE, porque duplicaria el descanso y empeoraria
      // artificialmente la cobertura. Las reservas se validan aparte.
      if (descansosEfectivos !== 1) {
        incidencias.push({
          empleado: empleado.nombre,
          tipo: 'DIA_LIBRE_SEMANAL',
          semana: numeroSemana,
          diasLibres,
        });
      }
    }

    return incidencias;
  }

  private semanasCompletas(
    totalDias: number,
    fechaInicio?: Date,
  ): Array<{ inicioSemana: number; numeroSemana: number }> {
    if (fechaInicio === undefined) {
      return Array.from(
        { length: Math.floor(totalDias / DIAS_POR_SEMANA) },
        (_, indice) => ({
          inicioSemana: indice * DIAS_POR_SEMANA + 1,
          numeroSemana: indice + 1,
        }),
      );
    }

    const desplazamientoDesdeLunes = (fechaInicio.getUTCDay() + 6) % 7;
    const primerInicio =
      desplazamientoDesdeLunes === 0
        ? 1
        : DIAS_POR_SEMANA - desplazamientoDesdeLunes + 1;
    const primeraSemana = desplazamientoDesdeLunes === 0 ? 1 : 2;
    const semanas: Array<{ inicioSemana: number; numeroSemana: number }> = [];

    for (
      let inicioSemana = primerInicio, numeroSemana = primeraSemana;
      inicioSemana + DIAS_POR_SEMANA - 1 <= totalDias;
      inicioSemana += DIAS_POR_SEMANA, numeroSemana += 1
    ) {
      semanas.push({ inicioSemana, numeroSemana });
    }

    return semanas;
  }

  private esReservaFueraDeRotacion(
    nombreUnidad: string,
    nombreEmpleado: string,
  ): boolean {
    const empleado = nombreEmpleado.trim().toUpperCase();
    const unidad = nombreUnidad.trim().toUpperCase();

    return (
      EMPLEADOS_COMODIN.has(empleado) ||
      ((unidad.includes('CAJA') || unidad.includes('CAJER')) &&
        FLEXIBLES_DE_CAJA.has(empleado))
    );
  }

  private validarDiasConsecutivos(empleado: Empleado): IncidenciaDescanso[] {
    let consecutivos = 0;

    for (let dia = 1; dia <= empleado.totalDias(); dia += 1) {
      if (empleado.estadoDelDia(dia).esAsignacionOperativa()) {
        consecutivos += 1;

        if (consecutivos > 6) {
          return [
            {
              empleado: empleado.nombre,
              tipo: 'DIAS_CONSECUTIVOS',
              diasConsecutivos: consecutivos,
            },
          ];
        }
      } else {
        consecutivos = 0;
      }
    }

    return [];
  }
}
