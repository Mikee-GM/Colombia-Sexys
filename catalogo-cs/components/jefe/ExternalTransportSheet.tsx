"use client";

import { useState, useTransition } from "react";
import { ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

import { assignExternalTransport } from "@/lib/actions/jefe-panel";
import type { Trip } from "@/lib/types";

type ExternalTransportSheetProps = {
  serviceId: string;
  trip?: Trip;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

const PLATFORMS = ["Uber", "DiDi", "Otro"] as const;

export default function ExternalTransportSheet({
  serviceId,
  trip,
  onClose,
  onSaved,
}: ExternalTransportSheetProps) {
  const [platformChoice, setPlatformChoice] = useState<
    (typeof PLATFORMS)[number]
  >(
    trip?.externalPlatform &&
      PLATFORMS.includes(trip.externalPlatform as (typeof PLATFORMS)[number])
      ? (trip.externalPlatform as (typeof PLATFORMS)[number])
      : "Uber",
  );
  const [customPlatform, setCustomPlatform] = useState(
    trip?.externalPlatform && !PLATFORMS.includes(trip.externalPlatform as (typeof PLATFORMS)[number])
      ? trip.externalPlatform
      : "",
  );
  const [sharedLink, setSharedLink] = useState(trip?.externalSharedLink ?? "");
  const [amount, setAmount] = useState(
    trip && Number(trip.tarifa) > 0 ? String(trip.tarifa) : "",
  );
  const [saving, startSaving] = useTransition();

  const platform =
    platformChoice === "Otro" ? customPlatform.trim() : platformChoice;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!platform) {
      toast.error("Indica la plataforma");
      return;
    }
    if (!sharedLink.trim() || !/^https:\/\/[^\s]+$/i.test(sharedLink.trim())) {
      toast.error("Pega un enlace HTTPS válido");
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Ingresa un costo mayor que cero");
      return;
    }

    startSaving(async () => {
      const result = await assignExternalTransport(serviceId, {
        platform,
        sharedLink: sharedLink.trim(),
        amount: numericAmount,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Transporte externo asignado");
      onClose();
      await onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/85 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-transport-title"
        className="flex max-h-[100dvh] w-full flex-col overflow-y-auto rounded-t-3xl border border-[#C5A55A]/45 bg-[#080808] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
              Viaje de {trip?.tipo ?? "regreso"}
            </p>
            <h2
              id="external-transport-title"
              className="mt-1 font-heading text-2xl text-white"
            >
              Asignar transporte externo
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Al enviar estos datos el viaje queda asignado. No necesitas subir
              ninguna captura.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-xl border border-zinc-800 p-2 text-zinc-500 hover:text-white"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
              Plataforma
            </span>
            <select
              value={platformChoice}
              onChange={(event) =>
                setPlatformChoice(event.target.value as (typeof PLATFORMS)[number])
              }
              className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-black px-4 text-base text-white outline-none focus:border-[#C5A55A]"
            >
              {PLATFORMS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          {platformChoice === "Otro" && (
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
                Nombre de la plataforma
              </span>
              <input
                value={customPlatform}
                onChange={(event) => setCustomPlatform(event.target.value)}
                maxLength={50}
                autoComplete="organization"
                className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-black px-4 text-base text-white outline-none focus:border-[#C5A55A]"
                placeholder="Nombre"
              />
            </label>
          )}

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
              Link compartido del viaje
            </span>
            <input
              type="url"
              inputMode="url"
              required
              value={sharedLink}
              onChange={(event) => setSharedLink(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="https://..."
              className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-black px-4 text-base text-white outline-none focus:border-[#C5A55A]"
            />
            <span className="mt-1 flex items-center gap-1 text-[11px] text-zinc-600">
              <ExternalLink size={12} /> Solo se acepta HTTPS
            </span>
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
              Costo
            </span>
            <div className="mt-2 flex items-center rounded-xl border border-zinc-800 bg-black focus-within:border-[#C5A55A]">
              <span className="pl-4 text-zinc-500">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="min-h-12 w-full bg-transparent px-3 text-base text-white outline-none"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="sticky bottom-0 mt-3 flex min-h-14 w-full items-center justify-center rounded-xl bg-[#C5A55A] px-4 text-sm font-bold uppercase tracking-wider text-black shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Enviar viaje"}
          </button>
        </form>
      </section>
    </div>
  );
}
