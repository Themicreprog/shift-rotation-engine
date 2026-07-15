import { Calendario } from '../Calendario.js';

/**
 * Resultado de ejecutar el motor de rotación.
 *
 * En Fase 5.1:
 * - El calendario es todavía el mismo calendario recibido.
 * - No se generan cambios.
 * - No se generan advertencias.
 * - No se generan conflictos.
 *
 * En una fase posterior, calendario representará
 * la propuesta del siguiente mes.
 */
export class RotationResult {
  public constructor(
    public readonly calendario: Calendario,
    public readonly cambios: readonly string[] = [],
    public readonly advertencias: readonly string[] = [],
    public readonly conflictos: readonly string[] = [],
  ) {}
}