"use client";

import { CheckCircle2, MapPin, Route } from "lucide-react";

import type { DriverPortalActiveTrip } from "@/lib/types";

/**
 * Lo primero que ve el chofer al abrir el portal: el viaje que tiene ahora.
 *
 * Antes esto aparecia dos veces, en resumen y en viajes, y en las dos por
 * debajo de las ganancias, asi que quien abria la aplicacion en mitad de un
 * viaje tenia que buscarlo. Ahora esta por encima de las pestañas.
 *
 * Todavia no lleva botones: el avance del viaje --llegue, recogi, termine--
 * solo existe hoy en el chat del bot, y el portal del chofer no publica
 * ninguna accion en el backend. Cuando esos endpoints existan, van aqui.
 */
export default function ViajeAhora({
  viaje,
  zonaLabel,
}: {
  viaje: DriverPortalActiveTrip | null;
  zonaLabel: Record<string, string>;
}) {
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

      <p className="px-4 py-3 text-center text-[11px] text-gray-400">
        Marca el avance del viaje desde tu chat de Telegram.
      </p>
    </section>
  );
}
