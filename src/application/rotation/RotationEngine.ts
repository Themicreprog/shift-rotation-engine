import { RotationPolicy } from '../../domain/rotation/RotationPolicy.js';
import { RotationResult } from '../../domain/rotation/RotationResult.js';
import { RotationContext } from './RotationContext.js';

/**
 * Motor principal de generación de rotación.
 *
 * Fase 5.1:
 * - No calcula ninguna rotación.
 * - No modifica el calendario recibido.
 * - No crea un calendario para el siguiente mes.
 * - No aplica vacaciones, cobertura ni validaciones.
 *
 * Solamente establece el punto de entrada arquitectónico
 * que utilizará el algoritmo en las fases posteriores.
 */
export class RotationEngine {
  public constructor(
    private readonly rotationPolicy: RotationPolicy,
  ) {}

  public execute(context: RotationContext): RotationResult {
    /*
     * TODO — Fases futuras:
     *
     * 1. Validar precondiciones.
     * 2. Crear calendario del período destino.
     * 3. Aplicar continuidad de rotación.
     * 4. Aplicar vacaciones e incapacidades.
     * 5. Garantizar cobertura.
     * 6. Usar comodines y bomberos si corresponde.
     * 7. Validar resultado y registrar cambios/conflictos.
     */

    void this.rotationPolicy;

    return new RotationResult(context.calendarioOrigen);
  }
}