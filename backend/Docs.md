# Alta y operación de una empleada

Todas las empleadas son de agencia: siempre hay un jefe (o un administrador)
que autoriza sus servicios. No existen las empleadas independientes, y una
empleada nunca acepta ni rechaza su propio servicio ni recibe directamente la
solicitud del cliente.

## Alta

1. Crear la empleada desde `POST /api/v1/employees`. El usuario se crea
   automáticamente con el rol `empleada`.

2. Asignarle un jefe (`jefeId`) y, si se quiere un relevo, un jefe secundario
   (`jefeSecundarioId`). Si el jefe principal está inactivo, no disponible o
   cerró su jornada, el servicio pasa al secundario; si tampoco hay, cae en
   cualquier jefe o administrador activo y disponible.

3. Generar un código de un solo uso con `POST /api/v1/users/:id/telegram-otp`.

4. La empleada busca el bot en su Telegram, lo inicia y escribe
   `/vincular XXXXXX` con el código generado.

Con eso queda operativa. El comando `/vincular_grupo` no es para ella: sirve
para que un jefe o un administrador enlace su propio grupo de Telegram, que es
donde se abre un tema por cada cliente.

## Qué recibe la empleada

El bot le avisa de cada cita nueva. Es su jefe quien acepta o rechaza el
servicio, así que a ella le llega ya resuelto.

Durante el servicio recibe:

- Aviso de que un chofer va en camino a su ubicación, y de que ya llegó.
- La opción de marcar que va en camino y que ya llegó.
- La opción de agregar extras y de finalizar el servicio en cualquier momento,
  por si el cliente decide terminarlo antes.
- Quince minutos antes de que se cumpla el tiempo, la pregunta de si el cliente
  quiere extender el servicio. Si responde que no, su jefe recibe en ese
  momento los botones para ir cuadrando el viaje de regreso.

Al finalizar, se le busca un chofer para volver a su departamento o para ir a
su siguiente servicio.

## Portal web

Todo lo anterior también se hace desde su portal (`/empleada/portal`), sin
depender de encontrar el mensaje correcto en el chat: marcar que va en camino y
que llegó, agregar extras, finalizar el servicio y subir sus fotos semanales.
Los avisos de Telegram llevan un botón que abre el portal en la sección
correspondiente.

Las fotos semanales solo se suben por el portal. Si manda una foto por el chat,
el bot se lo explica y le da el acceso directo.
