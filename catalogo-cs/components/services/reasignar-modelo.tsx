"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundCog } from "lucide-react";
import { toast } from "sonner";


/**
 * Mueve un servicio a otra modelo sin cancelarlo.
 *
 * Es el cambio de ultimo momento: se enferma media hora antes, con el cliente
 * ya habiendo pagado por transferencia. Hasta ahora la unica salida era
 * cancelar y volver a crear, lo que pierde la conversacion con el cliente, el
 * historico y el anticipo: habia que devolver y volver a cobrar, o dejar el
 * dinero descuadrado entre dos servicios.
 *
 * Solo aparecen las modelos libres. Reasignar a una que ya esta ocupada recrea
 * el problema que se venia a resolver, y el backend lo rechaza igualmente.
 *
 * La accion la pone quien monta el componente: el panel del jefe comprueba
 * ademas que el servicio sea de su equipo, y el de admin no.
 */

/** Lo minimo que exige el backend. Se avisa antes de mandar, no despues. */
const MINIMO_MOTIVO = 10;

export type ModeloDisponible = {
  id: string;
  nombreArtistico: string;
  disponible?: boolean | null;
};

export default function ReasignarModelo({
  servicioId,
  empleadaActualId,
  modelos,
  reasignar: reasignarServicio,
  onReasignado,
}: {
  servicioId: string;
  empleadaActualId: string;
  modelos: ModeloDisponible[];
  reasignar: (
    servicioId: string,
    empleadaId: string,
    motivo: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onReasignado?: () => void;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  const candidatas = modelos.filter(
    (modelo) => modelo.id !== empleadaActualId && modelo.disponible !== false,
  );

  function cerrar() {
    setAbierto(false);
    setDestino("");
    setMotivo("");
  }

  function reasignar() {
    if (!destino) {
      toast.error("Elige a quién pasa el servicio.");
      return;
    }
    const texto = motivo.trim();
    if (texto.length < MINIMO_MOTIVO) {
      toast.error("Escribe por qué se cambia de modelo.");
      return;
    }
    startTransition(async () => {
      const resultado = await reasignarServicio(servicioId, destino, texto);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Servicio reasignado. Se avisó a las dos.");
      cerrar();
      onReasignado?.();
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
      >
        <UserRoundCog size={16} />
        Pasar a otra modelo
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/[0.05] p-3.5">
      <p className="mb-3 text-[11px] leading-relaxed text-gray-400">
        El precio pactado con el cliente no cambia. Se avisa a las dos y queda
        anotado de quién venía.
      </p>

      {candidatas.length === 0 ? (
        <p className="mb-3 text-xs text-gray-500">
          No hay ninguna modelo libre ahora mismo.
        </p>
      ) : (
        <>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Pasa a
          </label>
          <select
            value={destino}
            onChange={(evento) => setDestino(evento.target.value)}
            className="mb-3 w-full rounded-lg border border-zinc-800 bg-black/60 px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-[#C5A55A]"
          >
            <option value="">Elige a quién</option>
            {candidatas.map((modelo) => (
              <option key={modelo.id} value={modelo.id}>
                {modelo.nombreArtistico}
              </option>
            ))}
          </select>
        </>
      )}

      <textarea
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Por qué se cambia de modelo"
        className="mb-3 w-full resize-none rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={cerrar}
          className="rounded-lg border border-white/10 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente || candidatas.length === 0}
          onClick={reasignar}
          className="rounded-lg border border-[#C5A55A]/50 py-2.5 text-xs font-bold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
        >
          {pendiente ? "Pasando" : "Reasignar"}
        </button>
      </div>
    </div>
  );
}
