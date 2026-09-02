"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { toast } from "sonner";

import { corregirEstadoDeViaje } from "@/lib/data/services";

/**
 * Deshace un dedazo en el estado de un viaje.
 *
 * Los estados de un viaje solo avanzan y solo los mueve el chofer desde su
 * portal o el chat. Un toque equivocado --marcar "ya recogi" antes de tiempo--
 * no se podia deshacer desde ningun sitio, y el resto del flujo seguia adelante
 * con el dato malo: el cliente recibiendo avisos que no corresponden y el
 * tiempo del viaje contando desde una hora que no fue.
 *
 * Deliberadamente estrecha: no sirve para operar el viaje. No ofrece finalizar
 * ni cancelar, que tienen su propio camino con su costo y su liquidacion, y no
 * aparece sobre un viaje ya cerrado.
 */

/** Los estados a los que se puede volver, con el nombre que se usa hablando. */
const ESTADOS = [
  { valor: "aceptado", texto: "Aceptado, sin salir" },
  { valor: "en_camino", texto: "En camino" },
  { valor: "llegado", texto: "Llegó al punto" },
  { valor: "en_curso", texto: "Con la modelo a bordo" },
] as const;

/** El minimo que exige el backend. Se avisa antes de mandar, no despues. */
const MINIMO_MOTIVO = 10;

export default function CorregirEstadoViaje({
  tripId,
  estadoActual,
}: {
  tripId: string;
  estadoActual: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  // Un viaje cerrado no se corrige: se deshace por su propio camino.
  if (estadoActual === "finalizado" || estadoActual === "cancelado") return null;

  function cerrar() {
    setAbierto(false);
    setEstado("");
    setMotivo("");
  }

  function corregir() {
    if (!estado) {
      toast.error("Elige en qué estado debería estar.");
      return;
    }
    const texto = motivo.trim();
    if (texto.length < MINIMO_MOTIVO) {
      toast.error("Escribe por qué hay que corregirlo.");
      return;
    }
    startTransition(async () => {
      const resultado = await corregirEstadoDeViaje(
        tripId,
        estado as (typeof ESTADOS)[number]["valor"],
        texto,
      );
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Estado corregido. Queda anotado quién lo hizo.");
      cerrar();
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Corregir el estado a mano"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
      >
        <Wrench size={12} />
        Corregir
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#C5A55A]/30 bg-[#C5A55A]/[0.05] p-2.5">
      <select
        value={estado}
        onChange={(evento) => setEstado(evento.target.value)}
        className="w-full rounded-lg border border-zinc-800 bg-black/60 px-2.5 py-2 text-[11px] text-zinc-200 outline-none focus:border-[#C5A55A]"
      >
        <option value="">Debería estar en</option>
        {ESTADOS.filter((opcion) => opcion.valor !== estadoActual).map(
          (opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ),
        )}
      </select>

      <textarea
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Qué pasó"
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
          onClick={corregir}
          className="rounded-lg border border-[#C5A55A]/50 py-2 text-[10px] font-bold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
        >
          {pendiente ? "Guardando" : "Corregir"}
        </button>
      </div>
    </div>
  );
}
