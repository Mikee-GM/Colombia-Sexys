"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hourglass } from "lucide-react";
import { toast } from "sonner";

import { pedirProrroga } from "@/lib/actions/employee-portal";

/**
 * Diez minutos mas de margen mientras el cliente espera.
 *
 * No es lo mismo que extender el servicio: no alarga lo pactado ni cambia lo
 * que se cobra. Es el aire que se pide cuando va con retraso y el reloj de
 * espera esta a punto de tumbar el servicio.
 *
 * En el chat era un boton que solo existia dentro de un mensaje concreto: si
 * ese mensaje quedaba sepultado bajo otros, no habia forma de pedirla, que es
 * justo lo que pasa cuando alguien va con prisa. Aqui esta siempre en el mismo
 * sitio.
 *
 * Se pide confirmacion porque solo hay tres y no se devuelven.
 */
export default function PedirProrroga({
  servicioId,
  prorrogasUsadas,
  token,
}: {
  servicioId: string;
  prorrogasUsadas: number;
  token?: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const restantes = Math.max(0, 3 - prorrogasUsadas);
  if (restantes === 0) return null;

  function solicitar() {
    startTransition(async () => {
      const resultado = await pedirProrroga(servicioId, token);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        resultado.restantes === 0
          ? "Diez minutos mas. Era la ultima."
          : `Diez minutos mas. Te quedan ${resultado.restantes}.`,
      );
      setConfirmando(false);
      router.refresh();
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-xs font-semibold uppercase tracking-wider text-gray-300 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
      >
        <Hourglass size={16} />
        Pedir 10 minutos mas
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/[0.05] p-3.5">
      <p className="mb-3 text-center text-[11px] leading-relaxed text-gray-400">
        Se avisa al chofer de que la espera se alarga.{" "}
        {restantes === 1
          ? "Es la ultima que te queda."
          : `Te quedan ${restantes} de 3.`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => setConfirmando(false)}
          className="rounded-lg border border-white/10 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={solicitar}
          className="rounded-lg border border-[#C5A55A]/50 py-2.5 text-xs font-bold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
        >
          {pendiente ? "Pidiendo" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
