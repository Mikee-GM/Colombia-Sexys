"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, UserCheck } from "lucide-react";
import { toast } from "sonner";

import {
  calificarEmpleada,
  getEmpleadasPorCalificar,
  type EmpleadaPorCalificar,
} from "@/lib/actions/driver-portal";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

/**
 * Calificar a la empleada de un viaje ya terminado.
 *
 * El endpoint y los botones del chat existian desde antes, pero el portal no
 * tenia de donde sacar que viaje calificar, asi que la opcion no aparecia por
 * ningun lado. Los botones del bot salen justo al cerrar el viaje: quien cerraba
 * desde el portal, o no veia el mensaje a tiempo, se quedaba sin poder calificar
 * nunca.
 *
 * La tarjeta desaparece sola cuando no queda nada por calificar, que es lo
 * normal: solo aparece los dias en los que de verdad hay algo que hacer.
 */

/** El backend exige comentario por debajo de tres estrellas. */
const ESTRELLAS_QUE_PIDEN_MOTIVO = 2;

export default function CalificarEmpleada({ token }: { token?: string }) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState<EmpleadaPorCalificar[] | null>(
    null,
  );
  const [abierto, setAbierto] = useState<string | null>(null);
  const [estrellas, setEstrellas] = useState(5);
  const [comentario, setComentario] = useState("");
  const [enviando, startTransition] = useTransition();

  const releer = useCallback(async () => {
    try {
      setPendientes(await getEmpleadasPorCalificar(token));
    } catch {
      // Sin lista no se dibuja nada; el resto del portal sigue funcionando.
      setPendientes([]);
    }
  }, [token]);

  useEffect(() => {
    void releer();
  }, [releer]);

  if (!pendientes || pendientes.length === 0) return null;

  function abrir(viajeId: string) {
    setAbierto(viajeId);
    setEstrellas(5);
    setComentario("");
  }

  function enviar(viajeId: string) {
    if (estrellas <= ESTRELLAS_QUE_PIDEN_MOTIVO && !comentario.trim()) {
      toast.error("Con una o dos estrellas hace falta que cuentes qué pasó.");
      return;
    }
    startTransition(async () => {
      const resultado = await calificarEmpleada(
        { viajeId, stars: estrellas, comment: comentario },
        token,
      );
      if (!resultado.success) {
        toast.error(resultado.error ?? "No se pudo enviar la calificación.");
        return;
      }
      toast.success("Calificación enviada");
      setAbierto(null);
      await releer();
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[#C5A55A]/40 bg-white/[0.02] p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-white">
        <UserCheck size={15} className="text-[#E8D5A3]" />
        Califica tus viajes
      </h3>
      <p className="text-[11px] leading-relaxed text-gray-400">
        Cómo se portó la pasajera: si te hizo esperar, si fue puntual, si el
        trato fue bueno.
      </p>

      <div className="space-y-2">
        {pendientes.map((pendiente) => (
          <div
            key={pendiente.viajeId}
            className="rounded-xl border border-white/5 bg-black/40 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">
                  {pendiente.empleadaNombre || "Empleada"}
                </p>
                <p className="text-[10px] capitalize text-gray-500">
                  {`Viaje de ${pendiente.tipo}`}
                  {formatFecha(pendiente.fecha)
                    ? ` · ${formatFecha(pendiente.fecha)}`
                    : ""}
                </p>
              </div>
              {abierto !== pendiente.viajeId && (
                <button
                  type="button"
                  onClick={() => abrir(pendiente.viajeId)}
                  className="shrink-0 rounded-lg border border-[#C5A55A] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black"
                >
                  Calificar
                </button>
              )}
            </div>

            {abierto === pendiente.viajeId && (
              <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
                <div className="flex items-center justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((valor) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setEstrellas(valor)}
                      aria-label={`${valor} estrellas`}
                      className={`transition-colors ${
                        valor <= estrellas
                          ? "text-amber-300"
                          : "text-gray-600 hover:text-gray-400"
                      }`}
                    >
                      <Star
                        size={26}
                        fill={valor <= estrellas ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                </div>

                <textarea
                  value={comentario}
                  onChange={(evento) => setComentario(evento.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={
                    estrellas <= ESTRELLAS_QUE_PIDEN_MOTIVO
                      ? "Cuenta qué pasó (obligatorio)"
                      : "Algo que quieras añadir (opcional)"
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-600 focus:border-[#C5A55A]"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAbierto(null)}
                    disabled={enviando}
                    className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
                  >
                    Ahora no
                  </button>
                  <button
                    type="button"
                    onClick={() => enviar(pendiente.viajeId)}
                    disabled={enviando}
                    aria-busy={enviando}
                    className="flex-1 rounded-lg border border-[#C5A55A] bg-[#C5A55A] px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-black transition-colors hover:bg-[#E8D5A3] disabled:opacity-40"
                  >
                    {enviando ? "Enviando" : "Enviar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatFecha(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}
