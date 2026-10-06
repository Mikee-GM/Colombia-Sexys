"use client";

import { useState, useTransition } from "react";
import { Siren } from "lucide-react";
import { toast } from "sonner";

import { activarPanicoServicio } from "@/lib/actions/employee-portal";

export default function BotonPanico({
  servicioId,
  token,
}: {
  servicioId: string;
  token?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function activar() {
    startTransition(async () => {
      const result = await activarPanicoServicio(servicioId, token);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Emergencia registrada. Coordinación fue notificada.", {
        duration: 8000,
      });
      setConfirmando(false);
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/70 bg-red-600/15 py-3.5 text-sm font-extrabold uppercase tracking-wider text-red-300"
      >
        <Siren size={19} />
        Botón de pánico
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-red-500 bg-red-950/60 p-3">
      <p className="text-center text-sm font-bold text-red-100">
        ¿Necesitas ayuda inmediata?
      </p>
      <p className="mt-1 text-center text-[11px] text-red-200/75">
        Se registrará la emergencia y se avisará a coordinación.
      </p>
      <button
        type="button"
        disabled={pendiente}
        onClick={activar}
        className="mt-3 w-full rounded-lg bg-red-600 py-3.5 text-sm font-black uppercase tracking-wider text-white disabled:opacity-60"
      >
        {pendiente ? "Registrando…" : "Sí, activar emergencia"}
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => setConfirmando(false)}
        className="mt-1.5 w-full py-2 text-xs text-red-200/70"
      >
        Cancelar
      </button>
    </div>
  );
}
