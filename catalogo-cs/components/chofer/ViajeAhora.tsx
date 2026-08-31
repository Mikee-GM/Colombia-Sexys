"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, MapPin, Route } from "lucide-react";
import { toast } from "sonner";

import { marcarLlegadaDelViaje } from "@/lib/actions/driver-portal";
import type { DriverPortalActiveTrip } from "@/lib/types";

/**
 * Lo primero que ve el chofer al abrir el portal: el viaje que tiene ahora.
 *
 * Antes esto aparecia dos veces, en resumen y en viajes, y en las dos por
 * debajo de las ganancias, asi que quien abria la aplicacion en mitad de un
 * viaje tenia que buscarlo. Ahora esta por encima de las pestañas.
 *
 * El avance del viaje se marca desde aqui, sin tener que buscar el mensaje
 * correcto en el chat justo cuando va conduciendo. Los botones del bot siguen
 * valiendo: los dos caminos llaman al mismo servicio del backend, asi que no
 * pueden divergir. De momento esta la llegada; recogida y fin siguen solo en
 * el chat.
 */
export default function ViajeAhora({
  viaje,
  zonaLabel,
}: {
  viaje: DriverPortalActiveTrip | null;
  zonaLabel: Record<string, string>;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function marcarLlegada(tripId: string) {
    startTransition(async () => {
      const resultado = await marcarLlegadaDelViaje(tripId);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Llegada marcada. Ya avisamos a la empleada.");
      router.refresh();
    });
  }

  if (!viaje) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3.5">
        <CheckCircle2 size={18} className="shrink-0 text-gray-600" />
        <p className="text-sm text-gray-400">No tienes ningún viaje ahora mismo.</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/40 to-black shadow-lg">
      <header className="flex items-center justify-between gap-3 border-b border-emerald-500/20 px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Viaje en curso
          </span>
        </span>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          {viaje.estado.replaceAll("_", " ")}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-px bg-white/5">
        <div className="bg-black/40 px-3 py-3 text-center">
          <span className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
            <MapPin size={14} />
            Zona
          </span>
          <span className="mt-1 block truncate text-sm font-bold text-white">
            {zonaLabel[viaje.zona] || viaje.zona}
          </span>
        </div>
        <div className="bg-black/40 px-3 py-3 text-center">
          <span className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
            <Route size={14} />
            Tramo
          </span>
          <span className="mt-1 block truncate text-sm font-bold capitalize text-white">
            {viaje.tipo}
          </span>
        </div>
      </div>

      {viaje.estado === "aceptado" ? (
        <div className="px-4 py-4">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => marcarLlegada(viaje.id)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 py-4 text-xs font-bold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500 hover:text-black disabled:opacity-50"
          >
            <MapPin size={17} />
            {pendiente ? "Marcando..." : "Ya llegué al punto de recogida"}
          </button>
          <p className="mt-2.5 text-center text-[11px] text-gray-500">
            Al marcarlo le avisamos a la empleada con los datos de tu coche.
          </p>
        </div>
      ) : (
        <p className="px-4 py-3 text-center text-[11px] text-gray-400">
          Los siguientes pasos del viaje se marcan desde tu chat de Telegram.
        </p>
      )}
    </section>
  );
}
