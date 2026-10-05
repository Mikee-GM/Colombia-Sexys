# Decisiones bloqueadas

## Dinero: integración final del monto de una extensión

El flujo registra por separado las horas, el precio sugerido y el monto
acordado en `extensiones_servicio`, y conserva el recálculo heredado de la
duración. No se cambió ninguna fórmula de liquidación, comisión o reparto. Hace
falta una decisión financiera explícita antes de decidir si el monto acordado
reemplaza, complementa o solo documenta el total calculado por las reglas
existentes.

## Sanciones por falta de respuesta

Al vencer 15 minutos se recuerda y se conceden 6 minutos más. Al segundo
vencimiento se expira y escala el caso al jefe. No se genera multa, sanción ni
reporte disciplinario automáticamente, porque esa política no está definida.

## Permisos de conversaciones antes de existir un servicio

La base actual no tiene una relación que asigne una conversación previa al
servicio a una operación o jefe concreto. La bandeja conserva el permiso
existente por rol (`admin`/`jefe`) y no inventa una pertenencia. Antes de aislar
operaciones con varios jefes se necesita definir el dato de enrutamiento
(bot/canal, sucursal, turno o jefe propietario) y persistirlo desde el primer
mensaje.

## Seguridad: protocolo posterior al botón de pánico

El evento crítico, la trazabilidad y los avisos están implementados. No se
automatizaron llamadas, contacto con autoridades, geocercas ni escalamiento a
terceros: requieren un protocolo de seguridad aprobado y responsables
definidos.
