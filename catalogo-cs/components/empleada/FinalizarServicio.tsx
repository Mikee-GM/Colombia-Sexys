"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Flag } from "lucide-react";

import { finishMyService } from "@/lib/actions/employee-portal";
import { formatCurrency } from "@/lib/calculations";

type Resumen = NonNullable<
  Awaited<ReturnType<typeof finishMyService>>["resumen"]
>;

/**
 * Cierre del servicio desde el portal.
 *
 * Pide confirmacion antes de nada porque no se puede deshacer: al cerrar se
 * fijan las horas cobradas, se abre la liquidacion y se le pide al jefe que
 * cuadre el regreso. Es el mismo doble paso que el chat.
 */
export default function FinalizarServicio({
  servicioId,
  token,
}: {
  servicioId: string;
  token?: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const finalizar = () => {
    setError(null);
    startTransition(async () => {
      const resultado = await finishMyService(servicioId, token);
      if (!resultado.success || !resultado.resumen) {
        setError(resultado.error ?? "No se pudo finalizar el servicio.");
        setConfirmando(false);
        return;
      }
      setResumen(resultado.resumen);
      setConfirmando(false);
      router.refresh();
    });
  };

  /*
   * El resumen se queda en pantalla despues del cierre: es donde la modelo lee
   * cuanto tiene que cobrarle al cliente, y perderlo al recargar la dejaria
   * teniendo que buscarlo en el chat.
   */
  if (resumen) {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          Servicio finalizado
        </p>

        <dl className="space-y-1 text-xs text-gray-300">
          <div className="flex justify-between gap-3">
            <dt className="text-gray-400">Duracion real</dt>
            <dd>{resumen.duracion}</dd>
          </div>

          {resumen.horasFacturadas ? (
            <div className="flex justify-between gap-3">
              <dt className="text-gray-400">Horas cobradas</dt>
              <dd>{resumen.horasFacturadas} (duracion abierta)</dd>
            </div>
          ) : null}

          <div className="flex justify-between gap-3">
            <dt className="text-gray-400">Metodo de pago</dt>
            <dd className="uppercase">{resumen.metodoPago}</dd>
          </div>

          <div className="flex justify-between gap-3 border-t border-white/10 pt-1.5">
            <dt className="font-semibold text-white">Debes cobrar</dt>
            <dd className="font-semibold text-[#E8D5A3]">
              {formatCurrency(resumen.totalACobrar)}
            </dd>
          </div>
        </dl>

        <p className="text-[11px] text-gray-400">
          {resumen.tieneServicioSiguiente
            ? "Tienes otro servicio agendado a continuacion."
            : "Tu jefe ya esta cuadrando tu viaje de regreso."}
        </p>
      </div>
    );
  }

  if (confirmando) {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-4">
        <p className="text-xs leading-relaxed text-gray-300">
          Al finalizar se fija el total del servicio y se le avisa a tu jefe para
          que cuadre tu regreso. Esta accion no se puede deshacer.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={finalizar}
            disabled={enviando}
            className="flex-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500 hover:text-black disabled:opacity-40"
          >
            {enviando ? "Finalizando" : "Si, finalizar"}
          </button>

          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={enviando}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-white disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>

        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500 hover:text-black"
      >
        <Flag className="h-3.5 w-3.5" />
        Finalizar servicio
      </button>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
