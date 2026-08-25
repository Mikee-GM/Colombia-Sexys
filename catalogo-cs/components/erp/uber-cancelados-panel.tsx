"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Panel, RecordLink, StatusBadge } from "@/components/erp/primitives";
import {
  settleCancellationCost,
  updateCancellationDetails,
  type PendingCancellationCost,
} from "@/app/admin/transport/actions";
import {
  CANCELLATION_REASON_LABEL,
  SELECTABLE_CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/cancellation-reasons";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

function fecha(iso: string | null) {
  if (!iso) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "Sin fecha";
  }
}

/**
 * Bandeja de Ubers de servicios cancelados sin costo cerrado.
 *
 * Un Uber ya pedido se paga aunque el servicio no ocurra, y como el servicio
 * nunca se finaliza ese gasto no llegaba a ningun corte: en la ficha quedaba
 * un cobro de transporte contra un costo de cero. Aqui la oficina cierra cada
 * viaje diciendo cuanto costo de verdad y quien lo asume.
 */
export default function UberCanceladosPanel({
  initial,
}: {
  initial: PendingCancellationCost[];
}) {
  const [pendientes, setPendientes] = useState(initial);
  const [pending, startTransition] = useTransition();

  const quitar = (id: string) =>
    setPendientes((prev) => prev.filter((item) => item.id !== id));

  return (
    <Panel
      title="Ubers de servicios cancelados"
      subtitle="viajes - cancelado_con_costo"
      action={
        <StatusBadge tone={pendientes.length > 0 ? "red" : "green"}>
          {pendientes.length > 0
            ? `${pendientes.length} por cerrar`
            : "Todo cerrado"}
        </StatusBadge>
      }
    >
      {pendientes.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          No hay traslados de servicios cancelados con el costo sin cerrar.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[12px] leading-relaxed text-amber-300/90">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Estos viajes ya estaban despachados cuando se cancelo el servicio.
              Registra el costo real del Uber, o cierra en cero si nunca llego a
              salir, e indica si ese monto se le cobra al cliente. Hasta que se
              cierren, el gasto no aparece en ningun corte.
            </p>
          </div>

          {pendientes.map((trip) => (
            <ViajeCard
              key={trip.id}
              trip={trip}
              pending={pending}
              startTransition={startTransition}
              onSettled={() => quitar(trip.id)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function ViajeCard({
  trip,
  pending,
  startTransition,
  onSettled,
}: {
  trip: PendingCancellationCost;
  pending: boolean;
  startTransition: (fn: () => void) => void;
  onSettled: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [cobrarAlCliente, setCobrarAlCliente] = useState(false);
  const [motivo, setMotivo] = useState<CancellationReason | "">(
    trip.motivoCancelacion ?? "",
  );
  const [nota, setNota] = useState(trip.notaCancelacion ?? "");
  const [motivoGuardado, setMotivoGuardado] = useState(
    Boolean(trip.motivoCancelacion),
  );

  const guardarMotivo = () => {
    if (pending || !motivo) return;

    startTransition(async () => {
      const result = await updateCancellationDetails(
        trip.servicioId,
        motivo,
        nota,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setMotivoGuardado(true);
      toast.success("Motivo de la cancelacion guardado");
    });
  };

  const cerrarCosto = (amount: number) => {
    if (pending) return;

    startTransition(async () => {
      const result = await settleCancellationCost(
        trip.id,
        amount,
        amount > 0 && cobrarAlCliente,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onSettled();
      toast.success(
        amount === 0
          ? "Viaje cerrado sin costo"
          : cobrarAlCliente
            ? "Costo registrado y cargado al cliente"
            : "Costo registrado, lo absorbe la casa",
      );
    });
  };

  const cerrarConMonto = () => {
    const amount = Number(monto);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Ingresa el costo real del Uber");
      return;
    }
    cerrarCosto(amount);
  };

  return (
    <article className="rounded-xl border border-zinc-800 bg-black p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <RecordLink href={`/admin/services/${trip.servicioId}`}>
            {trip.empleadaNombre ?? "Servicio cancelado"}
          </RecordLink>
          <p className="mt-1 text-[11px] text-zinc-500">
            Viaje de {trip.tipo} - cancelado el {fecha(trip.canceladoAt)}
          </p>
        </div>

        {trip.uberScreenshotUrl ? (
          <a
            href={trip.uberScreenshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#C5A55A] hover:text-[#E8D5A3]"
          >
            Ver captura
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <StatusBadge tone="red">Sin captura</StatusBadge>
        )}
      </header>

      {/* Motivo editable: los servicios cancelados antes de que existiera el
          campo llegan sin motivo, y en una cancelacion apurada se elige mal. */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-[190px] flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A55A]">
            Motivo de la cancelacion
          </span>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as CancellationReason)}
            className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-[13px] text-white outline-none focus:border-[#C5A55A]"
          >
            <option value="">Sin registrar</option>
            {SELECTABLE_CANCELLATION_REASONS.map((value) => (
              <option key={value} value={value}>
                {CANCELLATION_REASON_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[190px] flex-[2]">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A55A]">
            Detalle, opcional
          </span>
          <input
            value={nota}
            maxLength={500}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Que paso exactamente"
            className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-[13px] text-white outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
          />
        </label>

        <button
          type="button"
          disabled={pending || !motivo}
          onClick={guardarMotivo}
          className="rounded-lg border border-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.04em] text-zinc-300 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A] disabled:opacity-40"
        >
          {motivoGuardado ? "Actualizar motivo" : "Guardar motivo"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-800/60 pt-4">
        <input
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          inputMode="decimal"
          placeholder="Costo del Uber"
          className="w-36 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-[13px] text-white outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
        />

        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-300">
          <input
            type="checkbox"
            checked={cobrarAlCliente}
            onChange={(e) => setCobrarAlCliente(e.target.checked)}
            className="h-4 w-4 accent-[#C5A55A]"
          />
          Cobrarle este monto al cliente
        </label>

        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={cerrarConMonto}
            className="rounded-lg border border-[#C5A55A]/40 bg-[#C5A55A]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.04em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20 disabled:opacity-50"
          >
            Registrar costo
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => cerrarCosto(0)}
            className="rounded-lg border border-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.04em] text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
            title="El viaje nunca salio y no costo nada"
          >
            Sin costo
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-zinc-500">
        {cobrarAlCliente
          ? "El monto entra al corte como transporte cobrado al cliente."
          : "El monto entra al corte como gasto de transporte de la casa."}
      </p>
    </article>
  );
}
