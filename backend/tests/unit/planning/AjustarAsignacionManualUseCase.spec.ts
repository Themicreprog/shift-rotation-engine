import { describe, expect, it } from 'vitest';

import { AjustarAsignacionManualUseCase } from '../../../src/application/planning/AjustarAsignacionManualUseCase.js';
import { convertirAjustesManualesAReemplazos } from '../../../src/application/planning/convertirAjustesManualesAReemplazos.js';
import { Calendario } from '../../../src/domain/Calendario.js';
import { Empleado } from '../../../src/domain/Empleado.js';
import { EstadoTurno } from '../../../src/domain/EstadoTurno.js';
import { UnidadOperativa } from '../../../src/domain/UnidadOperativa.js';

function crearEmpleado(nombre: string, estados: ReadonlyArray<string>): Empleado {
  return Empleado.create({
    nombre,
    estadosPorDia: estados.map((estado) => EstadoTurno.create(estado)),
  });
}

function crearUnidad(nombre: string, empleados: ReadonlyArray<Empleado>): UnidadOperativa {
  return UnidadOperativa.create({ nombre, empleados });
}

function crearCalendario(...unidades: ReadonlyArray<UnidadOperativa>): Calendario {
  const calendario = new Calendario('Planificacion editable');

  for (const unidad of unidades) {
    calendario.agregarUnidadOperativa(unidad);
  }

  return calendario;
}

function estadoDe(
  calendario: Calendario,
  unidad: string,
  empleado: string,
  dia: number,
): string | undefined {
  return calendario
    .buscarUnidadOperativa(unidad)
    ?.empleados.find((candidato) => candidato.nombre.toUpperCase() === empleado.toUpperCase())
    ?.estadoDelDia(dia).valor;
}

