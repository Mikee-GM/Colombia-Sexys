# Release readiness: núcleo operativo

Esta lista valida la rama `refactor/operations-core` en un entorno local o de QA. No usar datos, credenciales ni proveedores de producción.

## Preparación local

- [ ] Confirmar rama, commit y árbol limpio con `git status`, `git branch --show-current` y `git rev-parse HEAD`.
- [ ] Configurar variables exclusivas de QA a partir de los `.env.example`; usar PostgreSQL vacío o una copia anonimizada.
- [ ] Mantener Telegram y Web Push simulados o apuntando a cuentas de prueba.
- [ ] Ejecutar `corepack pnpm install --frozen-lockfile` y la matriz automatizada completa.

## Base de datos y migración

- [ ] Crear respaldo verificable antes de migrar cualquier ambiente persistente.
- [ ] Ejecutar las migraciones y confirmar `1810000000000-CreateServiceOperationsCore` y `1810000100000-AddExternalTransportDetails` en la tabla `migrations`.
- [ ] Verificar el backfill de servicios `pendiente`, `agendado`, `en_curso`, `finalizado` y `cancelado` sin cambios en sus campos históricos.
- [ ] Confirmar índices y constraint `chk_servicios_estado_operativo`.
- [ ] Probar rollback solo en una base desechable: el `down` elimina columnas y eventos operativos nuevos.

## Autenticación y permisos

- [ ] Sin sesión: las rutas de jefe, empleada y chofer responden 401.
- [ ] Rol incorrecto: responde 403 y no cambia estado ni crea eventos.
- [ ] Un jefe no puede consultar ni accionar servicios o viajes de otro equipo.
- [ ] Una empleada no puede aceptar, iniciar, extender, finalizar ni activar pánico para un servicio ajeno.
- [ ] Una mutación autenticada por cookie sin `x-csrf-token` válido responde 403; con Bearer válido funciona.
- [ ] Payloads con campos desconocidos, UUID inválido, horas o montos fuera de rango responden 400.

## Recorrido principal

- [ ] Jefe prepara/asigna; empleada ve únicamente ACEPTAR/RECHAZAR.
- [ ] Aceptar deja el servicio esperando transporte, sin iniciarlo y sin paso de “cobro verificado”.
- [ ] Transporte asignado habilita ESTOY EN CAMINO; luego LLEGUÉ; luego INICIAR SERVICIO.
- [ ] En curso habilita finalizar, extensión, extra y pánico.
- [ ] Finalizar prepara regreso; asignar regreso habilita ESTOY DE REGRESO; completar regreso deja `finalizado`.
- [ ] Cada paso persiste un único estado y un único evento; doble clic no produce 500 ni duplica efectos.

## Casos alternos

- [ ] Probar transporte interno con chofer y transporte externo con plataforma, enlace compartido y costo manual.
- [ ] Probar rechazo, cancelación, expiración y servicio agendado sin saltar transiciones.
- [ ] Ejecutar dos veces los schedulers de 15 + 6 minutos y de fin próximo; cada evento debe existir una sola vez y no debe crear sanciones.
- [ ] Probar takeover `AI_ACTIVE → HUMAN_ACTIVE → AI_ACTIVE`; mientras esté en humano la IA no responde.

## Notificaciones

- [ ] Confirmar destinatarios de Push y Telegram informativo con adaptadores de QA.
- [ ] Simular fallo independiente de Push y Telegram: la transición válida permanece y el error queda registrado.
- [ ] Confirmar que Telegram interno no muestra botones que cambien estados operativos.

## Rollback

- [ ] Detener nuevas operaciones y preservar una copia de `service_operation_events` antes de revertir.
- [ ] Revertir aplicación antes que esquema cuando la versión anterior no entienda las columnas nuevas.
- [ ] Restaurar respaldo si se necesita conservar auditoría operativa; el `down` de la migración la elimina.

## Señales para NO desplegar

- [ ] Cualquier fallo en E2E, unit tests, lint, typecheck o builds.
- [ ] Un 5xx ante doble clic, payload inválido o proveedor externo caído.
- [ ] Acceso cruzado entre jefes/equipos, bypass de CSRF o transición fuera de la máquina de estados.
- [ ] Backfill no determinista, locks incompatibles con la ventana de mantenimiento o rollback no ensayado.
- [ ] Vulnerabilidades `high` sin evaluar/mitigar en dependencias expuestas por HTTP o carga de archivos.
- [ ] Decisiones abiertas de dinero, sanciones, pánico o pertenencia de conversaciones necesarias para el caso que se quiere liberar.
