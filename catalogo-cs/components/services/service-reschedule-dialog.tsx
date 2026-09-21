"use client";

import { useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { rescheduleServiceAction } from "@/lib/data/services";
import {
  APP_LOCALE,
  APP_TIME_ZONE,
  desdeHoraDelNegocio,
  paraInputDeFechaHora,
} from "@/lib/locale";

/**
 * Mover una cita a otra fecha y hora.
 *
 * Existe porque hasta ahora una hora mal tomada solo se podia arreglar
 * cancelando el servicio y rehaciendolo, lo que pierde el hilo con el cliente
 * y el historial de la modelo.
 *
 * El campo es un `datetime-local`, que no entiende zonas: trabaja con texto en
 * hora de pared. Tanto el valor inicial como el que se manda pasan por los
 * helpers de `lib/locale`, para que ese texto signifique siempre hora de
 * Mexico y no la del equipo desde el que se esta capturando.
 */
export default function ServiceRescheduleDialog({
  serviceId,
  fechaActual,
  nombreEmpleada,
  onClose,
  onRescheduled,
}: {
  serviceId: string;
  /** La hora que tiene ahora la cita, en ISO. `null` si era un servicio inmediato. */
  fechaActual: string | null;
  nombreEmpleada: string;
  onClose: () => void;
  onRescheduled: () => void;
}) {
  const [cuando, setCuando] = useState(() =>
    paraInputDeFechaHora(
      fechaActual ? new Date(fechaActual) : new Date(Date.now() + 60 * 60_000),
    ),
  );
  const [avisarCliente, setAvisarCliente] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const nuevaFecha = desdeHoraDelNegocio(cuando);
  const enElPasado = nuevaFecha !== null && nuevaFecha.getTime() <= Date.now();

  const anterior = fechaActual
    ? new Date(fechaActual).toLocaleString(APP_LOCALE, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIME_ZONE,
      })
    : null;

  const guardar = async () => {
    if (!nuevaFecha) {
      toast.error("Elige una fecha y una hora válidas");
      return;
    }
    if (enElPasado) {
      toast.error("La nueva hora tiene que estar en el futuro");
      return;
    }

    setGuardando(true);
    const resultado = await rescheduleServiceAction(
      serviceId,
      nuevaFecha.toISOString(),
      avisarCliente,
    );
    setGuardando(false);

    if (!resultado.success) {
      toast.error(resultado.error || "No se pudo reprogramar la cita");
      return;
    }

    toast.success("Cita reprogramada");
    onRescheduled();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !guardando && onClose()
      }
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reprogramar-titulo"
        className="w-full max-w-lg rounded-2xl border border-[#C5A55A]/40 bg-[#050505] p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
              Reprogramar
            </p>
            <h2 id="reprogramar-titulo" className="mt-1 font-heading text-3xl">
              {nombreEmpleada}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            aria-label="Cerrar"
            className="rounded-lg border border-zinc-800 p-2 text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {anterior && (
          <p className="mt-5 rounded-xl border border-zinc-800 bg-black p-4 text-sm text-zinc-400">
            Ahora está para el{" "}
            <span className="text-[#E8D5A3]">{anterior}</span>.
          </p>
        )}

        <label className="mt-5 block">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
            <CalendarClock size={13} />
            Nueva fecha y hora
          </span>
          <input
            type="datetime-local"
            value={cuando}
            onChange={(event) => setCuando(event.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#C5A55A]"
          />
          <span className="mt-2 block text-xs text-zinc-600">
            Hora de Ciudad de México, la misma con la que corre la agenda.
          </span>
        </label>

        {enElPasado && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Esa hora ya pasó. Elige una en el futuro.
          </p>
        )}

        <label className="mt-5 flex items-start gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={avisarCliente}
            onChange={(event) => setAvisarCliente(event.target.checked)}
            className="mt-0.5 accent-[#C5A55A]"
          />
          <span>
            Avisar al cliente por Telegram
            <span className="mt-1 block text-xs text-zinc-600">
              Quítalo solo si estás corrigiendo una captura y el cliente nunca
              llegó a ver la hora equivocada.
            </span>
          </span>
        </label>

        <div className="mt-6 flex justify-end gap-3 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="rounded-xl border border-zinc-800 px-5 py-3 text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || enElPasado || !nuevaFecha}
            aria-busy={guardando}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C5A55A] px-5 py-3 text-xs font-bold uppercase tracking-wider text-black transition-opacity disabled:opacity-50"
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            Guardar la nueva hora
          </button>
        </div>
      </section>
    </div>
  );
}
