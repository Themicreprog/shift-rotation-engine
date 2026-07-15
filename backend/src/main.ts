import { Calendario } from './domain/Calendario.js';
import { Empleado } from './domain/Empleado.js';
import { EstadoTurno } from './domain/EstadoTurno.js';
import { UnidadOperativa } from './domain/UnidadOperativa.js';

function main(): void {
  const estados = [
    EstadoTurno.create('A'),
    EstadoTurno.create('B'),
    EstadoTurno.create('LIBRE'),
  ];

  const empleado = Empleado.create({
    nombre: 'Carlos',
    estadosPorDia: estados,
  });

  const unidad = UnidadOperativa.create({
    nombre: 'Cacao',
    empleados: [empleado],
  });

  const calendario = new Calendario('Demo');
  calendario.agregarUnidadOperativa(unidad);

  console.log(`Calendario: ${calendario.nombre}`);

  for (const unidadOperativa of calendario.unidadesOperativas) {
    console.log(`Unidad Operativa: ${unidadOperativa.nombre}`);
    console.log(`Empleados: ${unidadOperativa.cantidadEmpleados()}`);
  }
}

main();