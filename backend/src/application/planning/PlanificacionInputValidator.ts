import { SolicitudPlanificacion } from './SolicitudPlanificacion.js';
import { UnidadOperativa } from '../../domain/UnidadOperativa.js';
import { ValidacionPlanificacion } from '../../domain/planning/ValidacionPlanificacion.js';

const UBICACION_EMPLEADOS_FIJOS = new Map<
  string,
  { estacion: string; unidad: string }
>([
  ['NATANAEL', { estacion: 'CACAO', unidad: 'CACAO CAJA' }],
  ['RONY', { estacion: 'CACAO', unidad: 'CACAO CAJA' }],
  ['NORLAN', { estacion: 'TRUCK STOP', unidad: 'TRUCK STOP CAJA' }],
  ['DERLIN', { estacion: 'TRUCK STOP', unidad: 'TRUCK STOP CAJA' }],
]);

const UBICACION_EMPLEADOS_FLEXIBLES = new Map<string, string>([
  ['EDWIN', 'CACAO'],
  ['JEFERSON', 'TRUCK STOP'],
]);

const PAREJAS_FLEXIBLES = [
  { empleado: 'Edwin', pista: 'CACAO PISTA', caja: 'CACAO CAJA' },
  {
    empleado: 'Jeferson',
    pista: 'TRUCK STOP PISTA',
    caja: 'TRUCK STOP CAJA',
  },
] as const;

export class PlanificacionInputValidator {
  public validate(solicitud: SolicitudPlanificacion): ValidacionPlanificacion {
    const errores: string[] = [];

    errores.push(...this.validarContinuidad(solicitud));

    if (solicitud.calendarioOrigen.unidadesOperativas.length === 0) {
      errores.push('El calendario origen debe contener al menos una unidad operativa.');
    }

    const unidadesCalendario = solicitud.calendarioOrigen.unidadesOperativas.map((unidad) =>
      unidad.nombre.toUpperCase(),
    );

    const unidadesFueraDeCalendario = solicitud.alcanceOperativo.unidadesOperativas.filter(
      (unidad) => !unidadesCalendario.includes(unidad.toUpperCase()),
    );

    if (unidadesFueraDeCalendario.length > 0) {
      errores.push(
        `El alcance operativo contiene unidades inexistentes en el calendario origen: ${unidadesFueraDeCalendario.join(', ')}.`,
      );
    }

    const unidadesEnAlcance = solicitud.calendarioOrigen.unidadesOperativas
      .filter((unidad) =>
        solicitud.alcanceOperativo.unidadesOperativas.some(
          (nombre) => nombre.toUpperCase() === unidad.nombre.toUpperCase(),
        ),
      );

    errores.push(...this.validarUbicacionEmpleadosFijos(unidadesEnAlcance));
    errores.push(...this.validarUbicacionFlexibles(unidadesEnAlcance));
    errores.push(...this.validarAlcanceFlexibles(solicitud));

    const unidadesPorEmpleado = new Map<string, string[]>();
    const unidadesEnAlcancePorNombre = new Map(
      unidadesEnAlcance.map((unidad) => [unidad.nombre.toUpperCase(), unidad]),
    );

    for (const unidad of unidadesEnAlcance) {
      for (const empleado of unidad.empleados) {
        const nombreNormalizado = empleado.nombre.toUpperCase();
        const unidades = unidadesPorEmpleado.get(nombreNormalizado) ?? [];
        const unidadYaRegistrada = unidades.some(
          (nombreUnidad) => nombreUnidad.toUpperCase() === unidad.nombre.toUpperCase(),
        );

        if (!unidadYaRegistrada) {
          unidadesPorEmpleado.set(nombreNormalizado, [...unidades, unidad.nombre]);
        }
      }
    }

    const eventos = solicitud.eventos.listar();
    const empleadosFueraDeAlcance = new Map<string, string>();
    const empleadosAmbiguos = new Map<string, string>();
    const objetivosConUnidadInvalidos = new Set<string>();

    for (const evento of eventos) {
      const nombreEmpleadoNormalizado = evento.empleado.toUpperCase();

      if (evento.unidadOperativa === null) {
        const unidadesEmpleado = unidadesPorEmpleado.get(nombreEmpleadoNormalizado) ?? [];
        const estacionesEmpleado = new Set(
          unidadesEmpleado.map((unidad) => this.normalizarEstacion(unidad)),
        );

        if (unidadesEmpleado.length === 0) {
          empleadosFueraDeAlcance.set(nombreEmpleadoNormalizado, evento.empleado);
        } else if (estacionesEmpleado.size > 1) {
          empleadosAmbiguos.set(nombreEmpleadoNormalizado, evento.empleado);
        }

        continue;
      }

      const unidadNormalizada = evento.unidadOperativa.toUpperCase();
      const unidadEvento = unidadesEnAlcancePorNombre.get(unidadNormalizada);
      const claveObjetivo = `${nombreEmpleadoNormalizado}|${unidadNormalizada}`;

      if (!unidadEvento) {
        const mensaje =
          `El evento de ${evento.empleado} referencia la unidad operativa ` +
          `${evento.unidadOperativa}, que no está incluida en el alcance operativo.`;

        if (!objetivosConUnidadInvalidos.has(mensaje)) {
          errores.push(mensaje);
          objetivosConUnidadInvalidos.add(mensaje);
        }

        continue;
      }

      const empleadoExisteEnUnidad = unidadEvento.empleados.some(
        (empleado) => empleado.nombre.toUpperCase() === nombreEmpleadoNormalizado,
      );

      if (!empleadoExisteEnUnidad && !objetivosConUnidadInvalidos.has(claveObjetivo)) {
        errores.push(
          `El empleado ${evento.empleado} del evento no existe en la unidad operativa ${unidadEvento.nombre} incluida en el alcance.`,
        );
        objetivosConUnidadInvalidos.add(claveObjetivo);
      }
    }

    if (empleadosFueraDeAlcance.size > 0) {
      errores.push(
        `Hay eventos para empleados fuera del alcance operativo: ${[...empleadosFueraDeAlcance.values()].join(', ')}.`,
      );
    }

    for (const [nombreNormalizado, empleado] of empleadosAmbiguos) {
      const unidades = unidadesPorEmpleado.get(nombreNormalizado) ?? [];
      errores.push(
        `El evento de ${empleado} es ambiguo porque el empleado existe en varias unidades del alcance operativo: ${unidades.join(', ')}.`,
      );
    }

    for (const evento of eventos) {
      if (
        this.estaTotalmenteFueraDelPeriodo(
          evento.fechaInicio,
          evento.fechaFin,
          solicitud.periodoDestino.fechaInicio,
          solicitud.periodoDestino.fechaFin,
        )
      ) {
        errores.push(
          `El evento ${evento.tipo} de ${evento.empleado} (${this.formatearFecha(evento.fechaInicio)} a ${this.formatearFecha(evento.fechaFin)}) está totalmente fuera del período de planificación ${this.formatearFecha(solicitud.periodoDestino.fechaInicio)} a ${this.formatearFecha(solicitud.periodoDestino.fechaFin)}.`,
        );
      }
    }

    for (const solapamiento of solicitud.eventos.solapamientos()) {
      errores.push(
        `Los eventos de ${solapamiento.primero.empleado} se solapan entre ${this.formatearFecha(solapamiento.primero.fechaInicio)} y ${this.formatearFecha(solapamiento.segundo.fechaFin)}.`,
      );
    }

    for (const comodin of solicitud.comodines.listar()) {
      const unidad = solicitud.calendarioOrigen.buscarUnidadOperativa(
        comodin.unidadOperativa,
      );
      const unidadIncluida = solicitud.alcanceOperativo.unidadesOperativas.some(
        (nombre) => nombre.toUpperCase() === comodin.unidadOperativa.toUpperCase(),
      );
      const empleadoExiste = unidad?.empleados.some(
        (empleado) => empleado.nombre.toUpperCase() === comodin.empleado.toUpperCase(),
      );

      if (!unidadIncluida || !empleadoExiste) {
        errores.push(
          `El comodín ${comodin.empleado} no existe dentro de la unidad operativa ${comodin.unidadOperativa} incluida en el alcance.`,
        );
      }
    }

    if (errores.length > 0) {
      return ValidacionPlanificacion.failure(errores);
    }

    return ValidacionPlanificacion.success();
  }

