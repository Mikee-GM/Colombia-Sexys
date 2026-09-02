"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CarFront } from "lucide-react";
import { toast } from "sonner";

import { reasignarChoferAction } from "@/lib/data/services";

/**
 * Mueve un viaje a otro chofer.
 *
 * El asignado no aparece, se le averia el coche o simplemente no responde.
 * Hasta ahora la unica salida era cancelar el viaje --con lo que arrastra en el
 * costo y en la liquidacion-- para volver a despacharlo.
 *
 * No aparece sobre un viaje cerrado: uno finalizado ya se pago o esta a punto
 * de entrar en un corte, y cambiarle el chofer moveria dinero de una semana a
 * otra sin que nadie lo decidiera.
 */

export type ChoferDisponible = {
  id: string;
  nombre: string;
  disponible?: boolean | null;
};

/** El minimo que exige el backend. Se avisa antes de mandar, no despues. */
const MINIMO_MOTIVO = 10;

export default function ReasignarChofer({
  tripId,
  estadoActual,
  choferActualId,
  choferes,
}: {
  tripId: string;
  estadoActual: string;
  choferActualId?: string | null;
  choferes: ChoferDisponible[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  if (estadoActual === "finalizado" || estadoActual === "cancelado") return null;

  const candidatos = choferes.filter(
    (chofer) => chofer.id !== choferActualId && chofer.disponible !== false,
  );
  if (candidatos.length === 0) return null;

  function cerrar() {
    setAbierto(false);
    setDestino("");
    setMotivo("");
  }

  function reasignar() {
    if (!destino) {
      toast.error("Elige a qué chofer pasa el viaje.");
      return;
    }
    const texto = motivo.trim();
    if (texto.length < MINIMO_MOTIVO) {
      toast.error("Escribe por qué se cambia de chofer.");
      return;
    }
    startTransition(async () => {
      const resultado = await reasignarChoferAction(tripId, destino, texto);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Viaje reasignado. Se avisó a los dos.");
      cerrar();
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Pasar el viaje a otro chofer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
      >
        <CarFront size={12} />
        Otro chofer
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#C5A55A]/30 bg-[#C5A55A]/[0.05] p-2.5">
      <select
        value={destino}
        onChange={(evento) => setDestino(evento.target.value)}
        className="w-full rounded-lg border border-zinc-800 bg-black/60 px-2.5 py-2 text-[11px] text-zinc-200 outline-none focus:border-[#C5A55A]"
      >
        <option value="">Pasa a</option>
        {candidatos.map((chofer) => (
          <option key={chofer.id} value={chofer.id}>
            {chofer.nombre}
          </option>
        ))}
      </select>

      <textarea
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Por qué se cambia"
        className="w-full resize-none rounded-lg border border-zinc-800 bg-black/60 px-2.5 py-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={cerrar}
          className="rounded-lg border border-zinc-800 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={reasignar}
          className="rounded-lg border border-[#C5A55A]/50 py-2 text-[10px] font-bold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
        >
          {pendiente ? "Pasando" : "Reasignar"}
        </button>
      </div>
    </div>
  );
}
