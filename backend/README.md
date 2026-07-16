# FireSchedule Backend

Backend en TypeScript para importar calendarios de turnos desde Excel, generar
la planificación mensual con vacaciones, feriados y comodines, y descargar el
resultado nuevamente como `.xlsx`.

## Requisitos

- Node.js 20 o superior
- npm 10 o superior

## Instalación y ejecución

```bash
npm install
npm run dev
```

El servidor queda disponible de forma predeterminada en
`http://127.0.0.1:3000`.

Para compilar y ejecutar la versión compilada:

```bash
npm run build
npm start
```

## Variables de entorno

- `PORT`: puerto HTTP. Predeterminado: `3000`.
- `HOST`: interfaz de red. Predeterminado: `127.0.0.1`.
- `FIRESCHEDULE_CORS_ORIGIN`: origen permitido para el frontend.
  Predeterminado: `http://localhost:5173`.
- `FIRESCHEDULE_MAX_BODY_BYTES`: límite del cuerpo JSON. Predeterminado: 25 MB.
- `FIRESCHEDULE_EXCEL_TEMPLATE`: ruta de la plantilla XLSX. Si se omite, se
  utiliza `assets/plantilla-turnos.xlsx`.

La ruta de la plantilla es configuración exclusiva del servidor y nunca se
recibe desde el cliente.

## API HTTP

Todas las rutas usan JSON salvo la respuesta binaria de exportación.

### Estado

`GET /api/health`

### Importar calendario

`POST /api/calendarios/importar`

```json
{
  "nombreArchivo": "turnos-julio.xlsx",
  "contenidoBase64": "UEsDB..."
}
```

Devuelve un calendario JSON normalizado. El archivo debe ser `.xlsx` y se
procesa mediante un temporal aleatorio que se elimina al terminar. La respuesta
incluye el período declarado, la última fecha segura encontrada, los días del
mes siguiente ya definidos y el período destino sugerido.

El lector admite el derrame semanal del Excel hacia el mes siguiente. Por
ejemplo, un calendario de julio que ya contiene el 1 y 2 de agosto conserva
esos dos días y la generación de agosto comienza el día 3. La misma regla se
aplica a cualquier mes, incluido diciembre hacia enero del año siguiente.

### Generar planificación

`POST /api/planificaciones/generar`

```json
{
  "calendarioOrigen": {
    "nombre": "Julio 2026",
    "unidadesOperativas": []
  },
  "mes": 8,
  "anio": 2026,
  "alcanceOperativo": ["CACAO C1", "CAJA CACAO"],
  "eventos": [
    {
      "empleado": "Mario",
      "tipo": "VACACIONES",
      "fechaInicio": "2026-08-03",
      "fechaFin": "2026-08-09",
      "unidadOperativa": "CACAO C1"
    }
  ],
  "comodines": [
    {
      "unidadOperativa": "CACAO C1",
      "empleado": "Celio"
    }
  ]
}
```

`alcanceOperativo`, `eventos` y `comodines` son opcionales. Cuando se omite el
alcance se planifican todas las unidades recibidas. El período siempre es el
mes calendario completo. Los conflictos de negocio responden con HTTP `422` y
conservan el mismo formato de resultado para que el frontend pueda mostrarlos.
La respuesta incluye `reemplazos`, una lista estructurada con unidad, día,
turno, titular, reemplazo, tipo de cobertura y motivo. Los días heredados del
Excel anterior quedan bloqueados: un evento que intente modificarlos produce
un conflicto.

Edwin en CACAO y Jeferson en TRUCK STOP solo pueden pasar de pista a caja para
cubrir el `DESCANSO` o las `VACACIONES` de un cajero fijo. No cubren feriados ni
faltantes genéricos, y pista/caja se coordinan para evitar una doble asignación.

### Ajustar una asignación manualmente

`POST /api/planificaciones/ajustar`

Para aplicar una sustitución o intercambio:

```json
{
  "accion": "APLICAR",
  "calendario": {
    "nombre": "PLANIFICACION-2026-08-COMPLETO",
    "unidadesOperativas": []
  },
  "historial": [],
  "unidadOperativa": "CACAO C1",
  "dia": 5,
  "titular": "Mario",
  "reemplazo": "Jose"
}
```

Para deshacer el último ajuste que continúa aplicado:

```json
{
  "accion": "DESHACER",
  "calendario": {
    "nombre": "PLANIFICACION-2026-08-COMPLETO",
    "unidadesOperativas": []
  },
  "historial": []
}
```

La operación es stateless: en cada llamada el frontend debe reenviar exactamente
el `calendario` y el `historial` recibidos en la respuesta anterior. La respuesta
contiene `calendario`, `historial`, `ajuste`, `conflictos` y `reemplazos`. Estos
últimos usan el mismo contrato que acepta la exportación, de modo que los cambios
manuales quedan resaltados y documentados en el Excel. Un ajuste válido responde
HTTP `200`; una violación de descanso, transición, unidad o disponibilidad
responde HTTP `422` sin modificar el calendario.

### Exportar planificación

`POST /api/planificaciones/exportar`

```json
{
  "calendario": {
    "nombre": "PLANIFICACION-2026-08-COMPLETO",
    "unidadesOperativas": []
  },
  "mes": 8,
  "anio": 2026,
  "reemplazos": [
    {
      "unidadOperativa": "CACAO C1",
      "dia": 5,
      "turno": "TURNO A",
      "empleadoTitular": "Mario",
      "empleadoReemplazo": "Celio",
      "tipoCobertura": "COMODIN",
      "motivo": "VACACIONES"
    }
  ]
}
```

Devuelve `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
con encabezado de descarga. `reemplazos` es opcional y permite conservar en el
Excel el resaltado y la nota de quién cubre a quién. La plantilla actual
requiere las cuatro unidades:
`CACAO C1`, `CAJA CACAO`, `TRUCK STOP` y `CAJA TRUCK STOP`.

## Formato del calendario JSON

Cada unidad contiene empleados y cada empleado contiene `estadosPorDia`. Un
calendario importado también puede incluir `periodoOrigen`; en ese caso los
estados abarcan desde el día 1 del mes declarado hasta la última fecha segura
del derrame semanal. Una propuesta generada siempre contiene exactamente el mes
destino completo:

```json
{
  "nombre": "Calendario desde Excel",
  "periodoOrigen": {
    "mes": 7,
    "anio": 2026,
    "fechaInicio": "2026-07-01",
    "fechaFin": "2026-08-02"
  },
  "unidadesOperativas": [
    {
      "nombre": "CAJA CACAO",
      "empleados": [
        {
          "nombre": "Natanael",
          "estadosPorDia": ["TURNO A", "LIBRE", "TURNO B"]
        }
      ]
    }
  ]
}
```

Estados aceptados: `TURNO A`, `TURNO B`, `LIBRE`, `VACACIONES`, `FERIADO` y
`OTRO`. Las fechas de eventos deben usar `YYYY-MM-DD`.

## Validación del proyecto

```bash
npm test -- --run
npx tsc --noEmit
npm run lint
npm run build
```
