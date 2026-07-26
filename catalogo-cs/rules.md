# Reglas: gestión de cookies y tokens (Next.js + NestJS/Passport)

Estas reglas son obligatorias para todo código nuevo de autenticación y para cualquier refactor del flujo existente. Las reglas específicas de NestJS/Passport se aplican en el repositorio del backend.

## 1. Almacenamiento

- Nunca almacenar `access_token` ni `refresh_token` en `localStorage` o `sessionStorage`.
- Almacenar siempre los tokens en cookies `httpOnly` emitidas por el servidor NestJS.
- Nunca decodificar ni confiar en el payload de un JWT en el cliente para tomar decisiones de autorización. La decodificación en el cliente se limita a fines de experiencia de usuario.

## 2. Diseño de tokens

- Usar dos tokens: `access_token` con TTL de 5 a 15 minutos y `refresh_token` con TTL de 7 a 30 días.
- Rotar el `refresh_token` después de cada uso.
- Si se presenta nuevamente un `refresh_token` ya usado o rotado, tratarlo como comprometido y revocar todas las sesiones del usuario.
- Firmar `access_token` y `refresh_token` con secretos diferentes. Usar claves asimétricas RS256 cuando varios servicios deban verificar los tokens.
- Persistir en la base de datos los refresh tokens, preferiblemente sus hashes, asociados a `userId` y `deviceId` o `sessionId`, para permitir la revocación individual de sesiones.

## 3. Configuración de cookies en NestJS

- Usar siempre `httpOnly: true`.
- Usar `secure: true` en producción. Para pruebas locales cross-origin, usar HTTPS.
- Usar `sameSite: "lax"` cuando frontend y backend sean del mismo sitio.
- Usar `sameSite: "none"` junto con `secure: true` cuando sean cross-site.
- Restringir la cookie del refresh token con `path: "/api/auth/refresh"`.
- Definir `domain` explícitamente solo cuando se utilicen subdominios y nunca con un alcance mayor al necesario.
- Usar `signed: true` junto con `cookie-parser` y un secreto para detectar alteraciones.
- Hacer coincidir `maxAge` con el `exp` real del token; nunca permitir que la cookie dure más que el token.
- Al cerrar sesión, llamar `res.clearCookie()` con exactamente las mismas opciones `path` y `domain` utilizadas al crear la cookie.

## 4. NestJS y Passport

- Extraer el JWT tanto desde la cookie como desde el encabezado `Authorization` mediante extractores combinados:

  ```typescript
  const cookieExtractor = (req: Request) =>
    req?.cookies?.access_token ?? null;

  ExtractJwt.fromExtractors([
    ExtractJwt.fromAuthHeaderAsBearerToken(),
    cookieExtractor,
  ]);
  ```

- Habilitar CORS con una lista explícita de orígenes y `credentials: true`. Nunca usar `origin: "*"` junto con cookies.

  ```typescript
  app.enableCors({
    origin: ["https://frontend.example.com"],
    credentials: true,
  });
  ```

- Añadir protección CSRF en las solicitudes que modifican estado, incluso con `sameSite: "lax"`. Emitir una cookie CSRF no `httpOnly`, exigir su valor en el encabezado `x-csrf-token` y verificarlo mediante un guard.
- Invalidar inmediatamente el refresh token en la base de datos al cerrar sesión; no limitarse a eliminar la cookie.

## 5. Next.js App Router

- Leer cookies únicamente en el servidor mediante `cookies()` de `next/headers`, dentro de Server Components, Route Handlers o Server Actions.
- Nunca intentar leer cookies `httpOnly` desde un Client Component.
- Modificar cookies únicamente en Server Actions o Route Handlers. Nunca establecer ni eliminar cookies durante el renderizado GET de un Server Component.
- Cuando frontend y backend estén en sitios distintos, usar un Route Handler como proxy que reenvíe manualmente el encabezado `Cookie` a NestJS.
- Usar middleware solo para redirecciones ligeras basadas en la presencia de la cookie o su expiración decodificada. La autorización real y la verificación de firma deben ejecutarse en el servidor contra NestJS.
- Consultar la documentación incluida en la versión instalada de Next.js antes de implementar o modificar APIs, convenciones o estructura del framework.

## 6. Flujo de renovación

- Ejecutar las solicitudes de refresh desde el servidor de Next.js mediante un Route Handler o Server Action, no desde un `fetch` del cliente.
- Implementar un mutex o cola en el cliente: si varias solicitudes reciben `401` al mismo tiempo, solo una debe iniciar el refresh y las demás deben esperar la misma promesa.
- Marcar las solicitudes reintentadas para evitar ciclos infinitos de refresh.
- Si el refresh falla por expiración o revocación, cerrar completamente la sesión y limpiar únicamente el estado no sensible del cliente.

## 7. Errores y casos límite

- Sincronizar el cierre de sesión entre pestañas mediante `BroadcastChannel` o el evento `storage`, usando solo una bandera no sensible.
- Permitir una tolerancia de desfase de reloj de 30 a 60 segundos al validar `exp` e `iat`.
- Tratar la reutilización de un refresh token como un incidente de seguridad y revocar todas las sesiones afectadas del usuario.
- Ante un fallo temporal del backend o de red, no eliminar cookies ni forzar el cierre de sesión. Mostrar un error de red y permitir reintentar.
- En desarrollo local cross-site, usar HTTPS o un proxy/`rewrite` de Next.js, ya que `sameSite: "none"` requiere `secure`.

## 8. Referencia rápida

| Capa | Regla no negociable |
|---|---|
| Almacenamiento | Tokens únicamente en cookies `httpOnly` |
| CORS de NestJS | `credentials: true` y lista explícita de orígenes |
| Passport | Extractor combinado de cookie y Bearer |
| Refresh | Rotación y detección de reutilización |
| Next.js | Modificar cookies solo en Server Actions o Route Handlers |
| Middleware | Solo redirecciones ligeras; nunca autorización real |
| Cliente | Mutex para impedir refresh concurrente |
| CSRF | Obligatorio en las solicitudes que modifican estado |

## 9. Criterios generales del proyecto

- Mantener toda la interfaz en español, sin emojis y con tono profesional.
- Reutilizar componentes genéricos y evitar duplicación de lógica o estilos.
- Mantener una arquitectura mobile-first y respetar la tipografía y la paleta definidas en `AGENTS.md`.
- Validar entradas y salidas en los límites del sistema y no exponer secretos ni detalles internos en mensajes de error.
- Ejecutar TypeScript, lint, pruebas y build según el alcance y el riesgo de cada cambio.
