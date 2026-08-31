"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene al dia una pantalla servida desde el servidor.
 *
 * Los portales de modelo y chofer solo se refrescaban tras una accion propia:
 * lo que pasaba en otro sitio --el jefe autorizando un servicio-- no llegaba
 * nunca. En el navegador se disimula recargando a mano, pero en la aplicacion
 * instalada no hay ni ese gesto, y la pantalla parece congelada.
 *
 * Dos vias, porque cubren cosas distintas:
 *
 *  - El canal en vivo, mientras la aplicacion esta abierta y visible.
 *  - Volver a la aplicacion, que es el caso mas comun de todos: la deja en el
 *    bolsillo, vuelve un rato despues y espera ver lo de ahora. Ahi el canal
 *    lleva tiempo cerrado, asi que hace falta refrescar al recuperar el foco.
 *
 * `router.refresh()` vuelve a pedir el componente de servidor, asi que los
 * datos se recargan sin perder lo que la persona tuviera escrito en pantalla.
 *
 * Y ademas comprueba la version. Refrescar trae datos nuevos, pero no codigo:
 * el JavaScript sigue siendo el de la primera carga, asi que un despliegue que
 * cambia una pantalla no se ve. En el telefono eso puede durar dias, porque la
 * aplicacion instalada se reanuda en vez de recargarse. Si la version del
 * servidor ya no es la que se cargo, se fuerza una recarga completa.
 */
export default function ActualizarEnVivo({
  canal,
}: {
  canal: "empleada" | "chofer";
}) {
  const router = useRouter();
  const versionCargada = useRef<string | null>(null);

  useEffect(() => {
    let fuente: EventSource | null = null;
    let reintento: ReturnType<typeof setTimeout> | null = null;

    function conectar() {
      fuente = new EventSource(`/api/realtime/sse?canal=${canal}`, {
        withCredentials: true,
      });

      fuente.onmessage = (evento) => {
        try {
          const payload = JSON.parse(evento.data) as { type?: string };
          // El latido solo mantiene viva la conexion; refrescar con el seria
          // pedir la pantalla entera cada quince segundos para nada.
          if (payload.type === "heartbeat") return;
          router.refresh();
        } catch {
          // Un evento ilegible no dice que no haya pasado nada: se refresca.
          router.refresh();
        }
      };

      fuente.onerror = () => {
        fuente?.close();
        fuente = null;
        // Sin reconexion, una caida de red deja la pantalla muda para siempre.
        reintento = setTimeout(conectar, 5000);
      };
    }

    /**
     * Recarga entera si el servidor ya sirve otra version.
     *
     * Solo cuando hay una version previa con la que comparar: la primera
     * lectura unicamente anota cual se esta ejecutando, para no recargar nada
     * mas abrir. Un fallo de red se ignora, que no saber la version no es
     * motivo para tirar la pantalla.
     */
    async function comprobarVersion() {
      try {
        const respuesta = await fetch("/api/version", { cache: "no-store" });
        if (!respuesta.ok) return;
        const { version } = (await respuesta.json()) as { version?: string };
        if (!version) return;

        if (versionCargada.current === null) {
          versionCargada.current = version;
          return;
        }
        if (versionCargada.current !== version) {
          window.location.reload();
        }
      } catch {
        // Sin red no se comprueba; se reintenta la proxima vez que vuelva.
      }
    }

    function alVolver() {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      void comprobarVersion();
      // Si el canal se cayo mientras estaba en segundo plano, se rehace.
      if (!fuente) conectar();
    }

    conectar();
    void comprobarVersion();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      if (reintento) clearTimeout(reintento);
      fuente?.close();
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [canal, router]);

  return null;
}
