/**
 * Contrato de dominio para una política de rotación.
 *
 * En esta fase aún no se ha aprobado ni implementado
 * el algoritmo que define cómo se continúan los turnos.
 *
 * El contrato existe desde ahora para que RotationEngine
 * pueda depender de una política de dominio y no de una
 * regla concreta.
 */
export interface RotationPolicy {}