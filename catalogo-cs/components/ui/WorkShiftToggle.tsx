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
    initialStatus ?? { enJornada: true, jornadaActualizadaAt: null, jornadaMotivo: null },
  );
  /*
   * El motivo se pregunta al cerrar, nunca se exige.
   *
   * Quien cierra su jornada normalmente ya terminó por hoy, así que condicionar
   * el botón a rellenar algo sería ponerle un trámite justo cuando menos ganas
   * tiene. Pero decirlo en el momento ahorra la pregunta que el jefe tendría que
   * hacer después, así que la casilla está a la vista y se puede cerrar
   * dejándola vacía.
   */
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  const cambiar = (siguiente: boolean, razon?: string) => {
    if (pending) return;

    startTransition(async () => {
      const result = await setMyWorkShift(siguiente, razon);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setStatus(result.status);
      setPidiendoMotivo(false);
      setMotivo("");
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
        aria-busy={pending}
        onClick={() =>
          status.enJornada ? setPidiendoMotivo((abierto) => !abierto) : cambiar(true)
        }
        aria-expanded={status.enJornada ? pidiendoMotivo : undefined}
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

      {status.enJornada && pidiendoMotivo && (
        <div className="mt-2 rounded-xl border border-zinc-800 bg-black p-3">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C5A55A]" htmlFor="motivo-jornada">
            ¿Por qué cierras? Opcional
          </label>
          <textarea
            id="motivo-jornada"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Si no quieres decirlo, cierra sin escribir nada"
            className="mt-2 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => cambiar(false, motivo.trim() || undefined)}
              className="rounded-lg bg-[#C5A55A] px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-black disabled:opacity-50"
            >
              Cerrar jornada
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setPidiendoMotivo(false);
                setMotivo("");
              }}
              className="rounded-lg border border-zinc-800 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <p className="mt-2 text-center text-[11px] leading-relaxed text-zinc-500">
        {status.enJornada
          ? "Estas dentro de tu jornada."
          : `Fuera de jornada${desde ? ` desde las ${desde}` : ""}.`}
      </p>

      {!status.enJornada && status.jornadaMotivo && (
        <p className="mt-1 text-center text-[11px] leading-relaxed text-zinc-600">
          {`Motivo: ${status.jornadaMotivo}`}
        </p>
      )}
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