  private validarContinuidad(solicitud: SolicitudPlanificacion): string[] {
    const periodoOrigen = solicitud.calendarioOrigen.obtenerPeriodoOrigen();

    if (periodoOrigen === null) {
      return [];
    }

    const errores: string[] = [];
    const periodoEsperado =
      periodoOrigen.mes === 12
        ? { mes: 1, anio: periodoOrigen.anio + 1 }
        : { mes: periodoOrigen.mes + 1, anio: periodoOrigen.anio };
    const mesDestino = solicitud.periodoDestino.fechaInicio.getUTCMonth() + 1;
    const anioDestino =
      solicitud.periodoDestino.fechaInicio.getUTCFullYear();

    if (
      mesDestino !== periodoEsperado.mes ||
      anioDestino !== periodoEsperado.anio
    ) {
      errores.push(
        `El calendario de origen corresponde a ${periodoOrigen.mes}/${periodoOrigen.anio}; el período destino debe ser ${periodoEsperado.mes}/${periodoEsperado.anio} para conservar la continuidad.`,
      );
    }

    const inicioDestino = this.inicioDelDia(
      solicitud.periodoDestino.fechaInicio,
    );
    const finPrefijoHeredado = Math.min(
      this.inicioDelDia(periodoOrigen.fechaFin),
      this.inicioDelDia(solicitud.periodoDestino.fechaFin),
    );

    if (finPrefijoHeredado >= inicioDestino) {
      for (const evento of solicitud.eventos.listar()) {
        const eventoSeSolapa =
          this.inicioDelDia(evento.fechaInicio) <= finPrefijoHeredado &&
          this.inicioDelDia(evento.fechaFin) >= inicioDestino;

        if (eventoSeSolapa) {
          errores.push(
            `El evento ${evento.tipo} de ${evento.empleado} coincide con días ya confirmados hasta ${new Date(finPrefijoHeredado).toISOString().slice(0, 10)}; debe comenzar después de la continuidad importada.`,
          );
        }
      }
    }

    const totalDiasEsperado =
      Math.round(
        (periodoOrigen.fechaFin.getTime() -
          periodoOrigen.fechaInicio.getTime()) /
          (24 * 60 * 60 * 1000),
      ) + 1;

    for (const unidad of solicitud.calendarioOrigen.unidadesOperativas) {
      for (const empleado of unidad.empleados) {
        if (empleado.totalDias() !== totalDiasEsperado) {
          errores.push(
            `${empleado.nombre} en ${unidad.nombre} contiene ${empleado.totalDias()} días, pero el rango importado requiere ${totalDiasEsperado}.`,
          );
        }
      }
    }

    return errores;
  }

