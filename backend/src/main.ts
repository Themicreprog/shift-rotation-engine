import { createNativeHttpServer } from './infrastructure/http/NativeHttpServer.js';

const PORT_PREDETERMINADO = 3000;
const HOST_PREDETERMINADO = '127.0.0.1';

const port = leerPuerto();
const host = process.env['HOST']?.trim() || HOST_PREDETERMINADO;
const server = createNativeHttpServer();

server.on('error', (error) => {
  console.error('No fue posible iniciar FireSchedule:', error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`FireSchedule disponible en http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close((error) => {
      if (error) {
        console.error('No fue posible detener FireSchedule correctamente:', error);
        process.exitCode = 1;
      }
    });
  });
}

function leerPuerto(): number {
  const valor = process.env['PORT']?.trim();

  if (valor === undefined || valor.length === 0) return PORT_PREDETERMINADO;

  const puerto = Number(valor);

  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65_535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.');
  }

  return puerto;
}
