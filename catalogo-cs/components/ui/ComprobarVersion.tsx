"use client";

import { useEffect, useRef } from "react";

/**
 * Recarga la pagina entera cuando el servidor ya sirve otra version.
 *
 * Refrescar los datos no basta: el JavaScript sigue siendo el de la primera
 * carga, asi que un despliegue que cambia una pantalla no se ve. En un telefono
 * eso puede durar dias, porque una aplicacion instalada se reanuda en vez de
 * recargarse y puede pasar mucho sin una carga completa.
 *
 * Vive aparte de `ActualizarEnVivo` porque el panel del jefe ya tiene su propio
 * canal en vivo: alli solo falta esta parte, y montar el otro componente
 * abriria una segunda conexion para nada.
 */
export default function ComprobarVersion() {
  const versionCargada = useRef<string | null>(null);

  useEffect(() => {
    async function comprobar() {
      try {
        const respuesta = await fetch("/api/version", { cache: "no-store" });
        if (!respuesta.ok) return;
        const { version } = (await respuesta.json()) as { version?: string };
        if (!version) return;

        // La primera lectura solo anota cual se esta ejecutando: recargar nada
        // mas abrir seria un bucle.
        if (versionCargada.current === null) {
          versionCargada.current = version;
          return;
        }
        if (versionCargada.current !== version) {
          window.location.reload();
        }
      } catch {
        // Sin red no se comprueba; se reintenta al volver.
      }
    }

    function alVolver() {
      if (document.visibilityState !== "visible") return;
      void comprobar();
    }

    void comprobar();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, []);

  return null;
}