  private validarUbicacionFlexibles(
    unidades: ReadonlyArray<UnidadOperativa>,
  ): string[] {
    const errores: string[] = [];

    for (const unidad of unidades) {
      const estacion = this.normalizarEstacion(unidad.nombre);

      for (const empleado of unidad.empleados) {
        const estacionPermitida = UBICACION_EMPLEADOS_FLEXIBLES.get(
          empleado.nombre.trim().toUpperCase(),
        );

        if (
          estacionPermitida !== undefined &&
          estacion !== estacionPermitida
        ) {
          errores.push(
            `${empleado.nombre} es flexible de ${estacionPermitida} y no puede planificarse en ${unidad.nombre}.`,
          );
        }
      }
    }

    return errores;
  }

  private validarAlcanceFlexibles(
    solicitud: SolicitudPlanificacion,
  ): string[] {
    const alcance = new Set(
      solicitud.alcanceOperativo.unidadesOperativas.map((unidad) =>
        unidad.trim().toUpperCase(),
      ),
    );
    const errores: string[] = [];

    for (const pareja of PAREJAS_FLEXIBLES) {
      if (
        !alcance.has(pareja.caja) ||
        alcance.has(pareja.pista)
      ) {
        continue;
      }

      const existeFlexible = solicitud.calendarioOrigen.unidadesOperativas.some(
        (unidad) =>
          this.normalizarEstacion(unidad.nombre) ===
            this.normalizarEstacion(pareja.caja) &&
          unidad.empleados.some(
            (empleado) =>
              empleado.nombre.trim().toUpperCase() ===
              pareja.empleado.toUpperCase(),
          ),
      );

      if (existeFlexible) {
        errores.push(
          `${pareja.caja} debe planificarse junto con ${pareja.pista} para usar a ${pareja.empleado} sin asignarlo simultáneamente en pista y caja.`,
        );
      }
    }

    return errores;
  }

  private formatearFecha(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }

  private validarUbicacionEmpleadosFijos(
    unidades: ReadonlyArray<UnidadOperativa>,
  ): string[] {
    const errores: string[] = [];

    for (const unidad of unidades) {
      const estacion = this.normalizarEstacion(unidad.nombre);
      const tieneRolExplicito = /\b(?:PISTA|CAJA|CAJEROS?)\b/i.test(
        unidad.nombre,
      );
      const esCaja = /\b(?:CAJA|CAJEROS?)\b/i.test(unidad.nombre);

      for (const empleado of unidad.empleados) {
        const ubicacion = UBICACION_EMPLEADOS_FIJOS.get(
          empleado.nombre.trim().toUpperCase(),
        );

        if (
          ubicacion &&
          (estacion !== ubicacion.estacion || (tieneRolExplicito && !esCaja))
        ) {
          errores.push(
            `${empleado.nombre} es cajero fijo de ${ubicacion.unidad} y no puede planificarse en ${unidad.nombre}.`,
          );
        }
      }
    }

    return errores;
  }

  private normalizarEstacion(unidadOperativa: string): string {
    return unidadOperativa
      .trim()
      .toUpperCase()
      .replace(/^E\s*\/\s*S\s+/, '')
      .replace(/\s+ROD\s*$/, '')
      .replace(/\s+E\s*\/\s*S\s*$/, '')
      .replace(/\s+(?:PISTA|CAJA|CAJEROS)\s*$/, '')
      .trim();
  }

  private estaTotalmenteFueraDelPeriodo(
    fechaInicioEvento: Date,
    fechaFinEvento: Date,
    fechaInicioPeriodo: Date,
    fechaFinPeriodo: Date,
  ): boolean {
    const inicioEvento = this.inicioDelDia(fechaInicioEvento);
    const finEvento = this.inicioDelDia(fechaFinEvento);
    const inicioPeriodo = this.inicioDelDia(fechaInicioPeriodo);
    const finPeriodo = this.inicioDelDia(fechaFinPeriodo);

    return finEvento < inicioPeriodo || inicioEvento > finPeriodo;
  }

  private inicioDelDia(fecha: Date): number {
    return Date.UTC(
      fecha.getUTCFullYear(),
      fecha.getUTCMonth(),
      fecha.getUTCDate(),
    );
  }
}
