/**
 * Version de la API del backend, que la publica bajo `/api/v{N}`.
 *
 * Vive aparte de `api-server.ts` porque el middleware corre en el runtime edge
 * y no puede importar ese modulo, que arrastra `next/headers`.
 */
export const BACKEND_API_VERSION = "1";

/** Prefijo completo que antecede a toda ruta del backend. */
export const BACKEND_API_PREFIX = `/api/v${BACKEND_API_VERSION}`;
