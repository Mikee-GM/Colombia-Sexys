"use client";

import { useEffect } from "react";
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
 */
export default function ActualizarEnVivo({
  canal,
}: {
  canal: "empleada" | "chofer";
}) {
  const router = useRouter();

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

    function alVolver() {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      // Si el canal se cayo mientras estaba en segundo plano, se rehace.
      if (!fuente) conectar();
    }

    conectar();
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
