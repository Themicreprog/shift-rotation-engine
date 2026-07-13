# Domain

Dominio mínimo aprobado en Fase 2, implementado en Fase 3.1.

## Conceptos implementados
- `EstadoTurno`
- `Empleado`
- `UnidadOperativa`
- `Calendario`

## Criterio
Estructura plana, sin subcarpetas `entities` ni `value-objects`.
Solo cuatro conceptos, sin comportamiento divergente entre ellos que justifique separación.
No existen `Asignacion`, `RegistroMensual` ni entidades intermedias.
No hay IDs artificiales ni relaciones por ID: las referencias son directas por objeto.
