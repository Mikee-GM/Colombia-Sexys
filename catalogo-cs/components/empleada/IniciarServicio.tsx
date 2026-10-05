"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Play } from "lucide-react";

import { iniciarMiServicio } from "@/lib/actions/employee-portal";

export default function IniciarServicio({
  servicioId,
  token,
}: {
  servicioId: string;
  token?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await iniciarMiServicio(servicioId, token);
            if (!result.success) {
              setError(result.error ?? "No se pudo iniciar el servicio");
              return;
            }
            router.refresh();
          })
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-4 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-50"
      >
        <Play size={17} />
        {pending ? "Iniciando" : "Iniciar servicio"}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