describe('AjustarAsignacionManualUseCase', () => {
  const useCase = new AjustarAsignacionManualUseCase();

  it('sustituye TURNO por LIBRE sin mutar el calendario y puede deshacerlo', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [
        crearEmpleado('Mario', ['LIBRE', 'TURNO A', 'LIBRE']),
        crearEmpleado('Jose', ['LIBRE', 'LIBRE', 'LIBRE']),
      ]),
    );

    const aplicado = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: ' cacao pista ',
      dia: 2,
      titular: 'Mario',
      reemplazo: 'Jose',
    });

    expect(aplicado.esExitoso).toBe(true);
    expect(aplicado.calendario).not.toBe(calendario);
    expect(estadoDe(calendario, 'CACAO PISTA', 'Mario', 2)).toBe('TURNO A');
    expect(estadoDe(calendario, 'CACAO PISTA', 'Jose', 2)).toBe('LIBRE');
    expect(estadoDe(aplicado.calendario, 'CACAO PISTA', 'Mario', 2)).toBe('LIBRE');
    expect(estadoDe(aplicado.calendario, 'CACAO PISTA', 'Jose', 2)).toBe('TURNO A');
    expect(aplicado.ajuste).toMatchObject({
      tipo: 'SUSTITUCION',
      unidadOperativa: 'CACAO PISTA',
      dia: 2,
      turno: 'TURNO A',
      titularOriginal: 'Mario',
      titular: 'Mario',
      reemplazo: 'Jose',
      estadoTitularAnterior: 'TURNO A',
      estadoReemplazoAnterior: 'LIBRE',
      estadoTitularPosterior: 'LIBRE',
      estadoReemplazoPosterior: 'TURNO A',
      estado: 'APLICADO',
    });
    expect(aplicado.ajuste?.movimientos).toEqual([
      {
        turno: 'TURNO A',
        titularOriginal: 'Mario',
        titular: 'Mario',
        reemplazo: 'Jose',
      },
    ]);

    const deshecho = useCase.deshacerUltimo({
      calendario: aplicado.calendario,
      historial: aplicado.historial,
    });

    expect(deshecho.esExitoso).toBe(true);
    expect(estadoDe(deshecho.calendario, 'CACAO PISTA', 'Mario', 2)).toBe('TURNO A');
    expect(estadoDe(deshecho.calendario, 'CACAO PISTA', 'Jose', 2)).toBe('LIBRE');
    expect(deshecho.historial).toHaveLength(1);
    expect(deshecho.historial[0]?.estado).toBe('DESHECHO');
  });

  it('intercambia TURNO A y TURNO B conservando las dos asignaciones originales', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [
        crearEmpleado('Mario', ['TURNO A']),
        crearEmpleado('Jose', ['TURNO B']),
      ]),
    );

    const resultado = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 1,
      titular: 'Mario',
      reemplazo: 'Jose',
    });

    expect(resultado.esExitoso).toBe(true);
    expect(estadoDe(resultado.calendario, 'CACAO PISTA', 'Mario', 1)).toBe('TURNO B');
    expect(estadoDe(resultado.calendario, 'CACAO PISTA', 'Jose', 1)).toBe('TURNO A');
    expect(resultado.ajuste?.tipo).toBe('INTERCAMBIO');
    expect(resultado.ajuste?.movimientos).toEqual([
      {
        turno: 'TURNO A',
        titularOriginal: 'Mario',
        titular: 'Mario',
        reemplazo: 'Jose',
      },
      {
        turno: 'TURNO B',
        titularOriginal: 'Jose',
        titular: 'Jose',
        reemplazo: 'Mario',
      },
    ]);
  });

  it('conserva el titular original en cadenas y deshace en orden LIFO', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [
        crearEmpleado('Mario', ['TURNO A']),
        crearEmpleado('Jose', ['LIBRE']),
        crearEmpleado('Rene', ['LIBRE']),
      ]),
    );
    const primero = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 1,
      titular: 'Mario',
      reemplazo: 'Jose',
    });
    const segundo = useCase.aplicar({
      calendario: primero.calendario,
      historial: primero.historial,
      unidadOperativa: 'CACAO PISTA',
      dia: 1,
      titular: 'Jose',
      reemplazo: 'Rene',
    });

    expect(segundo.esExitoso).toBe(true);
    expect(segundo.ajuste).toMatchObject({
      titularOriginal: 'Mario',
      titular: 'Jose',
      reemplazo: 'Rene',
    });
    expect(estadoDe(segundo.calendario, 'CACAO PISTA', 'Rene', 1)).toBe('TURNO A');
    expect(convertirAjustesManualesAReemplazos(segundo.historial)).toEqual([
      expect.objectContaining({
        unidadOperativa: 'CACAO PISTA',
        dia: 1,
        turno: 'TURNO A',
        empleadoTitular: 'Mario',
        empleadoReemplazo: 'Rene',
        tipoCobertura: 'MANUAL',
        motivo: 'AJUSTE_MANUAL',
      }),
    ]);

    const deshacerSegundo = useCase.deshacerUltimo({
      calendario: segundo.calendario,
      historial: segundo.historial,
    });

    expect(estadoDe(deshacerSegundo.calendario, 'CACAO PISTA', 'Jose', 1)).toBe('TURNO A');
    expect(estadoDe(deshacerSegundo.calendario, 'CACAO PISTA', 'Rene', 1)).toBe('LIBRE');
    expect(deshacerSegundo.historial.map(({ estado }) => estado)).toEqual(['APLICADO', 'DESHECHO']);
    expect(convertirAjustesManualesAReemplazos(deshacerSegundo.historial)).toEqual([
      expect.objectContaining({
        empleadoTitular: 'Mario',
        empleadoReemplazo: 'Jose',
      }),
    ]);

    const deshacerPrimero = useCase.deshacerUltimo({
      calendario: deshacerSegundo.calendario,
      historial: deshacerSegundo.historial,
    });

    expect(estadoDe(deshacerPrimero.calendario, 'CACAO PISTA', 'Mario', 1)).toBe('TURNO A');
    expect(estadoDe(deshacerPrimero.calendario, 'CACAO PISTA', 'Jose', 1)).toBe('LIBRE');
    expect(deshacerPrimero.historial.map(({ estado }) => estado)).toEqual(['DESHECHO', 'DESHECHO']);
  });

  it('conserva tambien el titular inverso despues de un intercambio A-B', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [
        crearEmpleado('Mario', ['TURNO A']),
        crearEmpleado('Jose', ['TURNO B']),
        crearEmpleado('Rene', ['LIBRE']),
      ]),
    );
    const intercambio = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 1,
      titular: 'Mario',
      reemplazo: 'Jose',
    });
    const cadenaInversa = useCase.aplicar({
      calendario: intercambio.calendario,
      historial: intercambio.historial,
      unidadOperativa: 'CACAO PISTA',
      dia: 1,
      titular: 'Mario',
      reemplazo: 'Rene',
    });

    expect(cadenaInversa.esExitoso).toBe(true);
    expect(cadenaInversa.ajuste).toMatchObject({
      turno: 'TURNO B',
      titularOriginal: 'Jose',
      titular: 'Mario',
      reemplazo: 'Rene',
    });
  });

  it.each(['VACACIONES', 'FERIADO', 'OTRO'])(
    'no permite usar como reemplazo a una persona con %s',
    (estadoNoDisponible) => {
      const calendario = crearCalendario(
        crearUnidad('CACAO CAJA', [
          crearEmpleado('Natanael', ['TURNO A']),
          crearEmpleado('Rony', [estadoNoDisponible]),
        ]),
      );

      const resultado = useCase.aplicar({
        calendario,
        historial: [],
        unidadOperativa: 'CACAO CAJA',
        dia: 1,
        titular: 'Natanael',
        reemplazo: 'Rony',
      });

      expect(resultado.esExitoso).toBe(false);
      expect(resultado.conflictos[0]).toContain(`su estado es ${estadoNoDisponible}`);
      expect(resultado.calendario).toBe(calendario);
    },
  );

  it('bloquea la doble asignacion global de un flexible entre PISTA y CAJA', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [crearEmpleado('Edwin', ['TURNO A'])]),
      crearUnidad('CACAO CAJA', [
        crearEmpleado('Rony', ['TURNO B']),
        crearEmpleado('Edwin', ['LIBRE']),
      ]),
    );

    const resultado = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO CAJA',
      dia: 1,
      titular: 'Rony',
      reemplazo: 'Edwin',
    });

    expect(resultado.esExitoso).toBe(false);
    expect(resultado.conflictos).toContainEqual(
      expect.stringContaining('tiene TURNO A en CACAO PISTA'),
    );
    expect(estadoDe(calendario, 'CACAO CAJA', 'Rony', 1)).toBe('TURNO B');
    expect(estadoDe(calendario, 'CACAO CAJA', 'Edwin', 1)).toBe('LIBRE');
  });

  it('detecta la transicion B-A de un flexible aunque ocurra entre PISTA y CAJA', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [crearEmpleado('Edwin', ['TURNO B', 'LIBRE'])]),
      crearUnidad('CACAO CAJA', [
        crearEmpleado('Rony', ['LIBRE', 'TURNO A']),
        crearEmpleado('Edwin', ['LIBRE', 'LIBRE']),
      ]),
    );

    const resultado = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO CAJA',
      dia: 2,
      titular: 'Rony',
      reemplazo: 'Edwin',
    });

    expect(resultado.esExitoso).toBe(false);
    expect(resultado.conflictos).toContainEqual(
      expect.stringContaining(
        'Edwin tendria una transicion insegura de TURNO B el dia 1 a TURNO A el dia 2',
      ),
    );
  });

  it('calcula el descanso global del flexible entre PISTA y CAJA', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [
        crearEmpleado('Edwin', [
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'LIBRE',
        ]),
      ]),
      crearUnidad('CACAO CAJA', [
        crearEmpleado('Rony', ['LIBRE', 'LIBRE', 'LIBRE', 'LIBRE', 'LIBRE', 'LIBRE', 'TURNO A']),
        crearEmpleado(
          'Edwin',
          Array.from({ length: 7 }, () => 'LIBRE'),
        ),
      ]),
    );

    const resultado = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO CAJA',
      dia: 7,
      titular: 'Rony',
      reemplazo: 'Edwin',
    });

    expect(resultado.esExitoso).toBe(false);
    expect(resultado.conflictos).toContainEqual(
      expect.stringContaining('Edwin perderia su dia LIBRE'),
    );
    expect(resultado.conflictos).toContainEqual(
      expect.stringContaining('Edwin superaria seis dias'),
    );
  });

  it.each([
    ['Natanael', 'CACAO PISTA'],
    ['Rony', 'CACAO PISTA'],
    ['Norlan', 'TRUCK STOP PISTA'],
    ['Derlin', 'TRUCK STOP PISTA'],
  ])(
    'impide que el cajero fijo %s participe fuera de su unidad de CAJA',
    (cajeroFijo, unidadIncorrecta) => {
      const calendario = crearCalendario(
        crearUnidad(unidadIncorrecta, [
          crearEmpleado('Titular temporal', ['TURNO A']),
          crearEmpleado(cajeroFijo, ['LIBRE']),
        ]),
      );

      const resultado = useCase.aplicar({
        calendario,
        historial: [],
        unidadOperativa: unidadIncorrecta,
        dia: 1,
        titular: 'Titular temporal',
        reemplazo: cajeroFijo,
      });

      expect(resultado.esExitoso).toBe(false);
      expect(resultado.conflictos).toContainEqual(
        expect.stringContaining(`${cajeroFijo} es cajero fijo`),
      );
    },
  );

  it('rechaza una sustitucion que elimina el unico descanso semanal', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [
        crearEmpleado('Mario', [
          'LIBRE',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
        ]),
        crearEmpleado('Jose', [
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'TURNO A',
          'LIBRE',
        ]),
      ]),
    );

    const resultado = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 7,
      titular: 'Mario',
      reemplazo: 'Jose',
    });

    expect(resultado.esExitoso).toBe(false);
    expect(resultado.conflictos).toContainEqual(expect.stringContaining('perderia su dia LIBRE'));
    expect(resultado.conflictos).toContainEqual(expect.stringContaining('superaria seis dias'));
  });

  it('bloquea una transicion insegura de TURNO B a TURNO A', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [
        crearEmpleado('Mario', ['LIBRE', 'TURNO A', 'LIBRE']),
        crearEmpleado('Jose', ['TURNO B', 'LIBRE', 'LIBRE']),
      ]),
    );

    const resultado = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 2,
      titular: 'Mario',
      reemplazo: 'Jose',
    });

    expect(resultado.esExitoso).toBe(false);
    expect(resultado.conflictos).toContainEqual(
      expect.stringContaining('transicion insegura de TURNO B el dia 1 a TURNO A el dia 2'),
    );
  });

  it('valida que ambos empleados y el dia pertenezcan a la misma unidad', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO PISTA', [
        crearEmpleado('Mario', ['TURNO A']),
        crearEmpleado('Jose', ['LIBRE']),
      ]),
      crearUnidad('TRUCK STOP PISTA', [crearEmpleado('Carlos', ['LIBRE'])]),
    );

    const otraUnidad = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 1,
      titular: 'Mario',
      reemplazo: 'Carlos',
    });
    const diaInexistente = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO PISTA',
      dia: 2,
      titular: 'Mario',
      reemplazo: 'Jose',
    });

    expect(otraUnidad.esExitoso).toBe(false);
    expect(otraUnidad.conflictos).toContainEqual(
      expect.stringContaining('no pertenece a CACAO PISTA'),
    );
    expect(diaInexistente.esExitoso).toBe(false);
    expect(diaInexistente.conflictos).toContainEqual(
      expect.stringContaining('El dia 2 no existe para ambos empleados'),
    );
  });

  it('no deshace si la asignacion fue alterada despues del ajuste', () => {
    const calendario = crearCalendario(
      crearUnidad('CACAO CAJA', [
        crearEmpleado('Natanael', ['TURNO A']),
        crearEmpleado('Rony', ['LIBRE']),
      ]),
    );
    const aplicado = useCase.aplicar({
      calendario,
      historial: [],
      unidadOperativa: 'CACAO CAJA',
      dia: 1,
      titular: 'Natanael',
      reemplazo: 'Rony',
    });
    const calendarioAlterado = crearCalendario(
      crearUnidad('CACAO CAJA', [
        crearEmpleado('Natanael', ['LIBRE']),
        crearEmpleado('Rony', ['TURNO B']),
      ]),
    );

    const resultado = useCase.deshacerUltimo({
      calendario: calendarioAlterado,
      historial: aplicado.historial,
    });

    expect(resultado.esExitoso).toBe(false);
    expect(resultado.conflictos).toContainEqual(
      expect.stringContaining('fue modificada despues del ajuste'),
    );
    expect(resultado.historial[0]?.estado).toBe('APLICADO');
    expect(estadoDe(calendarioAlterado, 'CACAO CAJA', 'Rony', 1)).toBe('TURNO B');
  });
});
