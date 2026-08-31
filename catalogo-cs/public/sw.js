/*
 * Service worker de los avisos push del panel.
 *
 * Solo hace dos cosas: pintar el aviso que llega y llevar al panel cuando se
 * toca. No cachea nada a proposito; una capa de offline aqui solo añadiria
 * superficie de fallo (paginas viejas servidas desde cache) sin resolver nada
 * de lo que este service worker existe para resolver.
 */

// Toma el control sin esperar a que se cierren las pestañas abiertas: si no, un
// panel que lleva dias abierto seguiria con la version anterior.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) =>
  evento.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (evento) => {
  let aviso = {};
  try {
    aviso = evento.data ? evento.data.json() : {};
  } catch {
    // Carga ilegible: mejor un aviso generico que ninguno. Que el telefono
    // suene es justamente lo que se venia perdiendo.
    aviso = {};
  }

  const titulo = aviso.titulo || "Colombia Sexys";
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: aviso.cuerpo || "",
      icon: "/icono-192.png",
      badge: "/icono-192.png",
      // Agrupa por asunto: un segundo aviso del mismo servicio reemplaza al
      // primero en vez de apilarse.
      tag: aviso.tag || undefined,
      renotify: Boolean(aviso.tag),
      requireInteraction: aviso.requireInteraction === true,
      data: { url: aviso.url || "/jefe" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/jefe";

  evento.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((ventanas) => {
        /*
         * Si el panel ya esta abierto se enfoca esa ventana y se navega dentro.
         * Abrir una pestaña nueva en cada aviso deja al jefe con media docena
         * de paneles y la sesion repartida entre ellos.
         */
        for (const ventana of ventanas) {
          if (ventana.url.includes(destino) && "focus" in ventana) {
            return ventana.focus();
          }
        }
        for (const ventana of ventanas) {
          if ("navigate" in ventana && "focus" in ventana) {
            return ventana.navigate(destino).then((v) => (v ? v.focus() : null));
          }
        }
        return self.clients.openWindow(destino);
      }),
  );
});
