import {
  AjusteManualPlanificacion,
  MovimientoAjusteManualPlanificacion,
} from '../../domain/planning/AjusteManualPlanificacion.js';
import { ReemplazoPlanificacion } from '../../domain/planning/ReemplazoPlanificacion.js';

interface MovimientoVigente {
  readonly ajuste: AjusteManualPlanificacion;
  readonly movimiento: MovimientoAjusteManualPlanificacion;
}

/**
 * Proyecta el historial reversible a los reemplazos manuales que siguen
 * visibles en el calendario. Los eslabones posteriores de una cadena
 * sustituyen a los anteriores sin borrar el titular original.
 */
export function convertirAjustesManualesAReemplazos(
  historial: ReadonlyArray<AjusteManualPlanificacion>,
): ReemplazoPlanificacion[] {
  const movimientosVigentes = new Map<string, MovimientoVigente>();

  for (const ajuste of historial) {
    if (!ajuste.estaAplicado()) {
      continue;
    }

    for (const movimiento of ajuste.movimientos) {
      const clave = [
        normalizar(ajuste.unidadOperativa),
        ajuste.dia,
        movimiento.turno,
        normalizar(movimiento.titularOriginal),
      ].join('|');

      movimientosVigentes.set(clave, { ajuste, movimiento });
    }
  }

  return [...movimientosVigentes.values()].map(({ ajuste, movimiento }) =>
    ReemplazoPlanificacion.create({
      unidadOperativa: ajuste.unidadOperativa,
      dia: ajuste.dia,
      turno: movimiento.turno,
      empleadoTitular: movimiento.titularOriginal,
      empleadoReemplazo: movimiento.reemplazo,
      tipoCobertura: 'MANUAL',
      motivo: 'AJUSTE_MANUAL',
    }),
  );
}

function normalizar(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ').toUpperCase();
}
