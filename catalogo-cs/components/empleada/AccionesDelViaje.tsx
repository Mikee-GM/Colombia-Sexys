"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPin, Navigation } from "lucide-react";

import { updateMyTripStatus } from "@/lib/actions/employee-portal";
import type { EmployeePortalActiveService } from "@/lib/types";

/**
 * Avance del viaje desde el portal.
 *
 * Estas dos acciones solo existian en el chat del bot, donde la modelo tenia
 * que localizar el mensaje correcto entre todo lo demas justo cuando mas prisa
 * hay. Los botones de Telegram siguen funcionando: esto es una segunda via, no
 * un reemplazo, y el estado que decide cual mostrar sale del viaje, asi que las
 * dos se mantienen sincronizadas solas.
 */
export default function AccionesDelViaje({
  transporte,
  token,
}: {
  transporte: NonNullable<EmployeePortalActiveService["transporte"]>;
  token?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  /*
   * `aceptado` es el viaje asignado que aun no arranca, y `en_curso` el que ya
   * va de camino. En cualquier otro estado no hay nada que marcar: o todavia se
   * esta buscando transporte, o el viaje ya termino.
   */
  const siguiente =
    transporte.estado === "aceptado"
      ? ("en_camino" as const)
      : transporte.estado === "en_curso"
        ? ("llegue" as const)
        : null;

  if (!siguiente) return null;

  const marcar = () => {
    setError(null);
    startTransition(async () => {
      const resultado = await updateMyTripStatus(
        transporte.id,
        siguiente,
        token,
      );
      if (!resultado.success) {
        setError(resultado.error ?? "No se pudo registrar el avance.");
        return;
      }
      // El servidor ya tiene el estado nuevo; se recarga para que el boton pase
      // al siguiente paso sin duplicar aqui la maquina de estados del viaje.
      router.refresh();
    });
  };

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={marcar}
        disabled={enviando}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#C5A55A] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        {siguiente === "en_camino" ? (
          <>
            <Navigation className="h-3.5 w-3.5" />
            {enviando ? "Registrando" : "Ya voy en camino"}
          </>
        ) : (
          <>
            <MapPin className="h-3.5 w-3.5" />
            {enviando ? "Registrando" : "Ya llegue"}
          </>
        )}
      </button>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
