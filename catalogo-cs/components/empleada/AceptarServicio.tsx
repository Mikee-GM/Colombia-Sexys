"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";

import { responderServicioAsignado } from "@/lib/actions/employee-portal";

export default function AceptarServicio({
  servicioId,
  expiraAt,
  token,
}: {
  servicioId: string;
  expiraAt?: string | null;
  token?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const responder = (decision: "accept" | "reject") => {
    setError(null);
    startTransition(async () => {
      const result = await responderServicioAsignado(
        servicioId,
        decision,
        token,
      );
      if (!result.success) {
        setError(result.error ?? "No se pudo registrar tu respuesta");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-[#C5A55A]/35 bg-[#C5A55A]/[0.06] p-4">
      <div>
        <p className="text-sm font-semibold text-white">
          Confirma si puedes realizar este servicio
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Revisa duración, lugar e indicaciones antes de responder.
          {expiraAt ? ` Responde antes de ${formatTime(expiraAt)}.` : ""}
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => responder("accept")}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C5A55A] px-4 py-3.5 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-50"
      >
        <Check size={17} />
        {pending ? "Registrando" : "Aceptar"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => responder("reject")}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/40 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-red-300 disabled:opacity-50"
      >
        <X size={16} />
        No puedo realizarlo
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
