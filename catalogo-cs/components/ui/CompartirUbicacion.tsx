"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import { toast } from "sonner";


/**
 * Manda la posicion al panel mientras el portal esta abierto.
 *
 * Hasta ahora la unica via era compartir ubicacion en vivo desde Telegram, y
 * dependia de acordarse: quien no lo hacia quedaba en el mapa del jefe con la
 * ultima posicion escrita a mano, y el reparto por cercania elegia chofer con
 * datos viejos.
 *
 * Se activa a mano y se recuerda en el navegador, asi que la proxima vez que
 * abra el portal arranca sola. No se pide sin mas al cargar la pagina a
 * proposito: el navegador ensena el aviso del sistema, y un permiso que se pide
 * sin explicar es un permiso que se deniega para siempre.
 *
 * Solo mientras la pantalla esta abierta. Una aplicacion web no puede seguir a
 * nadie en segundo plano, y conviene que se sepa: es una posicion de trabajo,
 * no un rastreo.
 */

/** La clave del recuerdo. Es por dispositivo, como el permiso del navegador. */
const CLAVE = "compartir-ubicacion";

/** Cada cuanto se manda como mucho. El backend ademas espera un minuto. */
const MINIMO_ENTRE_ENVIOS_MS = 30 * 1000;

type Estado = "sin-soporte" | "apagado" | "encendido" | "denegado";

/**
 * La accion que guarda la posicion la pone quien monta el componente.
 *
 * Cada portal tiene la suya, con las cabeceras y el token propios de su rol, y
 * asi este componente sirve para los dos sin saber cual es cual.
 */
export default function CompartirUbicacion({
  registrar,
  token,
}: {
  registrar: (
    lat: number,
    lng: number,
    token?: string,
  ) => Promise<{ success: boolean }>;
  token?: string;
}) {
  const [estado, setEstado] = useState<Estado>("apagado");
  const vigilancia = useRef<number | null>(null);
  const ultimoEnvio = useRef(0);

  const detener = useCallback(() => {
    if (vigilancia.current !== null) {
      navigator.geolocation.clearWatch(vigilancia.current);
      vigilancia.current = null;
    }
  }, []);

  const enviar = useCallback(
    async (lat: number, lng: number) => {
      const ahora = Date.now();
      // El navegador avisa de cada pequeño movimiento; no hace falta
      // contarselo todo al servidor.
      if (ahora - ultimoEnvio.current < MINIMO_ENTRE_ENVIOS_MS) return;
      ultimoEnvio.current = ahora;

      // Un envio perdido no se avisa: el siguiente lo corrige, y una tostada
      // por cada bache de cobertura seria peor que el problema.
      await registrar(lat, lng, token);
    },
    [registrar, token],
  );

  const arrancar = useCallback(() => {
    vigilancia.current = navigator.geolocation.watchPosition(
      (posicion) => {
        setEstado("encendido");
        void enviar(posicion.coords.latitude, posicion.coords.longitude);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setEstado("denegado");
          try {
            localStorage.removeItem(CLAVE);
          } catch {
            // Navegador con el almacenamiento bloqueado: no hay nada que borrar.
          }
          detener();
          return;
        }
        // Un fallo de senal no apaga nada: el navegador reintenta solo.
        console.error(error);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
  }, [detener, enviar]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setEstado("sin-soporte");
      return;
    }
    let recordado = false;
    try {
      recordado = localStorage.getItem(CLAVE) === "si";
    } catch {
      // Ventana privada o almacenamiento bloqueado: se queda apagado.
    }
    if (recordado) arrancar();
    return detener;
  }, [arrancar, detener]);

  function alternar() {
    if (estado === "encendido") {
      detener();
      setEstado("apagado");
      try {
        localStorage.removeItem(CLAVE);
      } catch {
        // Sin almacenamiento no hay recuerdo que quitar; el apagado ya ocurrio.
      }
      return;
    }

    try {
      localStorage.setItem(CLAVE, "si");
    } catch {
      // Se comparte igual; lo unico que se pierde es que arranque sola manana.
    }
    arrancar();
    toast.success("Compartiendo tu ubicación mientras tengas esto abierto.");
  }

  if (estado === "sin-soporte") return null;

  const encendido = estado === "encendido";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start gap-3">
        {encendido ? (
          <MapPin size={16} className="mt-0.5 shrink-0 text-[#C5A55A]" />
        ) : (
          <MapPinOff size={16} className="mt-0.5 shrink-0 text-zinc-600" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Tu ubicación
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            {estado === "denegado"
              ? "Bloqueaste la ubicación en este navegador y no se puede volver a pedir desde aquí. Permítela en los ajustes del sitio y recarga la página."
              : encendido
                ? "El panel te ve en el mapa mientras tengas esta pantalla abierta. Al cerrarla deja de compartirse."
                : "Compártela y no tendrás que mandarla por Telegram. Solo mientras tengas esta pantalla abierta."}
          </p>

          {estado !== "denegado" && (
            <button
              type="button"
              onClick={alternar}
              className={`mt-3 inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                encendido
                  ? "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  : "border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-[#C5A55A] hover:text-[#C5A55A]"
              }`}
            >
              {encendido ? (
                <>
                  <MapPinOff size={14} />
                  Dejar de compartir
                </>
              ) : (
                <>
                  <MapPin size={14} />
                  Compartir mi ubicación
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
