// src/domain/Calendario.ts

import { UnidadOperativa } from './UnidadOperativa.js';

export class Calendario {
  public nombre: string;
  public unidadesOperativas: UnidadOperativa[] = [];

  constructor(nombre: string) {
    this.nombre = nombre;
  }

  agregarUnidadOperativa(unidad: UnidadOperativa): void {
    this.unidadesOperativas.push(unidad);
  }

  // Método que TS te pide: buscarUnidadOperativa
  buscarUnidadOperativa(nombreEstacion: string): UnidadOperativa | undefined {
    return this.unidadesOperativas.find(
      (u) => u.nombre.toUpperCase() === nombreEstacion.toUpperCase(),
    );
  }
}