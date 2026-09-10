"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Car, Check, MapPin, X } from "lucide-react";
import { toast } from "sonner";

import {
  aceptarOfertaDeViaje,
  rechazarOfertaDeViaje,
} from "@/lib/actions/driver-portal";
import PuntoDelViaje, {
  detalleDelDestino,
} from "@/components/chofer/PuntoDelViaje";
import type { DriverPortalOffer } from "@/lib/types";

/**
 * Una oferta de viaje esperando respuesta.
 *
 * Hasta ahora la unica forma de aceptar un viaje era ver el mensaje del bot a
 * tiempo: si no lo veia, el viaje se quedaba sin chofer y no habia segunda
 * via. Esta es esa segunda via.
 *
 * Va por encima de todo lo demas y con la cuenta atras a la vista, porque es
 * lo unico de esta pantalla que caduca.
 */
export default function OfertaDeViaje({
  oferta,
}: {
  oferta: DriverPortalOffer;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    if (!oferta.expiraEn) return;
    const limite = new Date(oferta.expiraEn).getTime();

    function tic() {
      setRestante(Math.max(0, Math.round((limite - Date.now()) / 1000)));
    }
    tic();
    const reloj = setInterval(tic, 1000);
    return () => clearInterval(reloj);
  }, [oferta.expiraEn]);

  function responder(
    accion: () => Promise<{
      success: boolean;
      error?: string;
      aceptado?: boolean;
      rechazado?: boolean;
    }>,
  ) {
    startTransition(async () => {
      const resultado = await accion();
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      /*
       * Ni `aceptado: false` ni `rechazado: false` son fallos: la misma oferta
       * va a varios choferes y puede haber dejado de ser suya. Se dice tal
       * cual, que es menos confuso que un error.
       */
      if (resultado.aceptado === false) {
        toast.error("Otro chofer tomó este viaje primero.");
      } else if (resultado.aceptado) {
        toast.success("Viaje asignado. Ya avisamos a la empleada.");
      } else if (resultado.rechazado === false) {
        toast.error("Esa oferta ya no está disponible.");
      } else if (resultado.rechazado) {
        toast.success("Oferta rechazada. Se la ofrecemos a otro chofer.");
      }
      router.refresh();
    });
  }

  const agotada = restante !== null && restante <= 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-[#C5A55A] bg-gradient-to-b from-[#C5A55A]/[0.12] to-black shadow-lg">
      <header className="flex items-center justify-between gap-3 border-b border-[#C5A55A]/30 px-4 py-3">
        <span className="flex items-center gap-2">
          <Car size={16} className="text-[#C5A55A]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#C5A55A]">
            Viaje disponible
          </span>
        </span>
        {restante !== null && (
          <span className="text-xs font-bold tabular-nums text-[#E8D5A3]">
            {agotada
              ? "Expirada"
              : `${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}`}
          </span>
        )}
      </header>

      <div className="flex items-center gap-2 px-4 py-3.5 text-sm">
        <MapPin size={15} className="shrink-0 text-gray-500" />
        <span className="text-gray-300">
          <span className="font-semibold text-white">{oferta.zona}</span>
          {" · "}
          <span className="capitalize">{oferta.tipo}</span>
        </span>
      </div>

      {/*
        Donde recoge y a donde lleva, antes de decidir. Sin esto la unica pista
        era la zona, y para saber si le queda cerca habia que aceptar primero o
        volver al chat a buscar el enlace del bot.
      */}
      <div className="flex flex-col gap-2.5 px-4 pb-3.5">
        <PuntoDelViaje
          etiqueta="Recogida"
          lat={oferta.recogidaLat}
          lng={oferta.recogidaLng}
          detalle={oferta.tipo === "regreso" ? detalleDelDestino(oferta) : null}
        />
        <PuntoDelViaje
          etiqueta="Destino"
          lat={oferta.destinoLat}
          lng={oferta.destinoLng}
          detalle={oferta.tipo === "ida" ? detalleDelDestino(oferta) : null}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-4 pb-4">
        <button
          type="button"
          disabled={pendiente || agotada}
          aria-busy={pendiente}
          onClick={() => responder(() => aceptarOfertaDeViaje(oferta.id))}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#C5A55A] py-4 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-[#d8b769] disabled:opacity-50"
        >
          <Check size={17} />
          {pendiente ? "..." : "Aceptar"}
        </button>
        <button
          type="button"
          disabled={pendiente}
          aria-busy={pendiente}
          onClick={() => responder(() => rechazarOfertaDeViaje(oferta.id))}
          className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
        >
          <X size={17} />
          Rechazar
        </button>
      </div>
    </section>
  );
}
