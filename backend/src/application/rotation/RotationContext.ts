import { Calendario } from '../../domain/Calendario.js';

/**
 * Entrada para el proceso de generar la rotación del siguiente mes.
 *
 * En esta fase solo contiene el calendario de origen.
 * Más adelante puede contener período destino, feriados
 * y configuraciones de negocio, cuando sean necesarios.
 */
export class RotationContext {
  public constructor(
    public readonly calendarioOrigen: Calendario,
  ) {}
}