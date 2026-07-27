# Arquitectura del frontend

Next.js funciona como interfaz pública, panel interno y proxy de mismo origen
hacia NestJS. `BACKEND_API_URL` es una variable exclusivamente del servidor:

- Docker: `http://backend:4000`.
- Desarrollo local: `http://localhost:4000`.

Las solicitudes `/api/*`, salvo Route Handlers internos de Next.js, se
reescriben hacia NestJS. Las cookies HTTP-only son emitidas por el backend y
reenviadas por el frontend. PostgreSQL, R2, JWT, Telegram e IA pertenecen al
backend; no deben configurarse ni importarse directamente desde este paquete.

La construcción de producción usa `output: "standalone"` y se ejecuta como
usuario no root dentro de Docker.
