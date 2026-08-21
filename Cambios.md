Ok quiero hacer unas cuantas correcciones:

Quiero que le prohíbas ala ia mencionar cualquier cosa relacionada a que es un sistema automatico o que trabaja junto con un sistema. Por ejemplo, estaba hablando de los moteles y le menciono al cliente que podia elegir alguno de los moteles del sistema. No quiero que diga palabras como sistema, quiero que diga algo asi como que esos son los moteles que atiendo o cosas asi.

 

En un momento se le fue aclarado a la ia que la ubicacion seria a domicilio, ella respondio que perfecto, que le mandara ahora el pin de ubicacion, se le fue mandado a la ia, pero inmediatamente el bot respondio con un mensaje de que inicie la contratacion de una empleada desde el catalogo web primero, y despues respondio que ya recibio la ubicacion pero junto con ese mensaje mando los botones para seleccionar alguna ubicacion de las predeterminadas. Hay que arreglar eso. Que propones?

Quiero que las modelos que tengan registrado el extra de atencion a pareja, se active una opcion para registrar un speech personalizado y que ese sea el que se mande al cliente. Ademas, creo que la ia ahora mismo esta confundiendo atencion a perejas con trios. Hay que arreglar eso.

Hay errores en los que el cliente ya manda la ubicacion del servicio, la ia responde con que en efecto ya la tiene, pero aun asi manda los botones inline para seleccionar ubicaciones. Eso no deberia pasar.

Quiero quitar en general todos los botones in line relacionados con la ubicacion que se le manden al cliente.

Ahora mismo la ia esta siendo muy insistente con preguntar los datos de los servicios si no se los han dado. No me gusta que haga tanta presion con esos asuntos. Quiero que arregles eso y ademas, quiero poner una regla que en caso de que los clientes pidan algun tipo de informacion de alguna cosa que no este relacionada con horas del servicio, metodo de pago, o ubicacion, no terminen la explicacion con alguna pregunta relacionada con horas del servicio, metodo de pago, o ubicacion.

Quiero que la ia ya no pregunte desde el primer mensaje la cantidad de horas, metodo de pago o ubicacion. Siento que es igual mucha presion preguntar inmediatamente esos datos.

Quiero que la ia cheque la descripcion de la modelo para determinar si da besos, besos bien dados o de plano no dan besos. Y creo que ya esta, pero quiero que siempre aclare que eso depende de la higiene.

Quiero que la ia tenga prohibido hablar de cosas que no sean relacionadas con la recopilacion de la informacion del servicio, que son, horas, metodo de pago y ubicacion. O que no sean cosas relacionadas con la aclaracion de informacion, como explicacion de servicios o algo por el estilo. No quiero que la ia termine haciendo roleplay diciendo que ya esta en el lugar acordado y pregunte en cual habitacion, etc. Tampoco quiero que mencione en cuantas horas aproximadamente va a llegar al lugar, eso sera trabajo de los jefes quienes respondan esas preguntas una vez que la informacion del servicio ya se haya concretado y el control ya se haya pasado al telefonista.

Tambien, quiero que toda la conversacion historica entre la ia y el cliente se mande en un solo mensaje largo de telegram con divisiones claras entre mensajes para mayor legibilidad, porque ahora mismo a veces se manda en un mensaje largo y otras en varios mensajes, pero lo que pasa cuando se mandan varios mensajes es que hay veces en los que hay mensajes que no se mandan al jefe y se pierde informacion del historial de mensajes. Para evitar eso, quiero que sea un unico mensaje. Tambien arregla cualquier error que provoque la perdida de mensajes.

Tambien ocurre un error en el que puede que el cliente ya haya mandado captura de la transferencia y la ia vuelva a pedir la captura como si nunca la hubiera recibido.

Si el cliente pide informacion de la empleada, quiero que responda con los datos que hay en la descripcion, cosas como altura, peso o cosas asi. 

Es importante aclarar que es solo una relacion por hora en caso de que el cliente pregunte que tanto hace en una hora.

Existe la posibilidad de que el cliente diga que la duracion del servicio sera indefinida o algo por el estilo, aqui quiero hacer un manejo de errores. Quiero crear la posibilidad de que la duracion de un servicio sea indefinida. Y las horas finales del servicio se contaran una vez la empleada haya marcado como finalizado el servicio. En este caso, el recibir la transferencia por adelantado ya no aplica, asi que habra que hacer los cambios pertinentes, como pedirle el comprobante de transferencia al cliente cuando ya haya finalizado el servicio con el total del servicio. Si las horas no fueron exactas, quiero que se redondee hacia arribaa partir de los 15 minutos, por ejemplo, si fueron en total 2:15, deberan contarse como 3 horas totales y cobrarse como tal.

Quiero que la ia siga extrictamente el flujo establecido de pedir datos y dar informacion.

Si el cliente menciona alguna ubicacion que no este estrictamente dentro de lasd ubicaciones preestablecidas, quiero que diga que no lo conoce o que no sabe donde se encuentra y que pida obligatoriamente el pin.

No quiero que la ia mencione algo relacionado a que el servicio ya fue aceptado sin que sea asi. No quiero que diga cosas como que ya se esta arreglando, o que solo falta que su uber o chofer lleguen o algo asi. Quiero limitar esas respuestas unicamente a  cuando el servicio haya sido aceptado y/o rechazado.

Existe la posibilidad tambien de que alguna modelo este ocupada, y en ese caso, esta bien como esta ahora que el bot marca que la modelo no esta disponible y tal, y que salgan botones inline preguntando si esperarla o ver otras empleadas disponibles.

1. En caso de que el cliente decida esperar  a la modelo, quiero que la ia le empiece a responder unicamente hasta que la empleada vuelva a estar disponible.
2. En caso de que el  cliente decida ver otras modelos disponibles, quiero que el bot le mande una lista con fotos de todas las modelos disponibles con sus respectivos botones de ver mas informacion o contratar, este ultimo comenzando un flujo con dicha empleada como si se hubiese metido desde la pagina web.

Hay un error, cuando el cliente pide o sugiere a varias modelos (lo cual significa un servicio grupal) o directamente pregunta por un servicio grupal o derivados, la ia responde con que no hay otras modelos disponibles, dice que todas estan ocupadas aunque no sea cierto en el sistema. Hay que arreglar eso.
Ademas, tambien quiero que la ia sea capaz de enviar fotos de las otras modelos.