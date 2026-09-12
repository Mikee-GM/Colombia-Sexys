"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, MapPin, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { marcarListaParaSalir } from "@/lib/actions/employee-portal";
import type { EmployeePortalActiveService } from "@/lib/types";

/**
 * El aviso de que ya puede salir, con lo que necesita saber antes de decirlo.
 *
 * Es el paso que se metió entre que el jefe autoriza y se pide el Uber. Antes
 * el coche salía en el mismo instante de la autorización: llegaba mientras ella
 * se estaba arreglando y esperaba con el taxímetro corriendo, o había que
 * cancelarlo y pedir otro. Ahora el enlace del Uber no existe hasta que ella
 * toca este botón, así que aquí van también los datos con los que decide cuánto
 * tarda: a dónde va, la habitación y lo que dejó dicho el jefe.
 *
 * Se pide confirmación porque detrás del botón hay un coche que sale de
 * verdad: tocarlo sin querer la deja con el Uber esperando abajo.
 */
export default function MarcarLista({
  servicio,
  token,
}: {
  servicio: EmployeePortalActiveService;
  token?: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function avisar() {
    startTransition(async () => {
      const resultado = await marcarListaParaSalir(servicio.id, token);
      if (!resultado.success) {
        toast.error(resultado.error ?? "No se pudo avisar");
        return;
      }
      toast.success(
        resultado.yaEstaba
          ? "Ya habíamos avisado. Tu Uber viene en camino."
          : "Listo, ya avisamos. En un momento tienes tu Uber.",
      );
      setConfirmando(false);
      router.refresh();
    });
  }

  const destino = [servicio.destino, servicio.destinoDireccion]
    .filter(Boolean)
    .join(" - ");

  return (
    <section className="rounded-xl border border-[#C5A55A]/40 bg-[#C5A55A]/[0.06] p-4">
      <header className="flex items-center gap-2">
        <BellRing size={16} className="shrink-0 text-[#C5A55A]" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#E8D5A3]">
          Alístate con calma
        </h3>
      </header>

      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
        Tu servicio ya está autorizado. El Uber se pide cuando toques el botón,
        no antes, para que no te espere abajo mientras te arreglas.
      </p>

      {(destino || servicio.habitacion) && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-gray-300">
          <MapPin size={14} className="mt-0.5 shrink-0 text-[#C5A55A]" />
          <span>
            {destino || "Ubicación compartida por el cliente"}
            {servicio.habitacion && (
              <span className="block text-gray-500">{`Habitación ${servicio.habitacion}`}</span>
            )}
          </span>
        </p>
      )}

      {servicio.notasJefe && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-gray-300">
          <StickyNote size={14} className="mt-0.5 shrink-0 text-[#C5A55A]" />
          <span>
            <span className="block text-[10px] uppercase tracking-wider text-gray-500">
              Notas del jefe
            </span>
            {servicio.notasJefe}
          </span>
        </p>
      )}

      {confirmando ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => setConfirmando(false)}
            className="rounded-lg border border-white/10 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
          >
            Todavía no
          </button>
          <button
            type="button"
            disabled={pendiente}
            aria-busy={pendiente}
            onClick={avisar}
            className="rounded-lg bg-[#C5A55A] py-2.5 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-[#E8D5A3] disabled:opacity-50"
          >
            {pendiente ? "Avisando" : "Sí, pide mi Uber"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C5A55A] py-3.5 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-[#E8D5A3]"
        >
          Ya estoy lista
        </button>
      )}
    </section>
  );
}
