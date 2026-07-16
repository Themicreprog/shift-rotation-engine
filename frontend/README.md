# FireSchedule Frontend

Interfaz React para importar el último Excel aprobado, revisar la continuidad
detectada, registrar vacaciones y feriados, generar una propuesta mensual y
descargar el nuevo archivo `.xlsx`.

## Ejecución local

Primero inicia el backend en el puerto `3000`:

```bash
cd backend
npm run dev
```

En otra terminal inicia el frontend:

```bash
cd frontend
npm run dev
```

Vite abre la aplicación en `http://localhost:5173` y redirige las solicitudes
`/api` al backend local.

Para servir el frontend desde otro origen, configura antes de compilar:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api npm run build
```

## Flujo disponible

1. Seleccionar o arrastrar un archivo `.xlsx`.
2. Revisar el período y los días del mes siguiente detectados.
3. Añadir vacaciones o días feriados por persona y unidad.
4. Confirmar en qué unidad están disponibles Celio y Lester; quedan fuera de
   la rotación y solo se activan ante faltantes.
5. Generar la propuesta del mes sugerido.
6. Revisar conflictos, advertencias y reemplazos.
7. Descargar el Excel cuando la propuesta sea exportable.

## Validación

```bash
npm run lint
npm run build
```
