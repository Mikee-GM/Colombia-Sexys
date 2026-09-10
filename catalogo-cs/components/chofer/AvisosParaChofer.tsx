"use client";

import { useEffect, useState } from "react";

type Aviso = {
  id: string;
  titulo: string;
  detalle: string;
  tono: "oferta" | "info";
};

const TIPO_LABEL: Record<string, string> = {
  ida: "de ida",
  regreso: "de regreso",
};

/**
 * Notificaciones en vivo dentro del portal del chofer.
 *
 * Hasta ahora la unica via para enterarse de una oferta de viaje o de una
 * calificacion era Telegram: el portal quedaba como una foto fija de cuando
 * se abrio. Este componente abre la conexion en tiempo real y muestra un
 * aviso propio (no depende de sonner, que no esta montado en esta ruta).
 *
 * No requiere token: si el chofer entro con un enlace viejo sin token, el
 * portal sigue funcionando en modo solo lectura, simplemente sin avisos en
 * vivo.
 */
export default function AvisosParaChofer({ token }: { token: string | null }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    if (!token) return;

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function agregarAviso(aviso: Aviso) {
      setAvisos((actuales) => [...actuales, aviso]);
      setTimeout(() => {
        setAvisos((actuales) => actuales.filter((a) => a.id !== aviso.id));
      }, 15000);
    }

    function connect() {
      source = new EventSource(
        `/api/realtime/sse/chofer?token=${encodeURIComponent(token!)}`,
      );

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const id = `${payload.type}-${Date.now()}-${Math.random()}`;

          if (payload.type === "driver.trip_offer") {
            const tramo = TIPO_LABEL[payload.tipo] ?? payload.tipo;
            agregarAviso({
              id,
              titulo: "Nueva oferta de viaje",
              detalle: `Viaje ${tramo} para ${payload.empleadaNombre ?? "una empleada"}, a ${
                payload.distanciaKm != null ? `${payload.distanciaKm} km` : "distancia sin calcular"
              }. Revisa Telegram para aceptarla.`,
              tono: "oferta",
            });
            return;
          }

          if (payload.type === "discipline.rating.created") {
            agregarAviso({
              id,
              titulo: "Nueva calificación recibida",
              detalle: "Una empleada calificó tu último viaje.",
              tono: "info",
            });
            return;
          }

          if (payload.type === "discipline.report.created") {
            agregarAviso({
              id,
              titulo: "Nuevo reporte registrado",
              detalle: "Se registró un reporte relacionado con uno de tus viajes.",
              tono: "info",
            });
            return;
          }
        } catch {
          /* Un evento mal formado no puede tumbar la escucha del resto. */
        }
      };

      source.onerror = () => {
        source?.close();
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [token]);

  if (avisos.length === 0) return null;

  return (
    <div className="fixed top-3 left-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 flex-col gap-2">
      {avisos.map((aviso) => (
        <div
          key={aviso.id}
          className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md ${
            aviso.tono === "oferta"
              ? "border-[#C5A55A]/50 bg-[#1E1B15]/95 text-[#E8D5A3]"
              : "border-white/10 bg-[#141721]/95 text-gray-100"
          }`}
        >
          <div className="text-sm font-bold">{aviso.titulo}</div>
          <div className="mt-0.5 text-xs text-gray-300">{aviso.detalle}</div>
        </div>
      ))}
    </div>
  );
}
