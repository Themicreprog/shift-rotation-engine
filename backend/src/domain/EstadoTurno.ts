export class EstadoTurno {
  private constructor(public readonly valor: string) {}

  public static create(valor: string): EstadoTurno {
    const normalizado = valor.trim().toUpperCase();

    if (normalizado.length === 0) {
      throw new Error('EstadoTurno no puede estar vacío.');
    }

    return new EstadoTurno(normalizado);
  }

  public equals(otro: EstadoTurno): boolean {
    return this.valor === otro.valor;
  }

  public esAsignacionOperativa(): boolean {
    return this.valor === 'TURNO A' || this.valor === 'TURNO B';
  }
}