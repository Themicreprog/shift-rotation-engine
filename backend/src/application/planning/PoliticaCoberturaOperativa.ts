export interface RequerimientoCoberturaTurnos {
  readonly turnoA: number;
  readonly turnoB: number;
}

/**
 * Reglas operativas de cobertura y descanso confirmadas por el negocio.
 *
 * Pista:
 * - lunes a jueves: mínimo 3 por turno;
 * - viernes y sábado: mínimo 3 en A y 4 en B;
 * - domingo: mínimo 2 por turno.
 *
 * Caja mantiene un cajero por turno todos los días.
 */
export class PoliticaCoberturaOperativa {
  public requerimiento(
    nombreUnidadOperativa: string,
    fecha: Date,
  ): RequerimientoCoberturaTurnos {
    if (this.esUnidadCaja(nombreUnidadOperativa)) {
      return { turnoA: 1, turnoB: 1 };
    }

    const diaSemana = fecha.getUTCDay();

    if (diaSemana === 0) {
      return { turnoA: 2, turnoB: 2 };
    }

    if (diaSemana === 5 || diaSemana === 6) {
      return { turnoA: 3, turnoB: 4 };
    }

    return { turnoA: 3, turnoB: 3 };
  }

  public esDiaDescansoPermitido(fecha: Date): boolean {
    const diaSemana = fecha.getUTCDay();

    return diaSemana === 0 || (diaSemana >= 1 && diaSemana <= 4);
  }

  public esMartes(fecha: Date): boolean {
    return fecha.getUTCDay() === 2;
  }

  public esViernesOSabado(fecha: Date): boolean {
    const diaSemana = fecha.getUTCDay();

    return diaSemana === 5 || diaSemana === 6;
  }

  public esUnidadCaja(nombreUnidadOperativa: string): boolean {
    const nombre = nombreUnidadOperativa.trim().toUpperCase();

    return nombre.includes('CAJA') || nombre.includes('CAJER');
  }
}
