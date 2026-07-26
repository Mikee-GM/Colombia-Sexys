---
trigger: always_on
---

## 19. Arquitectura de Integración con APIs de IA

- **Capa de abstracción obligatoria**: nunca llamar al SDK del proveedor (OpenAI, Anthropic, etc.) directamente desde un Controller o desde la lógica de negocio. Crear un `AiProviderService` (o interfaz `AiProvider`) que encapsule el SDK, para poder cambiar de proveedor o hacer fallback entre modelos sin tocar el resto de la app.
- **Un módulo dedicado (`AiModule`)**: agrupa el cliente del proveedor, la configuración, los prompts templates y los servicios de negocio que consumen IA (ej. `SummarizerService`, `ChatAssistantService`), siguiendo el mismo principio de modularidad de la Sección 1.
- **Streaming cuando aplique**: para respuestas largas (chat, generación de texto), usar streaming (`stream: true`) en lugar de esperar la respuesta completa, mejorando la percepción de latencia en el frontend/bot.
- **Timeouts explícitos**: configurar timeout en cada llamada (ej. 30-60s); nunca dejar una request a la API de IA colgada indefinidamente bloqueando un worker o request HTTP.

## 20. Rate Limiting y Reintentos

- **Exponential backoff con jitter**: al recibir un `429 Too Many Requests`, reintentar con backoff exponencial (ej. 1s, 2s, 4s, 8s) más un jitter aleatorio, en lugar de reintentar inmediatamente o a intervalos fijos [[1]](#\_\_1).
- **Leer los headers de rate limit del proveedor**: usar los headers de respuesta (remaining requests/tokens, reset time) para ajustar el ritmo de las siguientes llamadas de forma proactiva, no solo reactiva ante el 429 [[3]](#\_\_3).
- **Rate limiting propio en tu lado (client-side)**: implementar un limitador (ej. con `Bull`/`BullMQ` o un token bucket) que controle cuántas requests por minuto/segundo salen hacia el proveedor desde tu backend, evitando saturar tu propia cuota antes de que el proveedor te frene [[1]](#\_\_1).
- **Concurrencia adaptativa**: si tienes múltiples workers consumiendo la API en paralelo, limitar la concurrencia dinámicamente según el tier/cuota del proveedor, no lanzar todas las requests al mismo tiempo sin control [[3]](#\_\_3).
- **Circuit breaker**: si el proveedor empieza a fallar de forma sostenida (timeouts, 5xx repetidos), abrir un circuit breaker temporal para dejar de golpear la API y degradar el servicio de forma controlada (ej. responder "servicio de IA no disponible, intenta más tarde") en lugar de acumular reintentos infinitos [[2]](#\_\_2).

## 21. Colas para Trabajos de IA

- **Todo request de IA no urgente va a una cola** (BullMQ/Redis), nunca bloquear el request-response HTTP ni el handler de Telegraf esperando una respuesta de IA que puede tardar segundos.
- Procesar los jobs de IA con **concurrencia limitada** en el worker, alineada a la cuota real de tu tier de API, para no generar una cascada de 429 apenas escale el tráfico.
- Guardar el estado del job (`pending`, `processing`, `completed`, `failed`) para poder informar al usuario/bot el progreso sin bloquear, especialmente en flujos largos (ej. generación de reportes, análisis de documentos).

## 22. Gestión de Prompts

- **Prompts como código versionado**: los prompts/system messages viven en archivos propios (templates), no hardcodeados dentro de la lógica de negocio; permite versionarlos, testearlos y hacer rollback si un cambio de prompt degrada resultados.
- **Parametrizar, nunca concatenar directo**: usar interpolación controlada (con escaping) al insertar input del usuario en un prompt, para reducir el riesgo de prompt injection.
- **Separar system prompt de user input siempre**: nunca mezclar instrucciones del sistema con texto libre del usuario en un mismo bloque sin delimitación clara; usar los roles nativos de la API (`system`, `user`, `assistant`) en lugar de un solo string plano.
- Validar y sanear el input del usuario antes de enviarlo al modelo (longitud máxima, caracteres permitidos), igual que sanitizarías cualquier input hacia una DB (Sección 4 y 16).

## 23. Control de Costos

- **Presupuesto por usuario/tenant**: llevar un contador de tokens/costo consumido por usuario en DB o Redis, con límites configurables para evitar que un solo usuario dispare la factura completa.
- **Modelos escalonados**: usar el modelo más barato/rápido que cumpla la tarea (ej. clasificación simple) y reservar el modelo más costoso solo para tareas que realmente lo requieran (razonamiento complejo, generación larga).
- **Cachear respuestas deterministas**: si el mismo input produce el mismo output útil (ej. resúmenes de contenido estático), cachear la respuesta en Redis con TTL en lugar de volver a llamar al modelo cada vez.
- Loguear tokens de entrada/salida y costo estimado por request, agregándolo a tu stack de monitoreo (Sección 7), para detectar picos anómalos de consumo temprano.

## 24. Manejo de Errores y Respuestas No Deterministas

- Nunca asumir que la respuesta del modelo tiene el formato esperado; si esperas JSON, validar el output contra un schema (Zod/class-validator) antes de usarlo, y tener un fallback si la validación falla.
- Diferenciar tipos de error: rate limit (429) → reintentar con backoff; error de servidor del proveedor (5xx) → reintentar limitado + circuit breaker; error de contenido/policy (400) → no reintentar, loguear y responder al usuario de forma controlada [[2]](#\_\_2).
- Nunca exponer al usuario final el error crudo del proveedor de IA (puede filtrar detalles de tu prompt/configuración); traducir siempre a un mensaje genérico y loguear el detalle internamente (mismo principio de la Sección 3 y 15).

## 25. Seguridad y Datos Sensibles

- Nunca enviar al modelo información sensible (contraseñas, tokens, datos personales innecesarios) salvo que el proveedor garantice contractualmente el manejo adecuado (zero data retention, etc.).
- Mantener las API keys del proveedor de IA solo en variables de entorno vía `ConfigService` (Sección 8), nunca en el código ni en logs.
- Si el output del modelo se muestra directamente al usuario (ej. HTML/Markdown), sanitizar antes de renderizar para evitar inyección si el modelo genera contenido no confiable.

## 26. Testing de Integraciones con IA

- Mockear el `AiProviderService` en tests unitarios de la lógica de negocio; nunca hacer llamadas reales a la API de IA en el CI/CD (costo y no determinismo).
- Tests de contrato: verificar que tu capa de abstracción maneja correctamente los casos de 429, timeout y respuesta malformada, simulando esas respuestas con mocks.
- Para validar calidad real de prompts, usar un proceso de evaluación separado (offline, con datasets de prueba), no depender del CI para juzgar la "calidad" de las respuestas del modelo.
