- Pasos para crear una empleada \*
  1- Crear la empleada desde el endpoint de employees POST (El usuario se creara automaticamente con el rol de empleada) IMPORTANTE especificar el tipo de empleada: 'independiente' o 'agencia'

2- Generar un codigo de un solo uso con el endpoint de la API (POST /api/users/id/telegram-otp)

3- La empleada debera buscar en su telegram el bot (@pasteles_bot), iniciarlo, y escribir en el chat /vincular XXXXXX, donde las X representan el codigo generado anteriormente

4- A partir de aqui se divide en dos caminos para la empleada

- Para la empleada de agencia, el camino llega hasta aqui, el bot le enviara notificaciones de cuando es que
  tiene una nueva cita, ya que el jefe es el que se encargara de aceptar o rechazar sus servicios.

  Se le notificara si un chofer ya va en camino a su ubicacion o si ya llego.

  Finalmente se le dara la opcion de finalizar un servicio en todo momento, por si el cliente decide terminarlo antes. O si el tiempo ya esta a punto de cumplirse, 15 minutos antes de dicho caso se le notificara a la empleada, ademas de preguntarle si es que el cliente desea extender el tiempo del servicio.

  Una vez finalizado el servicio, el bot le buscara un chofer para que pueda volver a su departamento o a su siguiente servicio.

- Para la empleada independiente hay un paso mas para la correcta configuracion:
  - Debera crear un nuevo grupo y activar la opcion de temas en su configuracion
  - Debera anadir al bot a dicho grupo y ascenderlo a administrador
  - Debera escribir en el chat del grupo el comando /vincular_grupo

- Con esos pasos ya estaria completa la configuracion de la empleada independiente.

- Cuando un cliente quiera contratar sus servicios, le llegara directamente a ella la peticion del servicio, con opciones de rechazar o aceptar la solicitud.

- Dichas notificaciones le llegaran en un subgrupo dentro del grupo que ella creo con el bot, para mantener ordenadas las peticiones de cada cliente.

- Ademas, en cada hilo la empleada podra hablar directamente con el cliente intercambiando mensajes
