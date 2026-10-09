"use client";

/**
 * Conserva el punto de montaje histórico de los paneles.
 *
 * Refrescar los datos no basta: el JavaScript sigue siendo el de la primera
 * carga, asi que un despliegue que cambia una pantalla no se ve. En un telefono
 * eso puede durar dias, porque una aplicacion instalada se reanuda en vez de
 * recargarse y puede pasar mucho sin una carga completa.
 *
 * La detección y la actualización viven ahora en `PwaProvider`: allí pueden
 * avisar primero y nunca recargan un formulario o una operación en curso sin
 * una acción explícita de la persona.
 */
export default function ComprobarVersion() {
  return null;
}
