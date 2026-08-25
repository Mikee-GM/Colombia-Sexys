"use client";

import { useState, useTransition } from "react";
import { LogOut, Play } from "lucide-react";
import { toast } from "sonner";

import { setMyWorkShift, type WorkShiftStatus } from "@/lib/actions/work-shift";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

/**
 * Boton de jornada, comun a los paneles de jefe, chofer y empleada.
 *
 * Cerrar la jornada no es lo mismo que estar ocupado: quien esta en un servicio
 * sigue trabajando y volvera a estar libre en un rato; quien cierra su jornada
 * ya no cuenta para el resto del dia. El texto del boton lo dice asi de claro
 * para que nadie confunda una cosa con la otra.
 *
 * A quien se avisa lo decide el backend segun el rol: al jefe si es una modelo,
 * al panel de admin si es un chofer o un jefe.
 */
export default function WorkShiftToggle({
  initialStatus,
  className,
}: {
  initialStatus: WorkShiftStatus | null;
  className?: string;
}) {
  const [status, setStatus] = useState<WorkShiftStatus>(
    initialStatus ?? { enJornada: true, jornadaActualizadaAt: null },
  );
  const [pending, startTransition] = useTransition();

  const cambiar = () => {
    if (pending) return;
    const siguiente = !status.enJornada;

    startTransition(async () => {
      const result = await setMyWorkShift(siguiente);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setStatus(result.status);
      toast.success(
        siguiente
          ? "Estas de vuelta en jornada"
          : "Jornada cerrada. Ya no se te van a asignar mas trabajos hoy",
      );
    });
  };

  const desde = formatHora(status.jornadaActualizadaAt);

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={cambiar}
        aria-pressed={!status.enJornada}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
          status.enJornada
            ? "border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-[#C5A55A] hover:text-[#C5A55A]"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
        }`}
      >
        {status.enJornada ? <LogOut size={15} /> : <Play size={15} />}
        {status.enJornada ? "Terminar mi jornada" : "Volver a mi jornada"}
      </button>

      <p className="mt-2 text-center text-[11px] leading-relaxed text-zinc-500">
        {status.enJornada
          ? "Estas dentro de tu jornada."
          : `Fuera de jornada${desde ? ` desde las ${desde}` : ""}.`}
      </p>
    </div>
  );
}

function formatHora(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}
