"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Avisa en el panel cuando un chofer rechaza una oferta de viaje.
 *
 * Hasta ahora un rechazo no dejaba rastro visible: el viaje pasaba en silencio
 * al siguiente chofer y nadie se enteraba de que uno estaba rechazando todo. El
 * aviso llega desde el primer rechazo, no solo con la multa, porque ver subir
 * la racha es lo que permite hablar con el chofer antes de que llegue.
 *
 * No pinta nada por si mismo: se monta junto al tablero y solo levanta avisos.
 */
export default function AvisosDeChoferes() {
  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      source = new EventSource("/api/realtime/sse", { withCredentials: true });

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== "driver.offer.rejected") return;

          const nombre = payload.choferNombre || "Un chofer";
          if (payload.multaAplicada) {
            toast.error(
              `${nombre} rechazó ${payload.rechazosSeguidos} ofertas seguidas`,
              {
                description: `Se aplicó una multa automática de $${Number(
                  payload.montoMulta ?? 0,
                ).toLocaleString("es-MX")}. El contador vuelve a cero.`,
                duration: 12000,
              },
            );
            return;
          }

          toast.warning(`${nombre} rechazó una oferta de viaje`, {
            description: `Lleva ${payload.rechazosSeguidos} de ${payload.limite} seguidas antes de la multa.`,
            duration: 8000,
          });
        } catch {
          /* Un evento mal formado no puede tumbar la escucha del resto. */
        }
      };

      source.onerror = () => {
        source?.close();
        // Reconexion con espera fija: el panel puede quedar abierto horas y sin
        // esto un corte de red deja de avisar para siempre, en silencio.
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  return null;
}
